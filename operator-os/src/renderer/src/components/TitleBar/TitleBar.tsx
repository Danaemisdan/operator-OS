import React from 'react'
import './TitleBar.css'

const api = (window as any).electronAPI
const isMac = navigator.platform.toLowerCase().includes('mac')

export default function TitleBar() {
  return (
    <div className="titlebar">
      {isMac && <div className="titlebar-traffic-lights" />}
      <div className="titlebar-logo">
        <span className="titlebar-logo-icon">⚡</span>
        <span className="titlebar-logo-text">Operator OS</span>
        <span className="titlebar-badge">ALPHA</span>
      </div>
      <div className="titlebar-drag" />
      {!isMac && (
        <div className="titlebar-win-controls">
          <button className="win-btn win-minimize" onClick={() => api?.window.minimize()} title="Minimize">
            <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
          </button>
          <button className="win-btn win-maximize" onClick={() => api?.window.maximize()} title="Maximize">
            <svg width="10" height="10" viewBox="0 0 10 10"><rect width="9" height="9" x="0.5" y="0.5" fill="none" stroke="currentColor"/></svg>
          </button>
          <button className="win-btn win-close" onClick={() => api?.window.close()} title="Close">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2"/>
              <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
