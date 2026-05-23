import { spawn, ChildProcess } from 'child_process'
import { HardwareDetector, ModelTier, ModelConfig, HardwareProfile } from './hardware-detector'
import { join } from 'path'
import { existsSync } from 'fs'
import os from 'os'

const OLLAMA_HOST = 'http://localhost:11434'

const OLLAMA_PATHS = {
  darwin: '/usr/local/bin/ollama',
  darwin_alt: `${os.homedir()}/.ollama/bin/ollama`,
  win32: 'C:\\Users\\' + os.userInfo().username + '\\AppData\\Local\\Programs\\Ollama\\ollama.exe',
  linux: '/usr/bin/ollama'
}

export interface OllamaStatus {
  running: boolean
  modelTier: ModelTier
  tierName: string
  models: ModelConfig
  hardware: HardwareProfile
  installedModels: string[]
  downloadProgress?: Record<string, number>
}

export class OllamaClient {
  private process: ChildProcess | null = null
  private hardware: HardwareProfile
  private models: ModelConfig
  private status: OllamaStatus
  private progressCallbacks: Array<(model: string, progress: number) => void> = []

  constructor() {
    const detector = new HardwareDetector()
    this.hardware = detector.detect()
    this.models = detector.getModelConfig(this.hardware.tier)

    this.status = {
      running: false,
      modelTier: this.hardware.tier,
      tierName: this.hardware.tierName,
      models: this.models,
      hardware: this.hardware,
      installedModels: [],
      downloadProgress: {}
    }
  }

  async start(): Promise<void> {
    // Check if Ollama is already running
    const alreadyRunning = await this.ping()
    if (alreadyRunning) {
      console.log('[Ollama] Already running')
      this.status.running = true
      await this.ensureModels()
      return
    }

    // Find Ollama binary
    const binaryPath = this.findOllamaBinary()
    if (!binaryPath) {
      console.warn('[Ollama] Binary not found — AI features disabled')
      return
    }

    // Start Ollama server
    console.log('[Ollama] Starting server...')
    this.process = spawn(binaryPath, ['serve'], {
      detached: false,
      stdio: 'pipe',
      env: { ...process.env, OLLAMA_HOST: '127.0.0.1:11434' }
    })

    this.process.on('error', (err) => {
      console.error('[Ollama] Failed to start:', err)
    })

    // Wait for Ollama to be ready
    await this.waitForReady(15000)
    this.status.running = true

    // Ensure required models are downloaded
    await this.ensureModels()
  }

  private findOllamaBinary(): string | null {
    const platform = process.platform

    const paths = [
      OLLAMA_PATHS[platform as keyof typeof OLLAMA_PATHS],
      platform === 'darwin' ? OLLAMA_PATHS.darwin_alt : null,
      'ollama' // Try PATH
    ].filter(Boolean) as string[]

    for (const p of paths) {
      try {
        if (p === 'ollama' || existsSync(p)) {
          return p
        }
      } catch { /* ignore */ }
    }
    return null
  }

  private async waitForReady(timeoutMs: number): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (await this.ping()) return
      await sleep(500)
    }
    throw new Error('Ollama failed to start within timeout')
  }

  private async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(2000) })
      return res.ok
    } catch {
      return false
    }
  }

  private async ensureModels(): Promise<void> {
    const installed = await this.listInstalledModels()
    this.status.installedModels = installed

    // Determine which models we need
    const required = [
      this.models.embed,  // Smallest — download first
      this.models.small,
      this.models.vision,
      this.models.medium,
      // Skip large model unless ultra tier
      ...(this.hardware.tier === 'TIER_4_ULTRA' ? [this.models.large] : [])
    ]

    const missing = [...new Set(required)].filter(m => !installed.includes(m))

    if (missing.length === 0) {
      console.log('[Ollama] All models ready')
      return
    }

    console.log(`[Ollama] Downloading ${missing.length} models:`, missing)

    for (const model of missing) {
      await this.downloadModel(model)
    }
  }

  private async listInstalledModels(): Promise<string[]> {
    try {
      const res = await fetch(`${OLLAMA_HOST}/api/tags`)
      const data = await res.json() as { models: Array<{ name: string }> }
      return data.models.map(m => m.name)
    } catch {
      return []
    }
  }

  private async downloadModel(model: string): Promise<void> {
    console.log(`[Ollama] Pulling model: ${model}`)

    try {
      const res = await fetch(`${OLLAMA_HOST}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model, stream: true })
      })

      if (!res.body) return

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const lines = decoder.decode(value).split('\n').filter(Boolean)
        for (const line of lines) {
          try {
            const data = JSON.parse(line)
            if (data.total && data.completed) {
              const progress = Math.floor((data.completed / data.total) * 100)
              this.status.downloadProgress![model] = progress
              this.progressCallbacks.forEach(cb => cb(model, progress))
            }
          } catch { /* ignore parse errors */ }
        }
      }

      this.status.installedModels.push(model)
      delete this.status.downloadProgress![model]
      console.log(`[Ollama] Model ready: ${model}`)
    } catch (e) {
      console.error(`[Ollama] Failed to download ${model}:`, e)
    }
  }

  async generate(prompt: string, modelType: 'small' | 'medium' | 'large' | 'vision' = 'medium'): Promise<string> {
    const model = this.models[modelType]

    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_ctx: 4096
        }
      })
    })

    const data = await res.json() as { response: string }
    return data.response
  }

  async chat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    modelType: 'small' | 'medium' | 'large' = 'medium',
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const model = this.models[modelType]

    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: !!onChunk,
        options: { temperature: 0.7, top_p: 0.9 }
      })
    })

    if (!onChunk) {
      const data = await res.json() as { message: { content: string } }
      return data.message.content
    }

    // Stream mode
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let full = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const lines = decoder.decode(value).split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const data = JSON.parse(line) as { message?: { content: string }; done?: boolean }
          if (data.message?.content) {
            full += data.message.content
            onChunk(data.message.content)
          }
        } catch { /* ignore */ }
      }
    }

    return full
  }

  getStatus(): OllamaStatus {
    return this.status
  }

  onDownloadProgress(cb: (model: string, progress: number) => void): void {
    this.progressCallbacks.push(cb)
  }

  stop(): void {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
