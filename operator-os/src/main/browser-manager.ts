import { BrowserWindow, WebContentsView, ipcMain, session } from 'electron'
import { join } from 'path'
import { EventEmitter } from 'events'

const PLATFORM_URLS: Record<string, string> = {
  linkedin: 'https://www.linkedin.com',
  twitter: 'https://x.com',
  instagram: 'https://www.instagram.com',
  whatsapp: 'https://web.whatsapp.com',
  telegram: 'https://web.telegram.org',
  reddit: 'https://www.reddit.com',
  youtube: 'https://www.youtube.com',
  home: 'about:blank'
}

const LOGIN_SELECTORS: Record<string, { loggedIn: string; loggedOut: string }> = {
  linkedin: {
    loggedIn: '.global-nav__me, [data-control-name="nav.homepage"]',
    loggedOut: '.nav__button-secondary, #session_key'
  },
  twitter: {
    loggedIn: '[data-testid="SideNav_AccountSwitcher_Button"]',
    loggedOut: '[data-testid="loginButton"], [href="/login"]'
  },
  instagram: {
    loggedIn: '[aria-label="Home"], ._acan._acap',
    loggedOut: 'input[name="username"]'
  },
  whatsapp: {
    loggedIn: '#side, [data-testid="chat-list"]',
    loggedOut: '[data-testid="qrcode"], canvas'
  }
}

interface TabInfo {
  id: string
  platform: string
  url: string
  title: string
  view: WebContentsView
  loginStatus: 'unknown' | 'logged_in' | 'logged_out' | 'needs_verification'
}

export class BrowserManager extends EventEmitter {
  private mainWindow: BrowserWindow
  private tabs: Map<string, TabInfo> = new Map()
  private activeTabId: string | null = null
  private currentViewState: string = 'chat'
  private sidebarWidth: number
  private titlebarHeight: number
  private stealthPreloadPath: string

  constructor(mainWindow: BrowserWindow, sidebarWidth: number, titlebarHeight: number) {
    super()
    this.mainWindow = mainWindow
    this.sidebarWidth = sidebarWidth
    this.titlebarHeight = titlebarHeight
    this.stealthPreloadPath = join(__dirname, '../preload/stealth.js')

    this.mainWindow.on('resize', () => this.relayout())
  }

  async openTab(platform: string, url: string, opts: { focus?: boolean } = {}): Promise<WebContentsView> {
    // If tab already exists: return it WITHOUT switching focus.
    // The agent can use the webcontents in the background without stealing the UI.
    // Only focus if explicitly requested (e.g. user clicked in sidebar).
    if (this.tabs.has(platform)) {
      if (opts.focus) this.switchToTab(platform)
      return this.tabs.get(platform)!.view
    }

    const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

    // Popups (e.g. linkedin_popup) MUST share the parent's session
    // so Google OAuth sees the same cookies and gets the same UA overrides.
    const basePlatform = platform.includes('_popup')
      ? platform.replace('_popup', '')
      : platform
    const partition = `persist:operator-${basePlatform}`

    const view = new WebContentsView({
      webPreferences: {
        preload: this.stealthPreloadPath,
        partition,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        backgroundThrottling: false,
      }
    })

    // Override UA at both view and session level — Google checks both
    view.webContents.setUserAgent(CHROME_UA)
    const ses = session.fromPartition(partition)
    ses.setUserAgent(CHROME_UA)

    // Inject real Chrome client-hint headers on every request.
    // Only register once per session (skip if already registered for this partition).
    try {
      ses.webRequest.onBeforeSendHeaders((details, callback) => {
        const headers = { ...details.requestHeaders }
        const isGoogleAuth = details.url.includes('accounts.google.com') || details.url.includes('oauth')

        if (isGoogleAuth) {
          // CRITICAL BYPASS: Google allows Firefox without the Chromium-specific automation checks.
          headers['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0'
          delete headers['sec-ch-ua']
          delete headers['sec-ch-ua-mobile']
          delete headers['sec-ch-ua-platform']
        } else {
          headers['User-Agent'] = CHROME_UA
          headers['sec-ch-ua'] = '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"'
          headers['sec-ch-ua-mobile'] = '?0'
          headers['sec-ch-ua-platform'] = '"macOS"'
        }
        delete headers['X-Electron-Version']
        callback({ requestHeaders: headers })
      })
    } catch { /* already registered for this partition */ }

    const tabInfo: TabInfo = {
      id: platform,
      platform,
      url,
      title: platform,
      view,
      loginStatus: 'unknown'
    }

    this.tabs.set(platform, tabInfo)
    this.mainWindow.contentView.addChildView(view)

    // Position off-screen initially
    view.setBounds({ x: -9999, y: -9999, width: 100, height: 100 })

    // Navigate to URL
    if (url !== 'about:blank') {
      await view.webContents.loadURL(url)
    }

    // Track title changes
    view.webContents.on('page-title-updated', (_, title) => {
      tabInfo.title = title
      this.emitTabUpdate()
    })

    // Track URL changes (full navigation)
    view.webContents.on('did-navigate', (_, navUrl) => {
      tabInfo.url = navUrl
      this.emitTabUpdate()
      this.relayout()
      this.emit('navigate', { platform, url: navUrl })
      // Check login state after navigation
      setTimeout(() => this.checkPlatformLogin(platform), 2000)
    })

    // Track in-page URL changes (SPA navigation like React/LinkedIn)
    view.webContents.on('did-navigate-in-page', (_, navUrl, isMainFrame) => {
      if (isMainFrame) {
        tabInfo.url = navUrl
        this.emitTabUpdate()
        this.relayout()
        this.emit('navigate', { platform, url: navUrl })
      }
    })

    // Handle new windows — open in our tab system unless it's an OAuth popup
    view.webContents.setWindowOpenHandler(({ url: newUrl }) => {
      // Allow OAuth popups to open as native windows so window.opener works!
      if (newUrl.includes('accounts.google.com') || newUrl.includes('oauth')) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 520,
            height: 640,
            titleBarStyle: 'default',
            webPreferences: {
              preload: this.stealthPreloadPath,
              partition, // CRITICAL: must share the same partition so headers are injected
              contextIsolation: true,
              nodeIntegration: false
            }
          }
        }
      }
      this.openTab(`${platform}_popup`, newUrl)
      return { action: 'deny' }
    })

    // When the OAuth popup opens, set up its UA AND give it its own window-open
    // handler so that Google's "Try again" button (which opens a child window from
    // within the popup) is not silently blocked by Electron's default deny.
    view.webContents.on('did-create-window', (popupWin, details) => {
      const isGoogle = details.url.includes('accounts.google.com') || details.url.includes('oauth')
      const ua = isGoogle
        ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0'
        : CHROME_UA
      popupWin.webContents.setUserAgent(ua)

      // CRITICAL FIX: "Try again" inside the Google popup opens another child window.
      // Without this handler Electron blocks it silently and the button does nothing.
      popupWin.webContents.setWindowOpenHandler(({ url: childUrl }) => {
        const isGoogleChild = childUrl.includes('accounts.google.com') || childUrl.includes('oauth')
        if (isGoogleChild) {
          return {
            action: 'allow',
            overrideBrowserWindowOptions: {
              width: 520,
              height: 640,
              titleBarStyle: 'default',
              webPreferences: {
                preload: this.stealthPreloadPath,
                partition,
                contextIsolation: true,
                nodeIntegration: false
              }
            }
          }
        }
        return { action: 'deny' }
      })

      // Grandchild popup also needs UA + its own handler (recursive retry chain)
      popupWin.webContents.on('did-create-window', (grandchild) => {
        grandchild.webContents.setUserAgent(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0'
        )
      })
    })


    // New tab: always focus immediately so the user sees it load
    this.switchToTab(platform)

    // Check login after load
    view.webContents.once('did-finish-load', () => {
      setTimeout(() => this.checkPlatformLogin(platform), 3000)
    })

    return view
  }

  async navigate(platform: string, url: string): Promise<boolean> {
    const tab = this.tabs.get(platform)
    if (!tab) return false
    
    // Auto prefix with https if it's just a domain
    let finalUrl = url
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.includes('.')) {
        finalUrl = 'https://' + url
      } else {
        finalUrl = 'https://www.google.com/search?q=' + encodeURIComponent(url)
      }
    }
    
    try {
      await tab.view.webContents.loadURL(finalUrl)
      return true
    } catch (e) {
      console.error('[BrowserManager] Failed to navigate:', e)
      return false
    }
  }

  /** Explicitly focus a tab — call this on user-initiated tab clicks */
  focusTab(platform: string): void {
    if (this.tabs.has(platform)) this.switchToTab(platform)
  }

  switchToTab(platform: string): void {
    const { width, height } = this.mainWindow.getContentBounds()
    const TOOLBAR_HEIGHT = 48
    const TEST_PANEL_WIDTH = 420 // width of the node graph panel when testing
    const browserWidth = width - this.sidebarWidth
    const browserHeight = height - this.titlebarHeight - TOOLBAR_HEIGHT

    // Hide all tabs
    for (const [id, tab] of this.tabs) {
      if (id !== platform) {
        tab.view.setBounds({ x: -9999, y: -9999, width: 0, height: 0 })
      }
    }

    const tab = this.tabs.get(platform)
    if (tab) {
      if (['studio', 'tasks', 'notes', 'stats', 'settings', 'memory'].includes(this.currentViewState) ||
          (platform === 'home' && (!tab.url || tab.url === 'about:blank' || tab.url === ''))) {
        // Studio editor open: hide browser behind the React app
        tab.view.setBounds({ x: -9999, y: -9999, width: 0, height: 0 })
      } else if (this.currentViewState === 'testing') {
        // Test mode: sidebar is hidden, node map on left (420px), browser takes the rest
        const browserX = TEST_PANEL_WIDTH
        const testBrowserWidth = Math.max(100, width - browserX)
        tab.view.setBounds({
          x: browserX,
          y: this.titlebarHeight + TOOLBAR_HEIGHT,
          width: testBrowserWidth,
          height: Math.max(100, browserHeight)
        })
      } else {
        // Normal mode: browser takes everything right of the sidebar
        tab.view.setBounds({
          x: this.sidebarWidth,
          y: this.titlebarHeight + TOOLBAR_HEIGHT,
          width: Math.max(100, browserWidth),
          height: Math.max(100, browserHeight)
        })
      }
    }
    
    this.activeTabId = platform
    this.emitTabUpdate()
  }

  setViewState(state: string): void {
    this.currentViewState = state
    this.relayout()
  }


  relayout(): void {
    if (this.activeTabId) {
      this.switchToTab(this.activeTabId)
    }
  }

  async checkPlatformLogin(platform: string): Promise<{ loggedIn: boolean; status: string }> {
    const tab = this.tabs.get(platform)
    if (!tab) return { loggedIn: false, status: 'no_tab' }

    const selectors = LOGIN_SELECTORS[platform]
    if (!selectors) return { loggedIn: true, status: 'unknown_platform' }

    try {
      const result = await tab.view.webContents.executeJavaScript(`
        (function() {
          const loggedIn = document.querySelector(${JSON.stringify(selectors.loggedIn)});
          const loggedOut = document.querySelector(${JSON.stringify(selectors.loggedOut)});
          return {
            loggedIn: !!loggedIn,
            loggedOut: !!loggedOut,
            url: window.location.href
          };
        })()
      `)

      let status: TabInfo['loginStatus'] = 'unknown'
      if (result.loggedIn) {
        status = 'logged_in'
      } else if (result.loggedOut) {
        status = 'logged_out'
      }

      tab.loginStatus = status

      // Notify renderer of login status change
      this.mainWindow.webContents.send('platform:login-status', {
        platform,
        status,
        url: result.url
      })

      if (status === 'logged_out') {
        // Prompt user to login
        this.mainWindow.webContents.send('platform:login-required', {
          platform,
          message: `Please log in to ${platform} — click to open the tab`
        })
      }

      return { loggedIn: status === 'logged_in', status }
    } catch (e) {
      return { loggedIn: false, status: 'error' }
    }
  }

  getTabList(): Array<{ id: string; platform: string; url: string; title: string; loginStatus: string; active: boolean }> {
    return Array.from(this.tabs.values()).map(tab => ({
      id: tab.id,
      platform: tab.platform,
      url: tab.url,
      title: tab.title,
      loginStatus: tab.loginStatus,
      active: tab.id === this.activeTabId
    }))
  }

  getLoginStatus(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [platform, tab] of this.tabs) {
      result[platform] = tab.loginStatus
    }
    return result
  }

  closeTab(platform: string): void {
    const tab = this.tabs.get(platform)
    if (tab) {
      this.mainWindow.contentView.removeChildView(tab.view)
      tab.view.webContents.close()
      this.tabs.delete(platform)

      // Switch to another tab if this was active
      if (this.activeTabId === platform) {
        const remaining = Array.from(this.tabs.keys())
        if (remaining.length > 0) {
          this.switchToTab(remaining[remaining.length - 1])
        }
      }
    }
  }

  getViewForPlatform(platform: string): import('electron').WebContentsView | null {
    return this.tabs.get(platform)?.view ?? null
  }

  getActiveView(): import('electron').WebContentsView | null {
    if (!this.activeTabId) return null
    return this.tabs.get(this.activeTabId)?.view ?? null
  }

  private emitTabUpdate(): void {
    this.mainWindow.webContents.send('browser:tabs-updated', this.getTabList())
  }
}
