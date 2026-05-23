import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ReactFlow, Controls, Background, applyNodeChanges, applyEdgeChanges, addEdge, Node, Edge, Connection, NodeChange, EdgeChange, ReactFlowProvider, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './VisualBuilder.css'
import { ActionNode, ConditionNode, LoopNode, CodeNode, AITaskNode, StartNode, EventLoopNode, EventTimerNode, EventSchedulerNode } from './GraphNodes'
import { autoLayout } from './layoutEngine'
import { Plus, Zap, LayoutGrid } from 'lucide-react'

const nodeTypes = {
  action: ActionNode,
  condition: ConditionNode,
  loop: LoopNode,
  code: CodeNode,
  aiTask: AITaskNode,
  start: StartNode,
  eventLoop: EventLoopNode,
  eventTimer: EventTimerNode,
  eventScheduler: EventSchedulerNode,
}

interface VisualBuilderProps {
  content: string
  onChange: (newContent: string) => void
  isTesting?: boolean
  setIsTesting?: (v: boolean) => void
}

function VisualBuilderInner({ content, onChange, isTesting, setIsTesting }: VisualBuilderProps) {
  let parsed: any = null
  let parseError = ''
  
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    parseError = e instanceof Error ? e.message : String(e)
  }

  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  
  const [menuPos, setMenuPos] = useState<{x: number, y: number} | null>(null)
  const [pendingEdge, setPendingEdge] = useState<any>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [testLogs, setTestLogs] = useState<Array<{level: string, message: string}> | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, fitView } = useReactFlow()
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  // Tracks content changes we ourselves triggered (drag, connect, type in node)
  // so we don't re-run auto-layout when the user moves a node
  const isSavingInternally = useRef(false)

  // Initialization & Backward Compatibility
  // Runs when `content` changes — but SKIPS layout when WE triggered the change
  // (drag, connect, type in a node field) so user positions are preserved.
  useEffect(() => {
    // If this content update came from our own saveGraph call, skip entirely
    if (isSavingInternally.current) {
      isSavingInternally.current = false
      return
    }

    if (!parsed || !parsed.skills || !parsed.skills[0]) return

    const skill = parsed.skills[0]
    
    // Existing graph — load it and auto-layout (only happens on file open)
    if (skill.nodes && skill.edges) {
      const laidOut = autoLayout(skill.nodes, skill.edges)
      setNodes(laidOut)
      setEdges(skill.edges)
      setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 100)
      return
    }

    // Legacy steps array — convert and layout once on first open
    const steps = skill.steps || []
    const newNodes: Node[] = []
    const newEdges: Edge[] = []

    steps.forEach((step: any, idx: number) => {
      const id = `node_${idx}`
      let type = 'action'
      if (step.action === 'condition') type = 'condition'
      if (step.action === 'loop') type = 'loop'
      if (step.action === 'code') type = 'code'
      if (step.action === 'aiTask') type = 'aiTask'

      newNodes.push({
        id,
        type,
        position: { x: 250, y: 50 + idx * 200 },
        data: step
      })

      if (idx > 0) {
        newEdges.push({
          id: `edge_${idx-1}_${idx}`,
          source: `node_${idx-1}`,
          target: id
        })
      }
    })

    const laidOut = autoLayout(newNodes, newEdges)
    setNodes(laidOut)
    setEdges(newEdges)
    setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 100)
  }, [content])

  // Subscribe to live test-log events from the main process
  useEffect(() => {
    const cleanup = (window as any).electronAPI?.workflow?.onTestLog?.((entry: {level: string, message: string}) => {
      setTestLogs(prev => [...(prev || []), entry])
    })
    return () => { if (cleanup) cleanup() }
  }, [])

  // Auto-scroll logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [testLogs])

  const saveGraph = (newNodes: Node[], newEdges: Edge[]) => {
    if (!parsed || !parsed.skills || !parsed.skills[0]) return
    const updated = { ...parsed }
    updated.skills[0].nodes = newNodes
    updated.skills[0].edges = newEdges
    delete updated.skills[0].steps
    // Flag that WE are triggering this content change — do NOT re-layout
    isSavingInternally.current = true
    onChange(JSON.stringify(updated, null, 2))
  }

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => {
      const updatedNodes = applyNodeChanges(changes, nds)
      saveGraph(updatedNodes, edges)
      return updatedNodes
    })
  }, [edges, parsed])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => {
      const updatedEdges = applyEdgeChanges(changes, eds)
      saveGraph(nodes, updatedEdges)
      return updatedEdges
    })
  }, [nodes, parsed])

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => {
      const updatedEdges = addEdge(params, eds)
      saveGraph(nodes, updatedEdges)
      return updatedEdges
    })
  }, [nodes, parsed])

  const addNode = (type: string, pos?: {x: number, y: number}) => {
    const id = `node_${Date.now()}`
    
    let finalPos = pos
    if (!finalPos && reactFlowWrapper.current) {
      const bounds = reactFlowWrapper.current.getBoundingClientRect()
      finalPos = screenToFlowPosition({
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      })
    }

    const defaultData: Record<string, any> = {
      action:        { action: 'navigate', purpose: '' },
      condition:     { conditionType: 'js', condition: 'true', action: 'condition' },
      loop:          { action: 'loop', arrayVar: '', itemVar: 'item' },
      code:          { action: 'code', code: '', output: '' },
      aiTask:        { action: 'aiTask', prompt: '', output: '' },
      start:         { description: '' },
      eventLoop:     { interval: '5', unit: 'minutes', maxRuns: '0' },
      eventTimer:    { delay: '30', unit: 'seconds' },
      eventScheduler:{ scheduleMode: 'simple', time: '09:00', days: ['Mon','Tue','Wed','Thu','Fri'], cron: '0 9 * * 1-5' },
    }

    const newNode: Node = {
      id,
      type,
      position: finalPos || { x: 250, y: 50 + nodes.length * 150 },
      data: defaultData[type] || {}
    }
    const updatedNodes = [...nodes, newNode]
    
    let updatedEdges = edges
    if (pendingEdge) {
      if (pendingEdge.handleType === 'target') {
        // Dragged FROM a top/target handle backwards — new node is the source
        updatedEdges = [...edges, {
          id: `edge_${Date.now()}`,
          source: id,
          target: pendingEdge.nodeId,
          targetHandle: pendingEdge.handleId
        }]
      } else {
        // Dragged FROM a bottom/source handle forwards — new node is the target
        updatedEdges = [...edges, {
          id: `edge_${Date.now()}`,
          source: pendingEdge.nodeId,
          target: id,
          sourceHandle: pendingEdge.handleId
        }]
      }
      setPendingEdge(null)
    }

    setNodes(updatedNodes)
    setEdges(updatedEdges)
    saveGraph(updatedNodes, updatedEdges)
    setMenuPos(null)
  }

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, connectionState: any) => {
    if (!connectionState.isValid) {
      const { clientX, clientY } = 'changedTouches' in event ? event.changedTouches[0] : event
      setPendingEdge({ 
        nodeId: connectionState.fromNode.id, 
        handleId: connectionState.fromHandle?.id,
        handleType: connectionState.fromHandle?.type || 'source'
      })
      setMenuPos({ x: clientX, y: clientY })
    }
  }, [])

  // ── Auto-layout: re-run dagre and fit view ──────────────────────────────────
  const runLayout = useCallback(() => {
    setNodes(nds => {
      const laidOut = autoLayout(nds, edges)
      saveGraph(laidOut, edges)
      setTimeout(() => fitView({ padding: 0.15, duration: 500 }), 50)
      return laidOut
    })
  }, [edges, fitView])

  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    setMenuPos({ x: event.clientX, y: event.clientY })
    setPendingEdge(null)
  }, [])

  const onPaneClick = () => {
    setMenuPos(null)
  }

  const updateSkillField = (field: string, value: string) => {
    const updated = { ...parsed }
    updated.skills[0][field] = value
    onChange(JSON.stringify(updated, null, 2))
  }

  if (parseError || !parsed || !parsed.skills || !parsed.skills[0]) {
    return (
      <div className="visual-builder-error">
        <h3>Cannot Render Graph View</h3>
        <pre className="error-text">{parseError}</pre>
      </div>
    )
  }

  const skill = parsed.skills[0]

  return (
    <div className="visual-builder-container">
      {/* Top Header */}
      <div className="visual-builder-header-panel" style={{ flexShrink: 0, zIndex: 10 }}>
        <div className="form-group row-group" style={{ flexWrap: 'wrap', gap: '6px' }}>
          <input 
            type="text" 
            value={skill.name || ''} 
            onChange={e => updateSkillField('name', e.target.value)}
            className="visual-input header-input"
            placeholder="Workflow Name"
          />
          {/* Trigger / Start nodes */}
          <button className="add-step-btn" style={{ color: '#34d399', borderColor: 'rgba(52,211,153,0.3)' }} onClick={() => addNode('start')}>
            <Zap size={13} /> Start
          </button>
          <button className="add-step-btn" style={{ color: '#22d3ee', borderColor: 'rgba(34,211,238,0.3)' }} onClick={() => addNode('eventLoop')}>
            🔄 Loop Trigger
          </button>
          <button className="add-step-btn" style={{ color: '#fb923c', borderColor: 'rgba(251,146,60,0.3)' }} onClick={() => addNode('eventTimer')}>
            ⏱ Timer
          </button>
          <button className="add-step-btn" style={{ color: '#a78bfa', borderColor: 'rgba(167,139,250,0.3)' }} onClick={() => addNode('eventScheduler')}>
            📅 Scheduler
          </button>
          <div style={{ width: '1px', background: 'var(--color-border)', margin: '0 2px' }} />
          {/* Action nodes */}
          <button className="add-step-btn" onClick={() => addNode('action')}>
            <Plus size={14} /> Action
          </button>
          <button className="add-step-btn border-red" onClick={() => addNode('condition')}>
            <Plus size={14} /> Condition
          </button>
          <button className="add-step-btn text-indigo-400" onClick={() => addNode('loop')}>
            <Plus size={14} /> Loop
          </button>
          <button className="add-step-btn text-orange-400" onClick={() => addNode('code')}>
            <Plus size={14} /> Code
          </button>
          <button className="add-step-btn text-pink-400" onClick={() => addNode('aiTask')}>
            <Plus size={14} /> AI Task
          </button>
          <div style={{ width: '1px', background: 'var(--color-border)', margin: '0 2px' }} />
          {/* Layout button */}
          <button
            className="add-step-btn"
            title="Auto-arrange all nodes"
            onClick={runLayout}
            style={{ color: '#94a3b8' }}
          >
            <LayoutGrid size={13} /> Layout
          </button>
          <button 
            className={`add-step-btn btn-test-flow${isRunning ? ' running' : ''}`} 
            disabled={isRunning}
            onClick={async () => {
              setIsRunning(true)
              setTestLogs([{ level: 'info', message: '▶ Starting workflow test...' }])
              setIsTesting?.(true)
              try {
                await (window as any).electronAPI?.workflow?.test?.(content)
              } finally {
                setIsRunning(false)
              }
            }}
          >
            {isRunning ? '⏳ Running...' : '▶ Test Flow'}
          </button>
        </div>
      </div>

      {/* Main Layout: Graph & Properties Sidebar */}
      <div className="graph-layout">
        <div className="graph-canvas-container" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd as any}
            onPaneContextMenu={onPaneContextMenu}
            onEdgeDoubleClick={(event, edge) => {
              setEdges(eds => eds.filter(e => e.id !== edge.id));
            }}
            nodeTypes={nodeTypes}
            onPaneClick={onPaneClick}
            panOnScroll={true}
            panOnScrollMode={'free' as any}
            zoomOnScroll={false}
            zoomOnPinch={true}
            selectionOnDrag={false}
            fitView
          >
            <Background color="#333" gap={16} />
            <Controls />
          </ReactFlow>

          {menuPos && (
            <div 
              className="context-menu" 
              style={{ top: menuPos.y - 120, left: menuPos.x - 300, position: 'absolute', zIndex: 1000 }}
            >
              <div className="context-menu-title">Add Node</div>
              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '4px', marginBottom: '4px', fontSize: '9px', color: '#64748b', padding: '0 8px 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Triggers</div>
              <button onClick={() => addNode('start', screenToFlowPosition({ x: menuPos.x, y: menuPos.y }))} style={{ color: '#34d399' }}>▶ Start</button>
              <button onClick={() => addNode('eventLoop', screenToFlowPosition({ x: menuPos.x, y: menuPos.y }))} style={{ color: '#22d3ee' }}>🔄 Loop Trigger</button>
              <button onClick={() => addNode('eventTimer', screenToFlowPosition({ x: menuPos.x, y: menuPos.y }))} style={{ color: '#fb923c' }}>⏱ Timer</button>
              <button onClick={() => addNode('eventScheduler', screenToFlowPosition({ x: menuPos.x, y: menuPos.y }))} style={{ color: '#a78bfa' }}>📅 Scheduler</button>
              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', margin: '4px 0', fontSize: '9px', color: '#64748b', padding: '4px 8px 0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Actions</div>
              <button onClick={() => addNode('action', screenToFlowPosition({ x: menuPos.x, y: menuPos.y }))}>🎯 Action</button>
              <button onClick={() => addNode('condition', screenToFlowPosition({ x: menuPos.x, y: menuPos.y }))} className="text-red-400">🔀 Condition</button>
              <button onClick={() => addNode('loop', screenToFlowPosition({ x: menuPos.x, y: menuPos.y }))} className="text-indigo-400">🔁 Loop</button>
              <button onClick={() => addNode('code', screenToFlowPosition({ x: menuPos.x, y: menuPos.y }))} className="text-orange-400">⚡️ Code</button>
              <button onClick={() => addNode('aiTask', screenToFlowPosition({ x: menuPos.x, y: menuPos.y }))} className="text-pink-400">🧠 AI Task</button>
            </div>
          )}
        </div>

        {/* Live Test Log Overlay */}
        {testLogs && (
          <div className="test-log-overlay">
            <div className="test-log-header">
              <span>🤖 Agent Log</span>
              <button className="test-log-close" onClick={() => { setTestLogs(null); setIsTesting?.(false) }}>✕</button>
            </div>
            <div className="test-log-body">
              {testLogs.map((log, i) => (
                <div key={i} className={`test-log-entry log-${log.level}`}>
                  <span className="log-icon">{log.level === 'success' ? '✅' : log.level === 'error' ? '❌' : log.level === 'thinking' ? '🤔' : log.level === 'action' ? '→' : 'ℹ'}</span>
                  <span>{log.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function VisualBuilder(props: VisualBuilderProps) {
  return (
    <ReactFlowProvider>
      <VisualBuilderInner {...props} />
    </ReactFlowProvider>
  )
}
