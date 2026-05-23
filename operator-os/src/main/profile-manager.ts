import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import os from 'os'

const OPERATOR_PROFILE_DIR = join(os.homedir(), '.operator-os', 'profiles', 'primary')
const CONFIG_PATH = join(os.homedir(), '.operator-os', 'config.json')

// Files to copy from Chrome profile
const CHROME_SESSION_FILES = [
  'Cookies',
  'Cookies-journal',
  'Local Storage',
  'IndexedDB',
  'Session Storage',
  'Extension State',
  'Preferences',
  'Secure Preferences',
  'Login Data',
  'Login Data For Account',
  'Web Data',
  'Shortcuts',
  'History',
  'Network Action Predictor',
  'Origin Bound Certs',
  'Visited Links',
  'Favicons',
  'Top Sites'
]

const CHROME_PROFILE_DIRS = {
  darwin: join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome'),
  win32: join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data'),
  linux: join(os.homedir(), '.config', 'google-chrome')
}

export interface ChromeProfile {
  path: string
  name: string
  displayName: string
  hasGmail: boolean
  isDefault: boolean
}

interface AppConfig {
  setupComplete: boolean
  profilePath?: string
  importedAt?: string
  version: string
}

export class ProfileManager {
  private config: AppConfig

  constructor() {
    this.config = this.loadConfig()
    this.ensureDirs()
  }

  private loadConfig(): AppConfig {
    try {
      if (existsSync(CONFIG_PATH)) {
        return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
      }
    } catch { /* ignore */ }
    return { setupComplete: false, version: '0.1.0' }
  }

  private saveConfig(): void {
    const dir = join(os.homedir(), '.operator-os')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2))
  }

  private ensureDirs(): void {
    if (!existsSync(OPERATOR_PROFILE_DIR)) {
      mkdirSync(OPERATOR_PROFILE_DIR, { recursive: true })
    }
  }

  async isFirstLaunch(): Promise<boolean> {
    return !this.config.setupComplete
  }

  async detectChromeProfiles(): Promise<ChromeProfile[]> {
    const chromePath = CHROME_PROFILE_DIRS[process.platform as keyof typeof CHROME_PROFILE_DIRS]
    if (!chromePath || !existsSync(chromePath)) return []

    const profiles: ChromeProfile[] = []

    try {
      const entries = readdirSync(chromePath)

      for (const entry of entries) {
        // Only look at Default and Profile N directories
        if (entry !== 'Default' && !entry.match(/^Profile \d+$/)) continue

        const fullPath = join(chromePath, entry)

        let stat
        try {
          stat = statSync(fullPath)
        } catch { continue }

        if (!stat.isDirectory()) continue

        // Try to read profile name from Preferences
        let displayName = entry === 'Default' ? 'Default Profile' : entry
        let hasGmail = false

        try {
          const prefsPath = join(fullPath, 'Preferences')
          if (existsSync(prefsPath)) {
            const prefs = JSON.parse(readFileSync(prefsPath, 'utf-8'))
            const profileName = prefs?.profile?.name
            const email = prefs?.account_info?.[0]?.email
            if (profileName) displayName = profileName
            if (email) {
              displayName = `${displayName} (${email})`
              hasGmail = email.includes('gmail.com')
            }
          }
        } catch { /* ignore */ }

        profiles.push({
          path: fullPath,
          name: entry,
          displayName,
          hasGmail,
          isDefault: entry === 'Default'
        })
      }
    } catch (e) {
      console.error('[ProfileManager] Error detecting Chrome profiles:', e)
    }

    // Sort: Default first
    return profiles.sort((a, b) => (a.isDefault ? -1 : 1))
  }

  async importProfile(sourcePath: string): Promise<boolean> {
    console.log(`[ProfileManager] Importing Chrome profile from: ${sourcePath}`)

    try {
      for (const fileName of CHROME_SESSION_FILES) {
        const src = join(sourcePath, fileName)
        const dest = join(OPERATOR_PROFILE_DIR, fileName)

        if (!existsSync(src)) continue

        const stat = statSync(src)

        if (stat.isDirectory()) {
          // Copy directory recursively
          this.copyDir(src, dest)
        } else {
          // Copy single file
          copyFileSync(src, dest)
        }
      }

      this.config.profilePath = sourcePath
      this.config.importedAt = new Date().toISOString()
      this.saveConfig()

      console.log('[ProfileManager] Profile imported successfully')
      return true
    } catch (e) {
      console.error('[ProfileManager] Import failed:', e)
      return false
    }
  }

  private copyDir(src: string, dest: string): void {
    if (!existsSync(dest)) mkdirSync(dest, { recursive: true })
    const entries = readdirSync(src)
    for (const entry of entries) {
      const srcPath = join(src, entry)
      const destPath = join(dest, entry)
      try {
        const stat = statSync(srcPath)
        if (stat.isDirectory()) {
          this.copyDir(srcPath, destPath)
        } else {
          copyFileSync(srcPath, destPath)
        }
      } catch { /* ignore individual file errors */ }
    }
  }

  async markSetupComplete(): Promise<void> {
    this.config.setupComplete = true
    this.saveConfig()
  }

  getProfilePath(): string {
    return OPERATOR_PROFILE_DIR
  }
}
