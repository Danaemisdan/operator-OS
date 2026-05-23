import React, { useState, useEffect, useRef } from 'react'
import './BrowserToolbar.css'
import { TabInfo } from '../../App'

const PLATFORM_ICONS: Record<string, string> = {
  linkedin:  '💼',
  twitter:   '🐦',
  instagram: '📷',
  whatsapp:  '💬',
  telegram:  '✈️',
  reddit:    '🤖',
  youtube:   '▶️',
  home:      '🏠'
}

const PLATFORM_COLORS: Record<string, string> = {
  linkedin:  '#0A66C2',
  twitter:   '#1DA1F2',
  instagram: '#E1306C',
  whatsapp:  '#25D366',
  telegram:  '#26A5E4',
  reddit:    '#FF4500',
  youtube:   '#FF0000',
  home:      'var(--color-accent)'
}

const ALL_PLATFORMS = [
  { id: 'linkedin',  label: 'LinkedIn' },
  { id: 'twitter',   label: 'Twitter / X' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'whatsapp',  label: 'WhatsApp' },
  { id: 'telegram',  label: 'Telegram' },
  { id: 'reddit',    label: 'Reddit' },
  { id: 'youtube',   label: 'YouTube' },
]

const api = (window as any).electronAPI

interface Props {
  tabs: TabInfo[]
  onTabSwitch: (platform: string) => void
  onOpenTab: (platform: string) => void
}

export default function BrowserToolbar({ tabs, onTabSwitch, onOpenTab }: Props) {
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const openPlatforms = new Set(tabs.map(t => t.platform))
  const activeTab = tabs.find(t => t.active)

  // Close picker when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleCloseTab = (e: React.MouseEvent, platform: string) => {
    e.stopPropagation()
    api?.browser?.closeTab?.(platform)
  }

  const getTabLabel = (tab: TabInfo): string => {
    const displayNames: Record<string, string> = {
      linkedin: 'LinkedIn', twitter: 'Twitter', instagram: 'Instagram',
      whatsapp: 'WhatsApp', telegram: 'Telegram', reddit: 'Reddit',
      youtube: 'YouTube', home: 'Home'
    }
    return displayNames[tab.platform] || tab.platform
  }

  const [urlInput, setUrlInput] = useState('')

  useEffect(() => {
    if (activeTab && activeTab.url && activeTab.url !== 'about:blank') {
      setUrlInput(activeTab.url)
    } else {
      setUrlInput('')
    }
  }, [activeTab?.url])

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeTab || !urlInput.trim()) return
    
    // Natively trigger navigation
    api?.browser?.navigate?.(activeTab.platform, urlInput.trim())
    
    // Inject event into recorder if it's active
    api?.browser?.recordManualEvent?.({
      type: 'navigate',
      url: urlInput.trim()
    })
  }

  return (
    <div className="browser-toolbar">
      <div className="tab-strip">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`browser-tab ${tab.active ? 'active' : ''}`}
            onClick={() => onTabSwitch(tab.platform)}
            style={tab.active ? { '--tab-color': PLATFORM_COLORS[tab.platform] || 'var(--color-accent)' } as any : {}}
            title={tab.url}
          >
            <span className="tab-icon">{PLATFORM_ICONS[tab.platform] || '🌐'}</span>
            <span className="tab-title">{getTabLabel(tab)}</span>
            {tab.loginStatus === 'logged_out' && (
              <span className="tab-login-dot" title="Login required" />
            )}
            <button
              className="tab-close"
              onClick={(e) => handleCloseTab(e, tab.platform)}
              title="Close tab"
            >
              ×
            </button>
          </div>
        ))}

        {/* New tab / platform picker */}
        <div className="new-tab-btn-wrap" ref={pickerRef}>
          <button
            className="new-tab-btn"
            onClick={() => setShowPicker(v => !v)}
            title="Open platform"
          >
            +
          </button>
          {showPicker && (
            <div className="platform-picker">
              {ALL_PLATFORMS.filter(p => !openPlatforms.has(p.id)).map(p => (
                <button
                  key={p.id}
                  className="platform-picker-item"
                  onClick={() => { 
                    onOpenTab(p.id); 
                    setShowPicker(false);
                    // Record the initial load
                    api?.browser?.recordManualEvent?.({
                      type: 'navigate',
                      url: `https://www.${p.id}.com`
                    })
                  }}
                >
                  <span>{PLATFORM_ICONS[p.id]}</span>
                  <span>{p.label}</span>
                </button>
              ))}
              {ALL_PLATFORMS.every(p => openPlatforms.has(p.id)) && (
                <div className="platform-picker-empty">All platforms open</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="toolbar-spacer" />

      <form className="toolbar-actions" onSubmit={handleUrlSubmit}>
        <input 
          type="text" 
          className="toolbar-url-input" 
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Enter URL or search Google..."
        />
      </form>
    </div>
  )
}
