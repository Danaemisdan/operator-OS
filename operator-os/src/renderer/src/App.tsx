import React, { useState, useEffect, useCallback } from 'react'
import TitleBar from './components/TitleBar/TitleBar'
import Sidebar from './components/Sidebar/Sidebar'
import BrowserToolbar from './components/TitleBar/BrowserToolbar'
import ProfileWizard from './components/ProfileWizard/ProfileWizard'
import HomeDashboard from './components/HomeDashboard/HomeDashboard'
import WorkflowEditor from './components/Studio/WorkflowEditor'
import TaskBoard from './components/TaskBoard/TaskBoard'
import { AlertTriangle, CheckCircle2, XCircle, Info, Zap } from 'lucide-react'
export interface TabInfo {
  id: string
  platform: string
  url: string
  title: string
  loginStatus: string
  active: boolean
}

export interface ActivityEvent {
  id: string
  timestamp: number
  type: 'action' | 'success' | 'error' | 'thinking' | 'info' | 'data'
  platform?: string
  message: string
  detail?: string
}

export interface Toast {
  id: string
  type: 'info' | 'warning' | 'error' | 'success'
  message: string
  platform?: string
  persistent?: boolean
  action?: { label: string; onClick: () => void }
}

export type ViewType = 'chat' | 'tasks' | 'memory' | 'stats' | 'settings' | 'studio'

const api = (window as any).electronAPI

export default function App() {
  const [isFirstLaunch, setIsFirstLaunch] = useState(false)
  const [chromeProfiles, setChromeProfiles] = useState<any[]>([])
  const [currentView, setCurrentView] = useState<ViewType>('chat')
  const [isRecording, setIsRecording] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [tabs, setTabs] = useState<TabInfo[]>([])
  const [loginStatuses, setLoginStatuses] = useState<Record<string, string>>({})
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([
    { id: '1', timestamp: Date.now() - 2000, type: 'info', message: 'Operator OS initialized' },
    { id: '2', timestamp: Date.now() - 1000, type: 'success', message: 'Stealth layer active' },
  ])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [aiStatus, setAiStatus] = useState<{ running: boolean; tierName?: string } | null>(null)

  const addActivity = useCallback((event: Omit<ActivityEvent, 'id' | 'timestamp'>) => {
    setActivityEvents(prev => [
      ...prev.slice(-49),
      { ...event, id: `evt_${Date.now()}_${Math.random()}`, timestamp: Date.now() }
    ])
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast_${Date.now()}`
    // Deduplicate same platform+type toasts
    setToasts(prev => [
      ...prev.filter(t => !(t.platform === toast.platform && t.type === toast.type)),
      { ...toast, id }
    ])
    if (!toast.persistent) {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000)
    }
  }, [])

  useEffect(() => {
    if (!api) return

    const offFirstLaunch = api.profile?.onFirstLaunch?.((data: any) => {
      setIsFirstLaunch(true)
      setChromeProfiles(data.chromeProfiles || [])
    })

    const offTabs = api.browser?.onTabsUpdated?.((updatedTabs: TabInfo[]) => {
      setTabs(updatedTabs)
    })

    // Login required — persistent toast with action button
    const offLoginRequired = api.platform?.onLoginRequired?.((data: any) => {
      const platformName = data.platform.charAt(0).toUpperCase() + data.platform.slice(1)
      addToast({
        type: 'warning',
        message: `${platformName} needs login — login page is open.`,
        platform: data.platform,
        persistent: true,
        action: {
          label: 'Go to tab →',
          onClick: () => {
            api?.browser?.switchTab(data.platform)
            setTabs(prev => prev.map(t => ({ ...t, active: t.platform === data.platform })))
          }
        }
      })
      addActivity({
        type: 'error',
        platform: data.platform,
        message: `${platformName}: login required — login page opened`
      })
      setLoginStatuses(prev => ({ ...prev, [data.platform]: 'logged_out' }))
    })

    const offLoginStatus = api.platform?.onLoginStatus?.((data: any) => {
      setLoginStatuses(prev => ({ ...prev, [data.platform]: data.status }))
      if (data.status === 'logged_in') {
        addActivity({ type: 'success', platform: data.platform, message: `${data.platform}: connected` })
        // Dismiss any login toast for this platform
        setToasts(prev => prev.filter(t => !(t.platform === data.platform && t.type === 'warning')))
      }
    })

    const offAiReady = api.ai?.onReady?.((status: any) => {
      setAiStatus(status)
      addActivity({ type: 'success', message: `AI online — ${status.tierName || status.modelTier}` })
    })

    // Activity stream from orchestrator
    const offAgentActivity = api.agent?.onActivity?.((event: ActivityEvent) => {
      setActivityEvents(prev => [
        ...prev.slice(-49),
        { ...event, id: `evt_${Date.now()}_${Math.random()}` }
      ])
    })

    // Load initial tabs
    api.browser?.getTabs?.().then((t: TabInfo[]) => setTabs(t || []))
    api.ai?.getStatus?.().then((s: any) => s?.running && setAiStatus(s))

    return () => {
      offFirstLaunch?.()
      offTabs?.()
      offLoginRequired?.()
      offLoginStatus?.()
      offAiReady?.()
      offAgentActivity?.()
    }
  }, [addActivity, addToast])

  const handleTabSwitch = useCallback((platform: string) => {
    api?.browser?.switchTab(platform)
    setTabs(prev => prev.map(t => ({ ...t, active: t.platform === platform })))
  }, [])

  const handleViewChange = useCallback((v: ViewType) => {
    setCurrentView(v)
  }, [])

  useEffect(() => {
    let state: string
    if (currentView === 'studio' && !isRecording && !isTesting) state = 'studio'    // hide browser
    else if (currentView === 'studio' && isTesting) state = 'testing'                // browser on right half
    else if (currentView === 'studio' && isRecording) state = 'recording'
    else state = currentView
    api?.browser?.setViewState?.(state)
  }, [isRecording, isTesting, currentView])

  const handleOpenTab = useCallback((platform: string) => {
    api?.browser?.openTab(platform)
    addActivity({ type: 'action', platform, message: `Opening ${platform}...` })
  }, [addActivity])

  const handleSetupComplete = useCallback(() => {
    api?.profile?.completeSetup()
    setIsFirstLaunch(false)
  }, [])

  if (isFirstLaunch) {
    return (
      <ProfileWizard
        chromeProfiles={chromeProfiles}
        onComplete={handleSetupComplete}
      />
    )
  }

  return (
    <div className="app-layout">
      <TitleBar />

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <span className="toast-icon">
              {toast.type === 'warning' ? <AlertTriangle size={16} /> : toast.type === 'error' ? <XCircle size={16} /> : toast.type === 'success' ? <CheckCircle2 size={16} /> : <Info size={16} />}
            </span>
            <span className="toast-message">{toast.message}</span>
            {toast.action && (
              <button
                className="toast-action-btn"
                onClick={() => { toast.action!.onClick(); dismissToast(toast.id) }}
              >
                {toast.action.label}
              </button>
            )}
            <button className="toast-close" onClick={() => dismissToast(toast.id)}>×</button>
          </div>
        ))}
      </div>

      <div className="main-content">
        {!isTesting && (
          <Sidebar
            currentView={currentView}
            onViewChange={handleViewChange}
            tabs={tabs}
            loginStatuses={loginStatuses}
            activityEvents={activityEvents}
            aiStatus={aiStatus}
            onOpenTab={handleOpenTab}
            onTabSwitch={handleTabSwitch}
            addActivity={addActivity}
            isRecording={isRecording}
            setIsRecording={setIsRecording}
            isTesting={isTesting}
            setIsTesting={setIsTesting}
          />
        )}

        <div className="browser-area">
          {currentView === 'studio' && !isRecording ? (
            <div style={{ display: 'flex', flexDirection: 'row', width: '100%', height: '100%' }}>
              <div style={isTesting ? { display: 'flex', height: '100%', width: '420px', flexShrink: 0, overflow: 'hidden', borderRight: '1px solid var(--color-border)' } : { display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>
                <WorkflowEditor isTesting={isTesting} setIsTesting={setIsTesting} />
              </div>
              {isTesting && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-bg)', minWidth: 0 }}>
                  <BrowserToolbar
                    tabs={tabs}
                    onTabSwitch={handleTabSwitch}
                    onOpenTab={handleOpenTab}
                  />
                  <div className="browser-viewport" />
                </div>
              )}
            </div>
          ) : currentView === 'tasks' ? (
            <TaskBoard />
          ) : (
            <>
              <BrowserToolbar
                tabs={tabs}
                onTabSwitch={handleTabSwitch}
                onOpenTab={handleOpenTab}
              />
              <div className="browser-viewport">
                {tabs.length === 0 && (
                  <div className="browser-empty-state">
                    <div className="empty-icon"><Zap size={48} /></div>
                    <p>Open a platform from the sidebar to get started</p>
                  </div>
                )}
                {(() => {
                  const activeTab = tabs.find(t => t.active)
                  if (!activeTab) return null
                  if (activeTab.platform === 'home' && (!activeTab.url || activeTab.url === 'about:blank')) {
                    return (
                      <HomeDashboard
                        aiStatus={aiStatus}
                        activityEvents={activityEvents}
                        onOpenTab={handleOpenTab}
                      />
                    )
                  }
                  return null
                })()}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
