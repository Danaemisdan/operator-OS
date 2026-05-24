import { contextBridge, ipcRenderer } from 'electron'

// ─── Type Definitions ─────────────────────────────────────────────────────────
export interface TabInfo {
  id: string
  platform: string
  url: string
  title: string
  loginStatus: string
  active: boolean
}

export interface AIStatus {
  running: boolean
  modelTier: string
  models: Record<string, string>
  downloadProgress?: number
}

// ─── Expose safe IPC bridge to renderer ──────────────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  // Browser / Tab control
  browser: {
    openTab: (platform: string) =>
      ipcRenderer.invoke('browser:open-tab', platform),
    switchTab: (platform: string) =>
      ipcRenderer.invoke('browser:switch-tab', platform),
    setViewState: (state: string) =>
      ipcRenderer.invoke('browser:set-view-state', state),
    closeTab: (platform: string) =>
      ipcRenderer.invoke('browser:close-tab', platform),
    navigate: (platform: string, url: string) =>
      ipcRenderer.invoke('browser:navigate', { platform, url }),
    getTabs: () =>
      ipcRenderer.invoke('browser:get-tabs'),
    getLoginStatus: () =>
      ipcRenderer.invoke('browser:get-login-status'),
    onTabsUpdated: (cb: (tabs: TabInfo[]) => void) => {
      ipcRenderer.on('browser:tabs-updated', (_, tabs) => cb(tabs))
      return () => ipcRenderer.removeAllListeners('browser:tabs-updated')
    },
    toggleRecording: (state: boolean) => 
      ipcRenderer.invoke('browser:toggle-recording', state),
    onRecordedEvent: (cb: (data: any) => void) => {
      ipcRenderer.on('browser:recorded-event-received', (_, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('browser:recorded-event-received')
    },
    recordManualEvent: (eventData: any) =>
      ipcRenderer.invoke('browser:record-manual-event', eventData),
    startPicker: () =>
      ipcRenderer.invoke('browser:start-picker'),
    stopPicker: () =>
      ipcRenderer.invoke('browser:stop-picker'),
    onElementPicked: (cb: (data: any) => void) => {
      ipcRenderer.on('browser:element-picked', (_, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('browser:element-picked')
    },
    onPickerCancelled: (cb: () => void) => {
      ipcRenderer.on('browser:picker-cancelled', () => cb())
      return () => ipcRenderer.removeAllListeners('browser:picker-cancelled')
    }
  },

  // Platform login
  platform: {
    checkLogin: (platform: string) =>
      ipcRenderer.invoke('platform:check-login', platform),
    onLoginRequired: (cb: (data: { platform: string; message: string }) => void) => {
      ipcRenderer.on('platform:login-required', (_, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('platform:login-required')
    },
    onLoginStatus: (cb: (data: { platform: string; status: string }) => void) => {
      ipcRenderer.on('platform:login-status', (_, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('platform:login-status')
    }
  },

  // Workflow execution
  workflow: {
    execute: (workflow: unknown) =>
      ipcRenderer.invoke('workflow:execute', workflow),
    saveReference: (name: string, content: string) =>
      ipcRenderer.invoke('workflow:save-reference', { name, content }),
    list: () =>
      ipcRenderer.invoke('workflow:list'),
    read: (filename: string) =>
      ipcRenderer.invoke('workflow:read', filename),
    saveRaw: (filename: string, content: string) =>
      ipcRenderer.invoke('workflow:save-raw', { filename, content }),
    delete: (filename: string) =>
      ipcRenderer.invoke('workflow:delete', filename),
    // Studio Play button — run graph directly in the active browser
    test: (content: string) =>
      ipcRenderer.invoke('workflow:test', content),
    onTestLog: (cb: (entry: { level: string; message: string }) => void) => {
      ipcRenderer.on('workflow:test-log', (_, entry) => cb(entry))
      return () => ipcRenderer.removeAllListeners('workflow:test-log')
    },
    onTestNodeActive: (cb: (data: { nodeId: string }) => void) => {
      ipcRenderer.on('workflow:test-node-active', (_, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('workflow:test-node-active')
    },
    onTestEdgeActive: (cb: (data: { source: string, target: string }) => void) => {
      ipcRenderer.on('workflow:test-edge-active', (_, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('workflow:test-edge-active')
    }
  },

  // AI (llama-server)
  ai: {
    generate: (payload: { messages?: unknown[]; prompt?: string; model?: string }) =>
      ipcRenderer.invoke('ai:generate', payload),
    getStatus: () =>
      ipcRenderer.invoke('ai:status'),
    onReady: (cb: (status: AIStatus) => void) => {
      ipcRenderer.on('ai:ready', (_, status) => cb(status))
      return () => ipcRenderer.removeAllListeners('ai:ready')
    }
  },

  // Agent — skill orchestrator
  agent: {
    run: (message: string) =>
      ipcRenderer.invoke('agent:run', { message }),
    onActivity: (cb: (event: ActivityEvent) => void) => {
      ipcRenderer.on('activity:event', (_, event) => cb(event))
      return () => ipcRenderer.removeAllListeners('activity:event')
    }
  },

  // Profile setup
  profile: {
    import: (profilePath: string) =>
      ipcRenderer.invoke('profile:import', profilePath),
    completeSetup: () =>
      ipcRenderer.invoke('profile:complete-setup'),
    onFirstLaunch: (cb: (data: { chromeProfiles: unknown[] }) => void) => {
      ipcRenderer.on('app:first-launch', (_, data) => cb(data))
      return () => ipcRenderer.removeAllListeners('app:first-launch')
    }
  },

  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },

  // Activity stream (operator actions)
  activity: {
    onUpdate: (cb: (event: ActivityEvent) => void) => {
      ipcRenderer.on('activity:update', (_, event) => cb(event))
      return () => ipcRenderer.removeAllListeners('activity:update')
    }
  }
})

export interface ActivityEvent {
  id: string
  timestamp: number
  type: 'action' | 'success' | 'error' | 'thinking' | 'info'
  platform?: string
  message: string
  detail?: string
}
