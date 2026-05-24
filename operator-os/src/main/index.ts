import {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  shell,
  nativeTheme,
  protocol
} from 'electron'
import { join } from 'path'
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
import { BrowserManager } from './browser-manager'
import { LlamaClient } from './llama-client'
import { ProfileManager } from './profile-manager'
import { HardwareDetector } from './hardware-detector'
import { Orchestrator } from './skills/orchestrator'
import { loadUserSkillsDir, loadUserStepsDir, loadSkillFile } from './skills/importer'
import { campaignManager } from './campaign-manager'
import { tasksDB } from './tasks-db'

// Force dark mode
nativeTheme.themeSource = 'dark'

// Apply stealth flags before anything else
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')
app.commandLine.appendSwitch('disable-features', 'ChromeWhatsNewUI,PrivacySandboxSettings4')
app.commandLine.appendSwitch('no-first-run')
app.commandLine.appendSwitch('no-default-browser-check')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

// ─── GPU Safety: Prevent GPU crashes from taking down the host OS ─────────────
// Electron's GPU process has been observed crashing macOS graphics drivers
// on Apple Silicon / certain Intel Macs. Disable compositing to use CPU path.
app.commandLine.appendSwitch('disable-gpu-compositing')
app.commandLine.appendSwitch('disable-software-rasterizer')
app.commandLine.appendSwitch('disable-gpu-sandbox')
// Prevent GPU process from crashing the whole app repeatedly
app.commandLine.appendSwitch('in-process-gpu')

// ─── CRITICAL: Strip Electron from user agent app-wide ───────────────────────
// Google, LinkedIn and others block sign-in if they detect "Electron" in UA.
// This must be set before app is ready.
const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
app.userAgentFallback = CHROME_UA

const SIDEBAR_WIDTH = 340
const TITLEBAR_HEIGHT = 40
const TOOLBAR_HEIGHT = 48

let mainWindow: BrowserWindow | null = null
let browserManager: BrowserManager | null = null
let llamaClient: LlamaClient | null = null
let orchestrator: Orchestrator | null = null

// Recording State
let isRecording = false
let recordedEvents: any[] = []

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,          // Custom titlebar
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 12 },
    backgroundColor: '#05050A',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  // Load the sidebar React app
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Initialize browser manager (handles WebContentsViews for platforms)
  browserManager = new BrowserManager(mainWindow, SIDEBAR_WIDTH, TITLEBAR_HEIGHT)

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
    setupBrowserViews()
  })

  browserManager.on('navigate', ({ platform, url }) => {
    if (isRecording) {
      const data = { type: 'navigate', url }
      recordedEvents.push(data)
      mainWindow?.webContents.send('browser:recorded-event-received', data)
    }
  })

  mainWindow.on('resize', () => {
    if (browserManager) browserManager.relayout()
  })

  // Open external links in system browser, not in our app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
}

async function setupBrowserViews(): Promise<void> {
  if (!browserManager) return

  // Check first-launch state
  const profileManager = new ProfileManager()
  const isFirstLaunch = await profileManager.isFirstLaunch()

  if (isFirstLaunch) {
    // Show profile wizard — don't open platform tabs yet
    mainWindow?.webContents.send('app:first-launch', {
      chromeProfiles: await profileManager.detectChromeProfiles()
    })
    return
  }

  // Open default tab (dashboard/home)
  await browserManager.openTab('home', 'about:blank')
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle('browser:open-tab', async (_, platform: string) => {
  if (!browserManager) return
  const urls: Record<string, string> = {
    linkedin: 'https://www.linkedin.com',
    twitter: 'https://x.com',
    instagram: 'https://www.instagram.com',
    whatsapp: 'https://web.whatsapp.com',
    telegram: 'https://web.telegram.org',
    reddit: 'https://www.reddit.com',
    youtube: 'https://www.youtube.com',
  }
  const url = urls[platform] || 'about:blank'
  // User-initiated click: always focus the tab
  await browserManager.openTab(platform, url, { focus: true })
  return { success: true }
})

ipcMain.handle('browser:switch-tab', async (_, platform: string) => {
  if (!browserManager) return
  browserManager.switchToTab(platform)
  return { success: true }
})

ipcMain.handle('browser:get-tabs', async () => {
  if (!browserManager) return []
  return browserManager.getTabList()
})

ipcMain.handle('browser:get-login-status', async () => {
  if (!browserManager) return {}
  return browserManager.getLoginStatus()
})

ipcMain.handle('browser:close-tab', async (_, platform: string) => {
  if (!browserManager) return
  browserManager.closeTab(platform)
  return { success: true }
})

ipcMain.handle('platform:check-login', async (_, platform: string) => {
  if (!browserManager) return { loggedIn: false }
  const status = await browserManager.checkPlatformLogin(platform)
  return status
})

ipcMain.handle('browser:navigate', async (_, { platform, url }: { platform: string, url: string }) => {
  return browserManager?.navigate(platform, url)
})

ipcMain.handle('campaign:start', async (_, { platform, url }: { platform: string, url: string }) => {
  return campaignManager.startCampaign(platform, url)
})

// ─── Tasks Dashboard ─────────────────────────────────────────────────────────

ipcMain.handle('tasks:get-all', async () => {
  return tasksDB.getAllTasks()
})

ipcMain.handle('browser:set-view-state', async (_, state: string) => {
  if (browserManager) {
    browserManager.setViewState(state)
  }
  return true
})

ipcMain.handle('browser:record-manual-event', async (_, eventData: any) => {
  if (!isRecording) return false
  mainWindow?.webContents.send('browser:recorded-event-received', eventData)
  return true
})

ipcMain.handle('browser:toggle-recording', async (_, state: boolean) => {
  isRecording = state
  if (!state) {
    const events = [...recordedEvents]
    recordedEvents = []
    return events
  }
  return true
})

ipcMain.on('browser:record-event', (_, data) => {
  if (isRecording) {
    recordedEvents.push(data)
    mainWindow?.webContents.send('browser:recorded-event-received', data)
  }
})

// Visual Element Picker Relays
ipcMain.handle('browser:start-picker', async () => {
  if (!browserManager) return false
  const activeView = browserManager.getActiveView()
  if (!activeView) return false
  activeView.webContents.send('browser:start-picker')
  return true
})

ipcMain.handle('browser:stop-picker', async () => {
  if (!browserManager) return false
  const activeView = browserManager.getActiveView()
  if (!activeView) return false
  activeView.webContents.send('browser:stop-picker')
  return true
})

ipcMain.on('browser:element-picked', (_, data) => {
  mainWindow?.webContents.send('browser:element-picked', data)
})

ipcMain.on('browser:picker-cancelled', () => {
  mainWindow?.webContents.send('browser:picker-cancelled')
})

ipcMain.handle('workflow:execute', async (_, workflow: unknown) => {
  console.log('[Main] Executing workflow:', workflow)
  // TODO: Route to operator
  return { success: true, taskId: `task_${Date.now()}` }
})

// ─── Test Flow (Studio Play Button) ──────────────────────────────────────────
// Receives the raw JSON content of the currently-open skill, compiles it on the
// fly, and runs it in the active browser view — streaming log events back to the
// Studio so the user sees every step in real-time.
ipcMain.handle('workflow:test', async (event, skillContent: string) => {
  if (!browserManager) return { success: false, error: 'Browser not ready' }
  
  let parsed: any
  try {
    parsed = JSON.parse(skillContent)
  } catch (e) {
    return { success: false, error: `JSON parse error: ${String(e)}` }
  }

  const definition = parsed?.skills?.[0]
  if (!definition) return { success: false, error: 'No skill definition found' }

  const activeView = browserManager.getActiveView()
  if (!activeView) return { success: false, error: 'No active browser view — make sure a platform tab is open' }

  const { StepInterpreter } = await import('./skills/importer')
  const logStream: Array<{level: string, message: string}> = []

  const wc = activeView.webContents

  // Build a full, properly-typed SkillContext
  const ctx = {
    view: activeView,
    inputs: {} as Record<string, unknown>,
    log: (message: string, level = 'info') => {
      logStream.push({ level, message })
      event.sender.send('workflow:test-log', { level, message })
    },
    wait: (minMs: number, maxMs?: number) => {
      const max = maxMs ?? minMs * 2
      const delay = minMs + Math.random() * (max - minMs)
      return new Promise<void>(r => setTimeout(r, delay))
    },
    ai: llamaClient
      ? (prompt: string) => llamaClient!.generate(prompt, { maxTokens: 800 })
      : undefined,
    extractText: async (selector: string) => {
      return wc.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.innerText || ''`) as Promise<string>
    },
    evaluate: <T = unknown>(js: string) => wc.executeJavaScript(js) as Promise<T>,
    setActiveNode: (nodeId: string) => {
      event.sender.send('workflow:test-node-active', { nodeId })
    },
    setActiveEdge: (source: string, target: string) => {
      event.sender.send('workflow:test-edge-active', { source, target })
    }
  }

  try {
    // Pass empty inputs ({}) as second argument — required by StepInterpreter constructor
    const interpreter = new StepInterpreter(ctx as any, {})
    const result = await interpreter.run(definition)
    event.sender.send('workflow:test-log', {
      level: result.success ? 'success' : 'error',
      message: result.success ? 'Workflow completed!' : `${result.error}`
    })
    return { success: result.success, logs: logStream, outputs: result.outputs, error: result.error }
  } catch (e) {
    const err = String(e)
    event.sender.send('workflow:test-log', { level: 'error', message: `${err}` })
    return { success: false, error: err, logs: logStream }
  }
})

function getStepsDir() {
  const fs = require('fs')
  const path = require('path')
  const isDev = !app.isPackaged
  const stepsDir = isDev 
    ? path.join(__dirname, '../../steps')
    : path.join(app.getPath('userData'), 'operator-os', 'steps')
  if (!fs.existsSync(stepsDir)) fs.mkdirSync(stepsDir, { recursive: true })
  return stepsDir
}

ipcMain.handle('workflow:save-reference', async (_, { name, content }: { name: string, content: string }) => {
  const fs = require('fs')
  const path = require('path')
  const stepsDir = getStepsDir()
  
  const safeName = name.replace(/[^a-z0-9\/]/gi, '_').toLowerCase()
  const filePath = path.join(stepsDir, `recorded_${safeName}.json`)
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, content, 'utf8')
  return { success: true, filePath }
})

ipcMain.handle('workflow:list', async () => {
  const fs = require('fs')
  const path = require('path')
  const stepsDir = getStepsDir()
  try {
    const getAllFiles = (dir: string): string[] => {
      let results: string[] = []
      const list = fs.readdirSync(dir)
      list.forEach((file: string) => {
        const fullPath = path.join(dir, file)
        const stat = fs.statSync(fullPath)
        if (stat && stat.isDirectory()) {
          results = results.concat(getAllFiles(fullPath))
        } else if (file.endsWith('.json')) {
          results.push(fullPath)
        }
      })
      return results
    }
    const files = getAllFiles(stepsDir)
    return files.map((f: string) => {
      const filename = path.relative(stepsDir, f)
      let platform = 'unknown'
      try {
        const content = fs.readFileSync(f, 'utf8')
        const parsed = JSON.parse(content)
        if (parsed?.skills?.[0]?.platform) {
          platform = parsed.skills[0].platform
        }
      } catch (e) {}
      return { filename, platform }
    })
  } catch (e) {
    return []
  }
})

ipcMain.handle('workflow:read', async (_, filename: string) => {
  const fs = require('fs')
  const path = require('path')
  const stepsDir = getStepsDir()
  try {
    const filePath = path.join(stepsDir, filename)
    const content = fs.readFileSync(filePath, 'utf8')
    return { success: true, content }
  } catch (e) {
    return { success: false, error: String(e) }
  }
})

ipcMain.handle('workflow:save-raw', async (_, { filename, content }: { filename: string, content: string }) => {
  const fs = require('fs')
  const path = require('path')
  const stepsDir = getStepsDir()
  try {
    const filePath = path.join(stepsDir, filename)
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, content, 'utf8')
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
})

ipcMain.handle('workflow:delete', async (_, filename: string) => {
  const fs = require('fs')
  const path = require('path')
  const stepsDir = getStepsDir()
  try {
    const filePath = path.join(stepsDir, filename)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
})

ipcMain.handle('ai:generate', async (_, { prompt, messages }: { prompt?: string; messages?: Array<{role: string; content: string}> }) => {
  if (!llamaClient) return { error: 'AI not ready' }
  try {
    let response: string
    if (messages && messages.length > 0) {
      // Use chat() with messages array — clean OpenAI format
      response = await llamaClient.chat(messages as any, { maxTokens: 400 })
    } else if (prompt) {
      response = await llamaClient.generate(prompt, { maxTokens: 400 })
    } else {
      return { error: 'No prompt provided' }
    }
    console.log('[AI] ✓ response:', response.slice(0, 100))
    return { success: true, response }
  } catch (e) {
    console.error('[AI] error:', e)
    return { error: String(e) }
  }
})

ipcMain.handle('ai:status', async () => {
  if (!llamaClient) return { running: false }
  return llamaClient.getStatus()
})

ipcMain.handle('agent:run', async (_, { message }: { message: string }) => {
  if (!orchestrator) return { error: 'Orchestrator not ready — AI still loading' }
  try {
    const result = await orchestrator.run(message)
    return { success: true, ...result }
  } catch (e) {
    console.error('[Orchestrator] error:', e)
    return { error: String(e) }
  }
})

ipcMain.handle('profile:import', async (_, profilePath: string) => {
  const profileManager = new ProfileManager()
  const success = await profileManager.importProfile(profilePath)
  return { success }
})

ipcMain.handle('profile:complete-setup', async () => {
  const profileManager = new ProfileManager()
  await profileManager.markSetupComplete()
  // Now open platform tabs
  await setupBrowserViews()
  return { success: true }
})

// ─── Skills IPC ───────────────────────────────────────────────────────────────

/** Import a skill file by absolute path. Returns { loaded, errors }. */
ipcMain.handle('skills:import-file', async (_, filePath: string) => {
  return loadSkillFile(filePath)
})

/** List all currently registered skill IDs and their descriptions. */
ipcMain.handle('skills:list', async () => {
  const { SKILL_REGISTRY } = await import('./skills/registry')
  return SKILL_REGISTRY.map(s => ({
    id: s.id,
    platform: s.platform,
    name: s.name,
    description: s.description,
    inputs: s.inputs,
    outputs: s.outputs
  }))
})

ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})
ipcMain.handle('window:close', () => mainWindow?.close())

// ─── App Lifecycle ────────────────────────────────────────────────────────────

// Register custom protocol BEFORE app is ready (required by Electron)
protocol.registerSchemesAsPrivileged([
  { scheme: 'operator', privileges: { standard: true, secure: true } }
])

app.whenReady().then(async () => {
  await createMainWindow()

  // Start llama.cpp with local GGUF
  llamaClient = new LlamaClient()
  llamaClient.start().then(() => {
    const status = llamaClient!.getStatus()

    // Wire up the orchestrator once the model is ready
    orchestrator = new Orchestrator(
      llamaClient!,
      // getTab — returns existing view or null
      (platform: string) => browserManager?.getViewForPlatform(platform) || null,
      // openTab — opens a new tab and returns the view
      async (platform: string) => {
        const PLATFORM_URLS: Record<string, string> = {
          linkedin: 'https://www.linkedin.com',
          twitter: 'https://x.com',
          instagram: 'https://www.instagram.com',
          whatsapp: 'https://web.whatsapp.com',
          telegram: 'https://web.telegram.org',
          reddit: 'https://www.reddit.com',
          youtube: 'https://www.youtube.com',
        }
        const url = PLATFORM_URLS[platform] || 'about:blank'
        if (!browserManager) return null
        try {
          const view = await browserManager.openTab(platform, url)
          return view
        } catch {
          return null
        }
      },
      // onActivity
      (event) => mainWindow?.webContents.send('activity:event', event),
      // onLoginRequired
      (platform: string) => {
        browserManager?.switchToTab(platform)
        mainWindow?.webContents.send('platform:login-required', {
          platform,
          message: `Please log in to ${platform} — I've opened the login page for you.`
        })
      }
    )

    mainWindow?.webContents.send('ai:ready', {
      running: status.ready,
      tierName: `llama.cpp · ${status.modelName} · ${status.gpuLayers > 0 ? 'GPU' : 'CPU'}`,
    })
    console.log('[Main] Orchestrator ready')
  }).catch(console.error)

  // Load user-defined atomic steps from <userData>/operator-os/steps/
  loadUserStepsDir()
  // Load user-defined intent workflows from <userData>/operator-os/skills/
  loadUserSkillsDir()

  // Initialize the Campaign Manager background cron loop
  setInterval(() => {
    const pending = campaignManager.getPendingCampaigns()
    if (pending.length > 0 && orchestrator) {
      console.log(`[CampaignManager] Cron woke up. Processing ${pending.length} pending campaigns...`)
      for (const campaign of pending) {
        orchestrator.run(`Execute scheduled campaign followup for campaignId: ${campaign.id}`).catch(console.error)
        campaignManager.updateStatus(campaign.id, 'condition_met')
      }
    }
  }, 1000 * 60 * 60) // Check every 1 hour

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Prevent second instance
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}
