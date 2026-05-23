/**
 * LlamaClient — uses llama-server (OpenAI-compatible HTTP API)
 * 
 * Model loads ONCE at startup and stays hot in RAM.
 * Every query is a fast HTTP POST — no subprocess spawning overhead.
 */

import { spawn, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { EventEmitter } from 'events'
import os from 'os'
import http from 'http'

const SERVER_BINARY = '/opt/homebrew/bin/llama-server'
const GGUF_PATH = '/Users/sanjeevn/Downloads/Operator OS/stealth-engine-3b.gguf'
const SERVER_HOST = '127.0.0.1'
const SERVER_PORT = 18742   // non-standard port to avoid conflicts

export interface LlamaStatus {
  running: boolean
  modelPath: string
  modelName: string
  binaryPath: string
  gpuLayers: number
  ready: boolean
}

export class LlamaClient extends EventEmitter {
  private serverProc: ChildProcess | null = null
  private gpuLayers: number
  private status: LlamaStatus
  private baseUrl = `http://${SERVER_HOST}:${SERVER_PORT}`

  constructor() {
    super()
    this.gpuLayers = process.platform === 'darwin' && os.arch() === 'arm64' ? 999 : 0
    this.status = {
      running: false,
      modelPath: GGUF_PATH,
      modelName: 'stealth-engine-3b',
      binaryPath: SERVER_BINARY,
      gpuLayers: this.gpuLayers,
      ready: false
    }
  }

  async start(): Promise<void> {
    if (!existsSync(SERVER_BINARY)) {
      console.error('[LlamaClient] llama-server not found at', SERVER_BINARY)
      return
    }
    if (!existsSync(GGUF_PATH)) {
      console.error('[LlamaClient] GGUF not found at', GGUF_PATH)
      return
    }

    // Kill any leftover server from a previous run
    await this.stopServer()

    const args = [
      '--model',         GGUF_PATH,
      '--host',          SERVER_HOST,
      '--port',          String(SERVER_PORT),
      '--n-gpu-layers',  String(this.gpuLayers),
      '--ctx-size',      '8192',
      '--threads',       String(Math.max(4, os.cpus().length - 2)),
      '--log-disable',
      '--parallel',      '1',   // single request at a time
    ]

    console.log('[LlamaClient] Starting llama-server on port', SERVER_PORT, '...')
    this.serverProc = spawn(SERVER_BINARY, args, {
      stdio: ['ignore', 'ignore', 'ignore'] // fully silent
    })

    this.serverProc.on('exit', (code) => {
      if (code !== null && code !== 0) {
        console.warn('[LlamaClient] llama-server exited with code', code)
      }
      this.status.running = false
      this.status.ready = false
    })

    // Poll until the server is up (it takes a few seconds to load the model)
    const ready = await this.waitForServer(60_000)
    if (ready) {
      this.status.running = true
      this.status.ready = true
      console.log(`[LlamaClient] ✓ llama-server ready  model=${this.status.modelName}  gpu=${this.gpuLayers}`)
    } else {
      console.error('[LlamaClient] Server failed to start within 60 seconds')
    }
  }

  private waitForServer(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs
      const check = () => {
        if (Date.now() > deadline) { resolve(false); return }
        const req = http.get(`${this.baseUrl}/health`, (res) => {
          if (res.statusCode === 200) {
            resolve(true)
          } else {
            setTimeout(check, 1000)
          }
        })
        req.on('error', () => setTimeout(check, 1000))
        req.setTimeout(2000, () => { req.destroy(); setTimeout(check, 1000) })
      }
      check()
    })
  }

  /**
   * Send a chat completion request to the local llama-server.
   * Returns just the assistant's response text — clean, no llama.cpp noise.
   */
  async generate(
    prompt: string,
    options: { maxTokens?: number; temperature?: number } = {}
  ): Promise<string> {
    if (!this.status.ready) return '[AI not ready — model is loading]'

    const { maxTokens = 400, temperature = 0.72 } = options

    const body = JSON.stringify({
      model: 'local',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature,
      stream: false,
    })

    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: SERVER_HOST,
        port: SERVER_PORT,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (d: Buffer) => chunks.push(d))
        res.on('end', () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            const text = json?.choices?.[0]?.message?.content || json?.content || ''
            resolve(text.trim())
          } catch (e) {
            reject(new Error('Failed to parse llama-server response: ' + e))
          }
        })
      })

      req.on('error', reject)
      req.setTimeout(90_000, () => {
        req.destroy()
        reject(new Error('llama-server request timed out'))
      })
      req.write(body)
      req.end()
    })
  }

  /**
   * Chat format — passes messages array directly to the OpenAI-compatible API.
   */
  async chat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options: { maxTokens?: number; temperature?: number } = {}
  ): Promise<string> {
    if (!this.status.ready) return '[AI not ready — model is loading]'

    const { maxTokens = 400, temperature = 0.72 } = options

    const body = JSON.stringify({
      model: 'local',
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false,
      response_format: options.response_format,
    })

    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: SERVER_HOST,
        port: SERVER_PORT,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (d: Buffer) => chunks.push(d))
        res.on('end', () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            const text = json?.choices?.[0]?.message?.content || json?.content || ''
            resolve(text.trim())
          } catch (e) {
            reject(new Error('Failed to parse response'))
          }
        })
      })
      req.on('error', reject)
      req.setTimeout(90_000, () => { req.destroy(); reject(new Error('timeout')) })
      req.write(body)
      req.end()
    })
  }

  private stopServer(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.serverProc) { resolve(); return }
      this.serverProc.kill('SIGTERM')
      setTimeout(resolve, 500)
    })
  }

  getStatus(): LlamaStatus { return { ...this.status } }

  stop(): void {
    this.stopServer()
    this.status.running = false
    this.status.ready = false
  }
}
