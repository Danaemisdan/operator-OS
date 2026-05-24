import React, { useState, useEffect } from 'react'
import './TaskBoard.css'
import { Clock, PlayCircle, CheckCircle2, XCircle, Calendar, Zap, HardDriveDownload, Timer, LayoutDashboard } from 'lucide-react'

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
  scheduleType?: 'burst' | 'scheduled' | 'interval'
}

function relativeTime(ts: number): string {
  const d = Date.now() - ts
  if (d < 60000) return 'Just now'
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`
  return `${Math.floor(d / 3600000)}h ago`
}

function formatDuration(ms?: number): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export default function TaskBoard() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

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

  const selectedTask = tasks.find(t => t.id === selectedTaskId)

  return (
    <div className="task-dashboard-container">
      {/* ── Left Sidebar ── */}
      <div className="task-sidebar">
        <div className="task-sidebar-header">
          <span>Executed Tasks</span>
          <span style={{ fontSize: '11px', color: 'var(--color-text-3)' }}>{tasks.length} total</span>
        </div>
        <div className="task-list">
          {tasks.map(task => (
            <div 
              key={task.id}
              className={`task-list-item ${selectedTaskId === task.id ? 'active' : ''}`}
              onClick={() => setSelectedTaskId(task.id)}
            >
              <div className="task-item-top">
                <span>{task.workflowId || 'Unknown Workflow'}</span>
                {task.status === 'done' && <span className="task-item-status status-done"><CheckCircle2 size={12} /></span>}
                {task.status === 'failed' && <span className="task-item-status status-failed"><XCircle size={12} /></span>}
                {task.status === 'running' && <span className="task-item-status status-running"><PlayCircle size={12} /></span>}
              </div>
              <div className="task-item-intent">{task.intent}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-3)', display: 'flex', gap: '8px', marginTop: '2px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={10} /> {relativeTime(task.startTime)}</span>
                {task.durationMs && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Timer size={10} /> {formatDuration(task.durationMs)}</span>}
              </div>
            </div>
          ))}
          {tasks.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-3)', fontSize: '13px' }}>
              No tasks executed yet.
            </div>
          )}
        </div>
      </div>

      {/* ── Right Details Canvas ── */}
      <div className="task-canvas">
        {!selectedTask ? (
          <div className="task-empty-state">
            <LayoutDashboard size={48} opacity={0.3} />
            <p>Select a task from the left to view details</p>
          </div>
        ) : (
          <div>
            <div className="task-detail-header">
              <div>
                <h2 className="task-detail-title">{selectedTask.workflowId || 'Workflow Execution'}</h2>
                <div className="task-detail-meta">
                  <div className="task-detail-meta-item">
                    <Clock size={14} /> Started: {new Date(selectedTask.startTime).toLocaleTimeString()}
                  </div>
                  <div className="task-detail-meta-item">
                    <Timer size={14} /> Duration: {formatDuration(selectedTask.durationMs)}
                  </div>
                  <div className="task-detail-meta-item">
                    {selectedTask.scheduleType === 'interval' || selectedTask.scheduleType === 'scheduled' ? (
                      <><Calendar size={14} /> Scheduled Execution</>
                    ) : (
                      <><Zap size={14} /> Burst Execution</>
                    )}
                  </div>
                </div>
              </div>
              <div className="task-detail-badges">
                <span className={`task-badge ${selectedTask.status}`}>
                  {selectedTask.status}
                </span>
              </div>
            </div>

            <div className="task-section">
              <div className="task-section-title">
                <HardDriveDownload size={16} /> Extracted Data
              </div>
              {selectedTask.outputs && Object.keys(selectedTask.outputs).length > 0 ? (
                <div className="task-data-block">
                  {JSON.stringify(selectedTask.outputs, null, 2)}
                </div>
              ) : (
                <div style={{ color: 'var(--color-text-3)', fontSize: '13px', fontStyle: 'italic' }}>
                  No data was extracted during this execution.
                </div>
              )}
            </div>

            <div className="task-section">
              <div className="task-section-title">
                <Zap size={16} /> Execution Intent
              </div>
              <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5', color: 'var(--color-text)' }}>
                {selectedTask.intent}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
