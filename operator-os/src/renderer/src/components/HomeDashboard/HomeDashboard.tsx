import React, { useState, useMemo } from 'react'
import './HomeDashboard.css'
import { ActivityEvent } from '../../App'
import LiquidMetalButton from '../UI/LiquidMetalButton'

const api = (window as any).electronAPI

interface Props {
  aiStatus: { running: boolean; tierName?: string } | null
  activityEvents: ActivityEvent[]
  onOpenTab: (platform: string) => void
}

export default function HomeDashboard({ aiStatus, activityEvents, onOpenTab }: Props) {
  const [prompt, setPrompt] = useState('')

  const handleSendPrompt = () => {
    if (!prompt.trim()) return
    api?.agent?.sendRequest?.(prompt)
    setPrompt('')
    // Switch to Chat view to see the response
    document.querySelector('.sidebar-nav-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  const successEvents = activityEvents.filter(e => e.type === 'success')
  const recentSuccess = successEvents.slice(-3).reverse()
  
  const dataEvents = useMemo(() => activityEvents.filter(e => e.type === 'data'), [activityEvents])

  const renderDataPayload = (payloadStr: string) => {
    try {
      const data = JSON.parse(payloadStr)
      // Check if it's an object with an array (e.g. { jobs: [...] } or { leads: [...] })
      for (const key of Object.keys(data)) {
        if (Array.isArray(data[key]) && data[key].length > 0) {
          const items = data[key]
          return (
            <div className="data-results-grid">
              {items.map((item: any, i: number) => (
                <div key={i} className="data-result-card">
                  {Object.entries(item).map(([k, v]) => {
                    if (typeof v === 'string' && v.startsWith('http')) {
                      return <a key={k} href={v} target="_blank" rel="noreferrer" className="data-link">{k}</a>
                    }
                    return <div key={k} className="data-field"><span className="data-key">{k}:</span> <span className="data-value">{String(v)}</span></div>
                  })}
                </div>
              ))}
            </div>
          )
        }
      }
      // Fallback for flat JSON
      return (
        <pre className="data-fallback">{JSON.stringify(data, null, 2)}</pre>
      )
    } catch {
      return <div className="data-fallback">{payloadStr}</div>
    }
  }

  return (
    <div className="home-dashboard">
      <div className="home-dashboard-inner">
        <div className="home-header">
          <h1>Welcome to Operator OS</h1>
          <p>Your stealth AI agent is online and ready.</p>
        </div>

        <div className="home-grid">
          <div className="home-card">
            <h3>🤖 AI Status</h3>
            <div className="home-card-value">
              {aiStatus?.running ? 'Online' : 'Offline'}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-3)' }}>
              {aiStatus?.tierName || 'Initializing...'}
            </div>
          </div>

          <div className="home-card">
            <h3>⚡ Tasks Completed</h3>
            <div className="home-card-value">{successEvents.length}</div>
            <div className="recent-activity-list">
              {recentSuccess.map(evt => (
                <div key={evt.id} className="recent-activity-item">
                  {evt.message}
                </div>
              ))}
              {recentSuccess.length === 0 && (
                <div className="recent-activity-item">No tasks completed yet</div>
              )}
            </div>
          </div>
        </div>

        {dataEvents.length > 0 && (
          <div className="results-dashboard">
            <h2>📊 Extracted Results</h2>
            {dataEvents.slice(-5).reverse().map(evt => (
              <div key={evt.id} className="result-section">
                <div className="result-header">
                  <span className="result-platform">{evt.platform}</span>
                  <span className="result-time">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                </div>
                {evt.detail && renderDataPayload(evt.detail)}
              </div>
            ))}
          </div>
        )}

        <div className="home-chat-box">
          <h3>Chat with Agent</h3>
          <textarea
            className="home-chat-input"
            placeholder="Tell Operator what to do... e.g. 'Find leads on LinkedIn' or 'Check my DMs'"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSendPrompt()
              }
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <LiquidMetalButton onClick={handleSendPrompt}>
              Send Request ⚡
            </LiquidMetalButton>
          </div>
        </div>
      </div>
    </div>
  )
}
