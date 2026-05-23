import React from 'react'
import './Sidebar.css'
import PlatformStatus from '../PlatformStatus/PlatformStatus'
import ChatInterface from '../Chat/ChatInterface'
import ActivityFeed from '../ActivityFeed/ActivityFeed'

import { Recorder } from '../Recorder'
import { TabInfo, ActivityEvent, ViewType } from '../../App'

const NAV_ITEMS: { id: ViewType; icon: string; label: string }[] = [
  { id: 'chat',     icon: '💬', label: 'Chat' },
  { id: 'tasks',    icon: '📋', label: 'Tasks' },
  { id: 'memory',   icon: '🧠', label: 'Memory' },
  { id: 'stats',    icon: '📊', label: 'Stats' },
  { id: 'studio',   icon: '🎥', label: 'Studio' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
]

interface Props {
  currentView: ViewType
  onViewChange: (v: ViewType) => void
  tabs: TabInfo[]
  loginStatuses: Record<string, string>
  activityEvents: ActivityEvent[]
  aiStatus: { running: boolean; tierName?: string } | null
  onOpenTab: (platform: string) => void
  onTabSwitch: (platform: string) => void
  addActivity: (e: Omit<ActivityEvent, 'id' | 'timestamp'>) => void
  isRecording: boolean
  setIsRecording: (v: boolean) => void
}

export default function Sidebar({
  currentView, onViewChange, tabs, loginStatuses,
  activityEvents, aiStatus, onOpenTab, onTabSwitch, addActivity,
  isRecording, setIsRecording
}: Props) {
  return (
    <aside className="sidebar">
      {/* Platform status row */}
      <PlatformStatus
        loginStatuses={loginStatuses}
        onOpenTab={onOpenTab}
        onTabSwitch={onTabSwitch}
      />

      {/* Main view area */}
      <div className="sidebar-view">
        {currentView === 'chat' && (
          <ChatInterface
            activityEvents={activityEvents}
            aiStatus={aiStatus}
            addActivity={addActivity}
          />
        )}
        {currentView === 'tasks' && (
          <div className="sidebar-placeholder">
            <span className="placeholder-icon">📋</span>
            <span>Task Dashboard is open</span>
          </div>
        )}
        {currentView === 'memory' && (
          <div className="sidebar-placeholder">
            <span className="placeholder-icon">🧠</span>
            <span>Memory system coming soon</span>
          </div>
        )}
        {currentView === 'stats' && (
          <div className="sidebar-placeholder">
            <span className="placeholder-icon">📊</span>
            <span>Analytics coming soon</span>
          </div>
        )}
        {currentView === 'studio' && (
          <Recorder isRecording={isRecording} setIsRecording={setIsRecording} />
        )}
        {currentView === 'settings' && (
          <div className="sidebar-placeholder">
            <span className="placeholder-icon">⚙️</span>
            <span>Settings coming soon</span>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <nav className="sidebar-nav">
        <div className="nav-items">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`nav-item ${currentView === item.id ? 'active' : ''}`}
              onClick={() => onViewChange(item.id)}
              title={item.label}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="ai-status-indicator">
          <div className={`ai-dot ${aiStatus?.running ? 'running' : 'offline'}`} />
          <span className="ai-status-text">
            {aiStatus?.running ? `AI · ${aiStatus.tierName?.split(' ')[0] || 'Online'}` : 'AI starting...'}
          </span>
        </div>
      </nav>
    </aside>
  )
}
