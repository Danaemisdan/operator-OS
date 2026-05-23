import React, { useState, useEffect, useRef, useCallback } from 'react'
import { FileJson, Save, RefreshCw, X, Code, LayoutList, Trash2, Search, ChevronDown, ChevronRight } from 'lucide-react'
import VisualBuilder from './VisualBuilder'
import './WorkflowEditor.css'

interface WorkflowEditorProps {
  isTesting?: boolean
  setIsTesting?: (v: boolean) => void
}

const PLATFORM_ICONS: Record<string, string> = {
  linkedin: '💼',
  twitter: '🐦',
  instagram: '📸',
  whatsapp: '💬',
  telegram: '✈️',
  reddit: '🤖',
  youtube: '▶️',
  google: '🔍',
  unknown: '📄',
}

function getPlatformFromFilename(filename: string): string {
  const lower = filename.toLowerCase()
  for (const p of Object.keys(PLATFORM_ICONS)) {
    if (p !== 'unknown' && lower.includes(p)) return p
  }
  return 'unknown'
}

function groupByPlatform(files: string[], search: string): Record<string, string[]> {
  const filtered = search.trim()
    ? files.filter(f => f.toLowerCase().includes(search.toLowerCase()))
    : files

  const groups: Record<string, string[]> = {}
  for (const f of filtered) {
    const p = getPlatformFromFilename(f)
    if (!groups[p]) groups[p] = []
    groups[p].push(f)
  }
  return groups
}

export default function WorkflowEditor({ isTesting, setIsTesting }: WorkflowEditorProps) {
  const [files, setFiles] = useState<string[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [viewMode, setViewMode] = useState<'visual' | 'code'>('visual')
  const [search, setSearch] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(250)
  const isResizing = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  // ── Undo / Redo History ──
  const historyRef = useRef<string[]>([])
  const historyIndex = useRef(-1)
  const isUndoRedoing = useRef(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in an input/textarea (let native undo work there)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          // Redo
          if (historyIndex.current < historyRef.current.length - 1) {
            isUndoRedoing.current = true
            historyIndex.current += 1
            setFileContent(historyRef.current[historyIndex.current])
            setIsDirty(true)
            setTimeout(() => isUndoRedoing.current = false, 100)
          }
        } else {
          // Undo
          if (historyIndex.current > 0) {
            isUndoRedoing.current = true
            historyIndex.current -= 1
            setFileContent(historyRef.current[historyIndex.current])
            setIsDirty(true)
            setTimeout(() => isUndoRedoing.current = false, 100)
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleContentChange = useCallback((newContent: string) => {
    setFileContent(newContent)
    setIsDirty(true)
    
    if (isUndoRedoing.current) return

    clearTimeout((window as any).undoDebounce)
    ;(window as any).undoDebounce = setTimeout(() => {
      historyRef.current = historyRef.current.slice(0, historyIndex.current + 1)
      if (historyRef.current[historyRef.current.length - 1] !== newContent) {
        historyRef.current.push(newContent)
        historyIndex.current = historyRef.current.length - 1
      }
    }, 500)
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing.current || !containerRef.current) return
      const bounds = containerRef.current.getBoundingClientRect()
      setSidebarWidth(Math.min(Math.max(e.clientX - bounds.left, 160), 600))
    }
    const onMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const loadFiles = async () => {
    try {
      const list = await window.electronAPI.workflow.list()
      setFiles(list || [])
    } catch (e) {
      console.error('Failed to list files', e)
    }
  }

  useEffect(() => { loadFiles() }, [])

  const handleSelectFile = async (filename: string) => {
    if (isDirty && !confirm('Discard unsaved changes?')) return
    setSelectedFile(filename)
    try {
      const res = await window.electronAPI.workflow.read(filename)
      if (res.success) { 
        setFileContent(res.content)
        setIsDirty(false)
        historyRef.current = [res.content]
        historyIndex.current = 0
        isUndoRedoing.current = false
      }
      else alert('Failed to read: ' + res.error)
    } catch (e) { alert('Error: ' + e) }
  }

  const handleSave = async () => {
    if (!selectedFile) return
    setIsSaving(true)
    try {
      JSON.parse(fileContent)
      const res = await window.electronAPI.workflow.saveRaw(selectedFile, fileContent)
      if (res.success) setIsDirty(false)
      else alert('Save failed: ' + res.error)
    } catch (e) { alert('Invalid JSON!\n\n' + e) }
    setIsSaving(false)
  }

  const handleClose = () => {
    if (isDirty && !confirm('Discard unsaved changes?')) return
    setSelectedFile(null); setFileContent(''); setIsDirty(false)
  }

  const handleDelete = async (e: React.MouseEvent, filename: string) => {
    e.stopPropagation()
    if (!confirm(`Delete "${filename}"?`)) return
    try {
      const res = await window.electronAPI.workflow.delete(filename)
      if (res.success) {
        if (selectedFile === filename) { setSelectedFile(null); setFileContent(''); setIsDirty(false) }
        loadFiles()
      }
    } catch (err) { alert('Error deleting: ' + err) }
  }

  const toggleGroup = (platform: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(platform) ? next.delete(platform) : next.add(platform)
      return next
    })
  }

  const grouped = groupByPlatform(files, search)
  const platformOrder = ['linkedin', 'twitter', 'instagram', 'whatsapp', 'telegram', 'reddit', 'youtube', 'google', 'unknown']
  const sortedPlatforms = platformOrder.filter(p => grouped[p])

  return (
    <div className="workflow-editor-container" ref={containerRef}>

      {/* ── Resizable file list sidebar ── */}
      <div className="workflow-sidebar" style={{ width: sidebarWidth }}>
        <div className="workflow-sidebar-header">
          <h3>Workflows</h3>
          <button onClick={loadFiles} className="icon-btn" title="Refresh"><RefreshCw size={13} /></button>
        </div>

        {/* Search */}
        <div className="workflow-search-wrap">
          <Search size={12} className="workflow-search-icon" />
          <input
            className="workflow-search-input"
            placeholder="Search automations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="workflow-search-clear" onClick={() => setSearch('')}>×</button>
          )}
        </div>

        {/* Platform-grouped list */}
        <div className="workflow-list custom-scrollbar">
          {files.length === 0 && (
            <div className="workflow-empty-msg">No workflows saved yet.</div>
          )}
          {sortedPlatforms.map(platform => (
            <div key={platform} className="workflow-platform-group">
              <button
                className="workflow-platform-header"
                onClick={() => toggleGroup(platform)}
              >
                <span className="platform-group-icon">{PLATFORM_ICONS[platform]}</span>
                <span className="platform-group-name">{platform.charAt(0).toUpperCase() + platform.slice(1)}</span>
                <span className="platform-group-count">{grouped[platform].length}</span>
                <span className="platform-group-chevron">
                  {collapsedGroups.has(platform) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </span>
              </button>
              {!collapsedGroups.has(platform) && grouped[platform].map(f => (
                <div
                  key={f}
                  className={`workflow-list-item ${selectedFile === f ? 'active' : ''}`}
                  onClick={() => handleSelectFile(f)}
                >
                  <FileJson size={12} className="shrink-0" />
                  <span className="workflow-filename">{f.replace(/^recorded_/, '').replace(/_/g, ' ').replace('.json', '')}</span>
                  {selectedFile === f && isDirty && <div className="dirty-dot shrink-0" />}
                  <button className="workflow-list-delete shrink-0" onClick={e => handleDelete(e, f)} title="Delete">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          ))}
          {search && sortedPlatforms.length === 0 && (
            <div className="workflow-empty-msg">No matches for "{search}"</div>
          )}
        </div>
      </div>

      {/* Drag resize handle */}
      <div className="sidebar-resize-handle" onMouseDown={onMouseDown} />

      {/* ── Main editor area ── */}
      <div className="workflow-main">
        {selectedFile ? (
          <div className="workflow-editor-view">
            <div className="workflow-editor-header">
              <div className="editor-file-info">
                <span>{PLATFORM_ICONS[getPlatformFromFilename(selectedFile)]}</span>
                <span className="editor-filename">
                  {selectedFile.replace(/^recorded_/, '').replace(/_/g, ' ').replace('.json', '')}
                </span>
                {isDirty && <span className="editor-dirty-badge">Unsaved</span>}
              </div>

              <div className="editor-view-toggle">
                <button className={`view-toggle-btn ${viewMode === 'visual' ? 'active' : ''}`} onClick={() => setViewMode('visual')}>
                  <LayoutList size={13} /> Visual
                </button>
                <button className={`view-toggle-btn ${viewMode === 'code' ? 'active' : ''}`} onClick={() => setViewMode('code')}>
                  <Code size={13} /> JSON
                </button>
              </div>

              <div className="editor-actions">
                <button className={`editor-save-btn ${isDirty ? 'primary' : ''}`} onClick={handleSave} disabled={!isDirty || isSaving}>
                  <Save size={13} /> {isSaving ? 'Saving…' : 'Save'}
                </button>
                <button className="editor-close-btn" onClick={handleClose}><X size={15} /></button>
              </div>
            </div>

            {viewMode === 'visual' ? (
              <VisualBuilder
                content={fileContent}
                onChange={handleContentChange}
                isTesting={isTesting}
                setIsTesting={setIsTesting}
              />
            ) : (
              <textarea
                className="workflow-textarea custom-scrollbar"
                value={fileContent}
                onChange={e => handleContentChange(e.target.value)}
                spellCheck={false}
              />
            )}
          </div>
        ) : (
          <div className="workflow-editor-empty">
            <div className="editor-empty-icon">🗂️</div>
            <h2>Workflow Studio</h2>
            <p>Select a workflow from the left to open it, or record a new one.</p>
          </div>
        )}
      </div>
    </div>
  )
}
