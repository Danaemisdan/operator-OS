import React from 'react'
import './ActivityFeed.css'
import { ActivityEvent } from '../../App'

const TYPE_CONFIG: Record<ActivityEvent['type'], { icon: string; cls: string }> = {
  action:   { icon: '▶', cls: 'type-action' },
  success:  { icon: '✓', cls: 'type-success' },
  error:    { icon: '✕', cls: 'type-error' },
  thinking: { icon: '○', cls: 'type-thinking' },
  info:     { icon: '·', cls: 'type-info' },
}

const PLATFORM_ICONS: Record<string, string> = {
  linkedin: '💼', twitter: '🐦', instagram: '📷',
  whatsapp: '💬', telegram: '✈️', reddit: '🤖', youtube: '▶️'
}

function relativeTime(ts: number): string {
  const delta = Date.now() - ts
  if (delta < 60000) return `${Math.floor(delta / 1000)}s ago`
  if (delta < 3600000) return `${Math.floor(delta / 60000)}m ago`
  return `${Math.floor(delta / 3600000)}h ago`
}

interface Props {
  events: ActivityEvent[]
}

export default function ActivityFeed({ events }: Props) {
  return (
    <div className="activity-feed">
      <div className="activity-header">
        <span className="activity-title">Live Activity</span>
        <span className="activity-count">{events.length}</span>
      </div>
      <div className="activity-list">
        {events.length === 0 && (
          <div className="activity-empty">No activity yet</div>
        )}
        {[...events].reverse().map(evt => {
          const cfg = TYPE_CONFIG[evt.type]
          return (
            <div key={evt.id} className={`activity-item ${cfg.cls}`}>
              <div className="activity-icon-wrap">
                {evt.platform ? (
                  <span className="activity-platform-icon">
                    {PLATFORM_ICONS[evt.platform] || '🌐'}
                  </span>
                ) : (
                  <span className={`activity-type-icon ${cfg.cls}`}>{cfg.icon}</span>
                )}
              </div>
              <div className="activity-body">
                <span className="activity-msg">{evt.message}</span>
                {evt.detail && <span className="activity-detail">{evt.detail}</span>}
              </div>
              <span className="activity-time">{relativeTime(evt.timestamp)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
