import React, { useState } from 'react'
import { BarChart3, PieChart, Activity, TrendingUp, Users, MessageSquare } from 'lucide-react'

const STAT_CATEGORIES = [
  { id: 'overview', icon: Activity, label: 'System Overview' },
  { id: 'platforms', icon: PieChart, label: 'Platform Usage' },
  { id: 'execution', icon: TrendingUp, label: 'Execution Metrics' },
  { id: 'engagement', icon: Users, label: 'Audience Engagement' },
  { id: 'generation', icon: MessageSquare, label: 'AI Generation' }
]

export default function Stats() {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="task-dashboard-container">
      {/* ── Left Sidebar ── */}
      <div className="task-sidebar">
        <div className="task-sidebar-header">
          <span>Analytics</span>
        </div>
        <div className="task-list">
          {STAT_CATEGORIES.map(cat => (
            <div 
              key={cat.id}
              className={`task-list-item ${activeTab === cat.id ? 'active' : ''}`}
              onClick={() => setActiveTab(cat.id)}
            >
              <div className="task-item-top" style={{ justifyContent: 'flex-start', gap: '10px' }}>
                <cat.icon size={16} />
                <span>{cat.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right Details Canvas ── */}
      <div className="task-canvas">
        <div className="task-detail-header">
          <h2 className="task-detail-title">
            {STAT_CATEGORIES.find(c => c.id === activeTab)?.label}
          </h2>
          <div className="task-detail-meta">
            Data is currently simulated for the alpha release.
          </div>
        </div>

        <div className="task-empty-state">
          <BarChart3 size={48} opacity={0.3} />
          <p>Analytics visualization components will be rendered here.</p>
        </div>
      </div>
    </div>
  )
}
