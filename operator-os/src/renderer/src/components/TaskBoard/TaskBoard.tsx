import React from 'react'
import './TaskBoard.css'

import { useState, useEffect } from 'react'

interface Task {
  id: string
  intent: string
  workflowId: string
  platform: string
  status: 'queued' | 'running' | 'done' | 'failed'
  durationMs?: number
  startTime: number
  endTime?: number
  outputs?: any
}

const PLATFORM_ICONS: Record<string, string> = {
  linkedin: '💼', twitter: '🐦', instagram: '📷', whatsapp: '💬'
}

const TYPE_LABELS: Record<string, string> = {
  dm_campaign: 'DM Campaign', engagement: 'Engagement', publish: 'Publishing',
  research: 'Research', scrape: 'Scraping'
}

function relativeTime(ts: number): string {
  const d = Date.now() - ts
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`
  return `${Math.floor(d / 3600000)}h ago`
}

export default function TaskBoard() {
  const [tasks, setTasks] = useState<Task[]>([])

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const data = await window.electron.ipcRenderer.invoke('tasks:get-all')
        setTasks(data || [])
      } catch (e) {
        console.error(e)
      }
    }
    fetchTasks()
    const interval = setInterval(fetchTasks, 2000)
    return () => clearInterval(interval)
  }, [])

  const queued  = tasks.filter(t => t.status === 'queued')
  const running = tasks.filter(t => t.status === 'running')
  const done    = tasks.filter(t => t.status === 'done' || t.status === 'failed')

  return (
    <div className="task-board">
      <div className="task-board-header">
        <span className="task-board-title">Task Board</span>
        <span className="task-board-hint">{tasks.length} tasks</span>
      </div>

      <div className="task-columns">
        <Column title="Queued" count={queued.length} tasks={queued} accent="text-2" />
        <Column title="Running" count={running.length} tasks={running} accent="accent" />
        <Column title="Completed" count={done.length} tasks={done} accent="success" />
      </div>
    </div>
  )
}

function Column({ title, count, tasks, accent }: {
  title: string; count: number; tasks: Task[]; accent: string
}) {
  return (
    <div className="task-column">
      <div className={`column-header col-${accent}`}>
        <span className="column-title">{title}</span>
        <span className="column-count">{count}</span>
      </div>
      <div className="column-tasks">
        {tasks.length === 0 ? (
          <div className="column-empty">
            <span>—</span>
          </div>
        ) : tasks.map(task => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  )
}

function TaskCard({ task }: { task: Task }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`task-card status-${task.status}`} onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
      <div className="task-card-top">
        <span className="task-platform-icon">{PLATFORM_ICONS[task.platform || 'linkedin'] || '🌐'}</span>
        <span className="task-type" style={{ flex: 1 }}>{task.workflowId || 'Workflow'}</span>
        {task.durationMs && <span className="task-duration">{(task.durationMs / 1000).toFixed(1)}s</span>}
        <span className="task-time" style={{ marginLeft: 6 }}>{relativeTime(task.startTime)}</span>
      </div>
      <div className="task-label">{task.intent}</div>
      {task.status === 'running' && (
        <div className="task-progress">
          <div className="task-progress-bar" style={{ width: `100%`, animation: 'pulse 1.5s infinite' }} />
        </div>
      )}
      {task.status === 'done' && (
        <div className="task-status-badge badge-done">✓ Complete</div>
      )}
      {task.status === 'failed' && (
        <div className="task-status-badge badge-failed">✕ Failed</div>
      )}
      
      {expanded && task.outputs && Object.keys(task.outputs).length > 0 && (
        <div className="task-outputs" style={{ marginTop: 12, padding: 8, background: 'var(--color-surface-1)', borderRadius: 4, fontSize: 10, fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
          {JSON.stringify(task.outputs, null, 2)}
        </div>
      )}
    </div>
  )
}
