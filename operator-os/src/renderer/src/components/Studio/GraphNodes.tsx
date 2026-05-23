import React, { useMemo } from 'react'
import { Handle, Position, useReactFlow, useNodes, useEdges } from '@xyflow/react'
import { Globe, MousePointerClick, Keyboard, Timer, Download, CornerDownLeft, CheckCircle2, Split, Repeat, Database, Play, Clock, RefreshCw, CalendarClock } from 'lucide-react'

export function renderStepIcon(action: string) {
  switch (action) {
    case 'navigate': return <Globe size={14} className="text-blue-400" />
    case 'click': return <MousePointerClick size={14} className="text-purple-400" />
    case 'type': return <Keyboard size={14} className="text-green-400" />
    case 'keypress': return <CornerDownLeft size={14} className="text-orange-400" />
    case 'wait': return <Timer size={14} className="text-yellow-400" />
    case 'extract': return <Download size={14} className="text-teal-400" />
    case 'verify': return <CheckCircle2 size={14} className="text-pink-400" />
    case 'scroll': return <MousePointerClick size={14} className="text-gray-400" />
    case 'condition': return <Split size={14} className="text-red-400" />
    case 'loop': return <Repeat size={14} className="text-indigo-400" />
    case 'set_variable': return <Database size={14} className="text-blue-400" />
    case 'start': return <Play size={14} className="text-emerald-400" />
    case 'eventLoop': return <RefreshCw size={14} className="text-cyan-400" />
    case 'eventTimer': return <Clock size={14} className="text-orange-400" />
    case 'eventScheduler': return <CalendarClock size={14} className="text-violet-400" />
    case 'store_data': return <Database size={14} className="text-emerald-500" />
    case 'call_workflow': return <Play size={14} className="text-indigo-500" />
    default: return <div className="w-3 h-3 rounded-full bg-gray-500" />
  }
}

function getAvailableVariables(targetNodeId: string, nodes: any[], edges: any[]): string[] {
  const vars: Set<string> = new Set()
  // Global variables: any node that defines an 'output' or 'itemVar' makes it available globally
  for (const node of nodes) {
    if (node.type === 'start') {
      vars.add('intent')
    }
    if (node.data.output) {
      vars.add(node.data.output)
    }
    if (node.type === 'loop' && node.data.itemVar) {
      vars.add(node.data.itemVar)
    }
  }
  return Array.from(vars)
}

function VariablePicker({ nodeId, onSelect }: { nodeId: string, onSelect: (v: string) => void }) {
  const nodes = useNodes()
  const edges = useEdges()
  const vars = useMemo(() => getAvailableVariables(nodeId, nodes, edges), [nodeId, nodes, edges])
  
  if (vars.length === 0) return null
  
  return (
    <div className="variable-picker nodrag" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
      {vars.map(v => (
        <button 
          key={v} 
          onClick={() => onSelect(`{{${v}}}`)}
          className="nodrag"
          title={`Click to use {{${v}}}`}
          style={{ fontSize: '10px', background: '#334155', border: '1px solid #475569', borderRadius: '4px', padding: '2px 6px', color: '#cbd5e1', cursor: 'pointer' }}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// START NODE (Manual Trigger)
// ─────────────────────────────────────────────────────────────────────────────
export function StartNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()
  return (
    <div className={`graph-node start-node ${selected ? 'selected' : ''}`}>
      {/* No incoming handle — this is where execution begins */}
      <div className="node-header start-header">
        <Play size={14} />
        <span className="node-title">START</span>
        <span className="trigger-badge">TRIGGER</span>
      </div>
      <div className="node-body">
        <div className="input-group">
          <label>Intent / Prompt</label>
          <textarea
            className="node-input nodrag"
            placeholder="What should the AI do or what is the goal of this workflow?"
            value={data.intent || ''}
            onChange={e => updateNodeData(id, { intent: e.target.value })}
            style={{ minHeight: '50px', resize: 'vertical' }}
          />
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="handle-bottom" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT LOOP NODE (Repeat Trigger)
// ─────────────────────────────────────────────────────────────────────────────
export function EventLoopNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()
  return (
    <div className={`graph-node event-loop-node ${selected ? 'selected' : ''}`}>
      <div className="node-header event-loop-header">
        <RefreshCw size={14} />
        <span className="node-title">LOOP TRIGGER</span>
        <span className="trigger-badge trigger-badge-cyan">TRIGGER</span>
      </div>
      <div className="node-body">
        <div className="input-group">
          <label>Run every</label>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              className="node-input nodrag"
              type="number"
              min="1"
              style={{ width: '60px' }}
              placeholder="5"
              value={data.interval || ''}
              onChange={e => updateNodeData(id, { interval: e.target.value })}
            />
            <select
              className="node-input nodrag"
              style={{ flex: 1 }}
              value={data.unit || 'minutes'}
              onChange={e => updateNodeData(id, { unit: e.target.value })}
            >
              <option value="seconds">seconds</option>
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
            </select>
          </div>
        </div>
        <div className="input-group">
          <label>Max runs (0 = infinite)</label>
          <input
            className="node-input nodrag"
            type="number"
            min="0"
            placeholder="0"
            value={data.maxRuns ?? ''}
            onChange={e => updateNodeData(id, { maxRuns: e.target.value })}
          />
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="handle-bottom" style={{ background: '#22d3ee' }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT TIMER NODE (One-time Delay Trigger)
// ─────────────────────────────────────────────────────────────────────────────
export function EventTimerNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()
  return (
    <div className={`graph-node event-timer-node ${selected ? 'selected' : ''}`}>
      <div className="node-header event-timer-header">
        <Clock size={14} />
        <span className="node-title">TIMER</span>
        <span className="trigger-badge trigger-badge-orange">TRIGGER</span>
      </div>
      <div className="node-body">
        <div className="input-group">
          <label>Wait before starting</label>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              className="node-input nodrag"
              type="number"
              min="1"
              style={{ width: '60px' }}
              placeholder="30"
              value={data.delay || ''}
              onChange={e => updateNodeData(id, { delay: e.target.value })}
            />
            <select
              className="node-input nodrag"
              style={{ flex: 1 }}
              value={data.unit || 'seconds'}
              onChange={e => updateNodeData(id, { unit: e.target.value })}
            >
              <option value="seconds">seconds</option>
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
            </select>
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="handle-bottom" style={{ background: '#fb923c' }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT SCHEDULER NODE (Cron / Scheduled Trigger)
// ─────────────────────────────────────────────────────────────────────────────
export function EventSchedulerNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()
  const mode = data.scheduleMode || 'simple'
  return (
    <div className={`graph-node event-scheduler-node ${selected ? 'selected' : ''}`}>
      <div className="node-header event-scheduler-header">
        <CalendarClock size={14} />
        <span className="node-title">SCHEDULER</span>
        <span className="trigger-badge trigger-badge-violet">TRIGGER</span>
      </div>
      <div className="node-body">
        <div className="input-group">
          <label>Mode</label>
          <select
            className="node-input nodrag"
            value={mode}
            onChange={e => updateNodeData(id, { scheduleMode: e.target.value })}
          >
            <option value="simple">Simple (time of day)</option>
            <option value="cron">Cron expression</option>
          </select>
        </div>
        {mode === 'simple' ? (
          <>
            <div className="input-group">
              <label>Time (HH:MM)</label>
              <input
                className="node-input nodrag"
                type="time"
                value={data.time || '09:00'}
                onChange={e => updateNodeData(id, { time: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>Days</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => {
                  const selected = (data.days || []).includes(day)
                  return (
                    <button
                      key={day}
                      className="nodrag"
                      onClick={() => {
                        const days: string[] = data.days || []
                        updateNodeData(id, { days: selected ? days.filter((d: string) => d !== day) : [...days, day] })
                      }}
                      style={{
                        fontSize: '10px', padding: '2px 5px', borderRadius: '4px', cursor: 'pointer', border: '1px solid',
                        background: selected ? '#7c3aed' : 'transparent',
                        borderColor: selected ? '#7c3aed' : '#475569',
                        color: selected ? 'white' : '#94a3b8'
                      }}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="input-group">
            <label>Cron Expression</label>
            <input
              className="node-input nodrag"
              placeholder="0 9 * * 1-5  (weekdays 9am)"
              value={data.cron || ''}
              onChange={e => updateNodeData(id, { cron: e.target.value })}
            />
            <span style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
              min hour day month weekday
            </span>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="handle-bottom" style={{ background: '#8b5cf6' }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION NODE
// ─────────────────────────────────────────────────────────────────────────────
export function ActionNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()

  const updateField = (field: string, value: string) => {
    updateNodeData(id, { [field]: value })
  }

  return (
    <div className={`graph-node action-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} className="handle-top" />
      <div className="node-header">
        <span className="node-icon">{renderStepIcon(data.action)}</span>
        <select 
          className="node-type-select nodrag" 
          value={data.action} 
          onChange={e => updateField('action', e.target.value)}
        >
          <option value="navigate">NAVIGATE</option>
          <option value="click">CLICK</option>
          <option value="type">TYPE</option>
          <option value="keypress">KEYPRESS</option>
          <option value="wait">WAIT</option>
          <option value="extract">EXTRACT</option>
          <option value="scroll">SCROLL</option>
          <option value="verify">VERIFY</option>
          <option value="set_variable">SET VAR</option>
          <option value="store_data">STORE DATA</option>
          <option value="call_workflow">CALL WORKFLOW</option>
        </select>
      </div>
      <div className="node-body">
        <div className="input-group">
          <label>Intent / Purpose</label>
          <input 
            className="node-input nodrag" 
            placeholder="Intent / Goal..." 
            value={data.intent || data.purpose || ''} 
            onChange={e => {
              updateField('intent', e.target.value)
              updateField('purpose', e.target.value)
            }}
          />
        </div>

        {data.action === 'navigate' && (
          <div className="input-group">
            <label>URL</label>
            <input className="node-input nodrag" placeholder="URL" value={data.url || ''} onChange={e => updateField('url', e.target.value)} />
            <VariablePicker nodeId={id} onSelect={(v) => updateField('url', (data.url || '') + v)} />
          </div>
        )}
        
        {(data.action === 'click' || data.action === 'type' || data.action === 'extract') && (
          <div className="input-group">
            <label>DOM Selector</label>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input 
                className="node-input nodrag" 
                style={{ flex: 1 }}
                placeholder="Selector" 
                value={data.selector || ''} 
                onChange={e => updateField('selector', e.target.value)} 
              />
              <button 
                className="nodrag"
                style={{ padding: '0 8px', borderRadius: '4px', background: '#3b82f6', color: 'white', border: 'none', cursor: 'pointer', fontSize: '10px', whiteSpace: 'nowrap' }}
                onClick={async () => {
                  (window as any)._activePickingNodeId = id;
                  window.dispatchEvent(new Event('picker-started'));
                  await (window as any).electronAPI.browser.startPicker();
                }}
              >
                Pick
              </button>
            </div>
          </div>
        )}

        {data.action === 'type' && (
          <div className="input-group">
            <label>Text to Type (use {"{{vars}}"})</label>
            <input className="node-input nodrag" placeholder="Value to Type" value={data.value || ''} onChange={e => updateField('value', e.target.value)} />
            <VariablePicker nodeId={id} onSelect={(v) => updateField('value', (data.value || '') + v)} />
          </div>
        )}

        {data.action === 'keypress' && (
          <div className="input-group">
            <label>Key</label>
            <input className="node-input nodrag" placeholder="Key (e.g. Enter, Tab, Escape)" value={data.key || ''} onChange={e => updateField('key', e.target.value)} />
          </div>
        )}

        {data.action === 'wait' && (
          <div className="input-group">
            <label>Wait Duration (ms)</label>
            <input className="node-input nodrag" type="number" placeholder="Milliseconds" value={data.ms || ''} onChange={e => updateField('ms', e.target.value)} />
          </div>
        )}

        {data.action === 'extract' && (
          <>
            <div className="input-group">
              <label>Target Description</label>
              <input className="node-input nodrag" placeholder="What to extract (desc)" value={data.targetName || ''} onChange={e => updateField('targetName', e.target.value)} />
            </div>
            <div className="input-group">
              <label>Save to Variable</label>
              <input className="node-input nodrag" placeholder="Variable Name" value={data.output || ''} onChange={e => updateField('output', e.target.value)} />
            </div>
          </>
        )}

        {data.action === 'scroll' && (
          <div className="input-group">
            <label>Direction</label>
            <select className="node-input nodrag" value={data.direction || 'down'} onChange={e => updateField('direction', e.target.value)}>
              <option value="down">Down</option>
              <option value="up">Up</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </div>
        )}

        {data.action === 'verify' && (
          <div className="input-group">
            <label>Goal to verify</label>
            <input className="node-input nodrag" placeholder="e.g. Is the button visible?" value={data.goal || ''} onChange={e => updateField('goal', e.target.value)} />
          </div>
        )}

        {data.action === 'set_variable' && (
          <>
            <div className="input-group">
              <label>Variable Name</label>
              <input className="node-input nodrag" placeholder="e.g. leadName" value={data.output || ''} onChange={e => updateField('output', e.target.value)} />
            </div>
            <div className="input-group">
              <label>Value</label>
              <input className="node-input nodrag" placeholder="Value (can use {{vars}})" value={data.value || ''} onChange={e => updateField('value', e.target.value)} />
              <VariablePicker nodeId={id} onSelect={(v) => updateField('value', (data.value || '') + v)} />
            </div>
          </>
        )}

        {data.action === 'store_data' && (
          <>
            <div className="input-group">
              <label>Collection / Store Name</label>
              <input className="node-input nodrag" placeholder="e.g. leads_database" value={data.targetName || ''} onChange={e => updateField('targetName', e.target.value)} />
              <VariablePicker nodeId={id} onSelect={(v) => updateField('targetName', (data.targetName || '') + v)} />
            </div>
            <div className="input-group">
              <label>Data to Store (JSON or Text)</label>
              <input className="node-input nodrag" placeholder="e.g. {{extracted_lead}}" value={data.value || ''} onChange={e => updateField('value', e.target.value)} />
              <VariablePicker nodeId={id} onSelect={(v) => updateField('value', (data.value || '') + v)} />
            </div>
          </>
        )}

        {data.action === 'call_workflow' && (
          <>
            <div className="input-group">
              <label>Workflow ID / Name</label>
              <input className="node-input nodrag" placeholder="e.g. extract_profile" value={data.targetName || ''} onChange={e => updateField('targetName', e.target.value)} />
            </div>
            <div className="input-group">
              <label>Variables to Pass (JSON Map)</label>
              <input className="node-input nodrag" placeholder='e.g. {"url": "{{url}}"}' value={data.value || ''} onChange={e => updateField('value', e.target.value)} />
              <VariablePicker nodeId={id} onSelect={(v) => updateField('value', (data.value || '') + v)} />
            </div>
            <div className="input-group">
              <label>Save Result To</label>
              <input className="node-input nodrag" placeholder="Variable Name" value={data.output || ''} onChange={e => updateField('output', e.target.value)} />
            </div>
          </>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="handle-bottom" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CONDITION NODE
// ─────────────────────────────────────────────────────────────────────────────
export function ConditionNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()

  const updateField = (field: string, value: string) => {
    updateNodeData(id, { [field]: value })
  }

  const conditionType = data.conditionType || 'js'

  return (
    <div className={`graph-node condition-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} className="handle-top" />
      <div className="node-header">
        <span className="node-icon">{renderStepIcon('condition')}</span>
        <span className="node-title">CONDITION</span>
      </div>
      <div className="node-body">
        <select 
          className="node-type-select nodrag" 
          value={conditionType} 
          onChange={e => updateField('conditionType', e.target.value)}
          style={{ width: '100%', marginBottom: '6px', padding: '4px 6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white', fontSize: '11px' }}
        >
          <option value="js">Javascript Logic</option>
          <option value="element_exists">Element Exists</option>
          <option value="text_exists">Text Exists</option>
          <option value="page_loaded">Page Loaded</option>
          <option value="ai">AI Verification</option>
        </select>
        
        {conditionType === 'js' && (
          <>
            <input className="node-input nodrag" placeholder="e.g. {{leads.length}} > 0" value={data.condition || ''} onChange={e => updateField('condition', e.target.value)} />
            <VariablePicker nodeId={id} onSelect={(v) => updateField('condition', (data.condition || '') + v)} />
          </>
        )}
        {conditionType === 'element_exists' && (
          <input className="node-input nodrag" placeholder="CSS Selector" value={data.selector || ''} onChange={e => updateField('selector', e.target.value)} />
        )}
        {conditionType === 'text_exists' && (
          <>
            <input className="node-input nodrag" placeholder="Text to find on page" value={data.text || ''} onChange={e => updateField('text', e.target.value)} />
            <VariablePicker nodeId={id} onSelect={(v) => updateField('text', (data.text || '') + v)} />
          </>
        )}
        {conditionType === 'page_loaded' && (
          <div style={{ fontSize: '11px', color: '#64748b', padding: '4px 0' }}>Checks if document.readyState === 'complete'</div>
        )}
        {conditionType === 'ai' && (
          <>
            <input className="node-input nodrag" placeholder="Goal — e.g. 'Is user logged in?'" value={data.goal || ''} onChange={e => updateField('goal', e.target.value)} />
            <VariablePicker nodeId={id} onSelect={(v) => updateField('goal', (data.goal || '') + v)} />
          </>
        )}
      </div>
      {/* TRUE / FALSE handle row — each cell is position:relative so handle centers automatically */}
      <div className="handles-bottom-row">
        <div className="handle-container">
          <span>TRUE</span>
          <Handle type="source" position={Position.Bottom} id="true" className="handle-true" />
        </div>
        <div className="handle-container">
          <span>FALSE</span>
          <Handle type="source" position={Position.Bottom} id="false" className="handle-false" />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LOOP NODE
// ─────────────────────────────────────────────────────────────────────────────
export function LoopNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()

  const updateField = (field: string, value: string) => {
    updateNodeData(id, { [field]: value })
  }

  return (
    <div className={`graph-node loop-node ${selected ? 'selected' : ''}`} style={{ borderLeftColor: '#818cf8' }}>
      <Handle type="target" position={Position.Top} className="handle-top" />
      <div className="node-header">
        <span className="node-icon">{renderStepIcon('loop')}</span>
        <span className="node-title">LOOP ITEMS</span>
      </div>
      <div className="node-body">
        <input 
          className="node-input nodrag" 
          placeholder="Array Variable (e.g. {{leads}})" 
          value={data.arrayVar || ''} 
          onChange={e => updateField('arrayVar', e.target.value)} 
        />
        <VariablePicker nodeId={id} onSelect={(v) => updateField('arrayVar', (data.arrayVar || '') + v)} />
        <input 
          className="node-input nodrag" 
          placeholder="Item Variable (e.g. item)" 
          value={data.itemVar || 'item'} 
          onChange={e => updateField('itemVar', e.target.value)} 
        />
      </div>
      <div className="handles-bottom-row">
        <div className="handle-container">
          <span>EACH</span>
          <Handle type="source" position={Position.Bottom} id="each" className="handle-true" style={{ background: '#818cf8' }} />
        </div>
        <div className="handle-container">
          <span>DONE</span>
          <Handle type="source" position={Position.Bottom} id="done" className="handle-false" />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CODE NODE
// ─────────────────────────────────────────────────────────────────────────────
export function CodeNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()

  const updateField = (field: string, value: string) => {
    updateNodeData(id, { [field]: value })
  }

  return (
    <div className={`graph-node code-node ${selected ? 'selected' : ''}`} style={{ borderLeftColor: 'rgba(251, 146, 60, 0.6)', borderLeftWidth: '4px' }}>
      <Handle type="target" position={Position.Top} className="handle-top" />
      <div className="node-header">
        <span className="node-icon">⚡️</span>
        <span className="node-title">JS CODE / MATH</span>
      </div>
      <div className="node-body">
        <div className="input-group">
          <label>Javascript Code (use {"{{var}}"})</label>
          <input 
            className="node-input nodrag" 
            placeholder="e.g. {{count}} + 1" 
            value={data.code || ''} 
            onChange={e => updateField('code', e.target.value)} 
          />
          <VariablePicker nodeId={id} onSelect={(v) => updateField('code', (data.code || '') + v)} />
        </div>
        <div className="input-group">
          <label>Save Output To</label>
          <input 
            className="node-input nodrag" 
            placeholder="Variable Name" 
            value={data.output || ''} 
            onChange={e => updateField('output', e.target.value)} 
          />
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="handle-bottom" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AI TASK NODE
// ─────────────────────────────────────────────────────────────────────────────
export function AITaskNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()

  const updateField = (field: string, value: string) => {
    updateNodeData(id, { [field]: value })
  }

  return (
    <div className={`graph-node aitask-node ${selected ? 'selected' : ''}`} style={{ borderLeftColor: 'rgba(244, 114, 182, 0.6)', borderLeftWidth: '4px' }}>
      <Handle type="target" position={Position.Top} className="handle-top" />
      <div className="node-header">
        <span className="node-icon">🧠</span>
        <span className="node-title">AI TASK</span>
      </div>
      <div className="node-body">
        <div className="input-group">
          <label>AI Prompt</label>
          <textarea 
            className="node-input nodrag" 
            placeholder="Prompt (e.g. parse {{html}} into JSON)" 
            value={data.prompt || ''} 
            onChange={e => updateField('prompt', e.target.value)}
            style={{ minHeight: '60px', resize: 'vertical' }}
          />
          <VariablePicker nodeId={id} onSelect={(v) => updateField('prompt', (data.prompt || '') + v)} />
        </div>
        <div className="input-group">
          <label>Save Output To</label>
          <input 
            className="node-input nodrag" 
            placeholder="Variable Name" 
            value={data.output || ''} 
            onChange={e => updateField('output', e.target.value)} 
          />
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="handle-bottom" />
    </div>
  )
}
