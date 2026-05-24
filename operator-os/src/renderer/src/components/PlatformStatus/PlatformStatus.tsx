import React from 'react'
import PlatformIcon from '../PlatformIcon'
import './PlatformStatus.css'

const api = (window as any).electronAPI

const PLATFORMS = [
  { id: 'linkedin',  label: 'LinkedIn',  color: '#0A66C2' },
  { id: 'twitter',   label: 'X',         color: '#1DA1F2' },
  { id: 'instagram', label: 'Instagram', color: '#E1306C' },
  { id: 'whatsapp',  label: 'WhatsApp',  color: '#25D366' },
]

interface Props {
  loginStatuses: Record<string, string>
  onOpenTab: (platform: string) => void
  onTabSwitch: (platform: string) => void
}

function StatusDot({ status }: { status?: string }) {
  if (status === 'logged_in') return <span className="status-dot status-ok" />
  if (status === 'logged_out') return <span className="status-dot status-warn" />
  if (status === 'needs_verification') return <span className="status-dot status-err" />
  return <span className="status-dot status-idle" />
}

export default function PlatformStatus({ loginStatuses, onOpenTab, onTabSwitch }: Props) {
  const handleClick = (platformId: string) => {
    const status = loginStatuses[platformId]
    if (status) {
      onTabSwitch(platformId)
    } else {
      onOpenTab(platformId)
    }
  }

  return (
    <div className="platform-status">
      <div className="platform-chips">
        {PLATFORMS.map(p => {
          const status = loginStatuses[p.id]
          return (
            <button
              key={p.id}
              className={`platform-chip ${status ? 'connected' : 'idle'} ${status === 'logged_out' ? 'needs-login' : ''}`}
              onClick={() => handleClick(p.id)}
              title={`${p.label}: ${status || 'not opened'}`}
              style={{ '--chip-color': p.color } as any}
            >
              <span className="chip-icon"><PlatformIcon platform={p.id} size={14} /></span>
              <span className="chip-label">{p.label}</span>
              <StatusDot status={status} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
