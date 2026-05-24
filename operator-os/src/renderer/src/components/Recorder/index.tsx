import React, { useState, useEffect, useCallback } from 'react'
import { Video, Square, Save, Loader2, Plus } from 'lucide-react'
import { ReactFlow, Background, useNodesState, useEdgesState, addEdge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ActionNode, ConditionNode, CodeNode, AITaskNode, LoopNode } from '../Studio/GraphNodes'
import './Recorder.css'

const nodeTypes = {
  action: ActionNode,
  condition: ConditionNode,
  code: CodeNode,
  aiTask: AITaskNode,
  loop: LoopNode
}

export function Recorder({ isRecording, setIsRecording, activePlatform }: { isRecording: boolean, setIsRecording: (v: boolean) => void, activePlatform: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  
  const [isSaving, setIsSaving] = useState(false)
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [stepName, setStepName] = useState("")
  const [stepDescription, setStepDescription] = useState("")
  const [flashNodeId, setFlashNodeId] = useState<string|null>(null)
  const [isPicking, setIsPicking] = useState(false)

  const appendNode = useCallback((type: string, data: any) => {
    setNodes((nds) => {
      const newNodeId = `node_${Date.now()}`
      const lastNode = nds[nds.length - 1]
      const yOffset = lastNode ? lastNode.position.y + 150 : 50
      
      const newNode = {
        id: newNodeId,
        type,
        position: { x: 50, y: yOffset },
        data: { ...data }
      }
      
      if (lastNode) {
        let sourceHandle = undefined;
        if (lastNode.type === 'condition') sourceHandle = 'true';
        if (lastNode.type === 'loop') sourceHandle = 'each';
        
        setEdges(eds => [...eds, {
          id: `e_${lastNode.id}-${newNodeId}`,
          source: lastNode.id,
          target: newNodeId,
          ...(sourceHandle ? { sourceHandle } : {})
        }])
      }
      
      setFlashNodeId(newNodeId)
      setTimeout(() => setFlashNodeId(null), 500)
      
      return [...nds, newNode]
    })
  }, [setNodes, setEdges])

  useEffect(() => {
    const cleanup = window.electronAPI.browser.onRecordedEvent((data) => {
      if (data.type === 'navigate') {
        appendNode('action', { action: 'navigate', url: data.url, intent: `Navigate to ${data.url}` })
      } else if (data.type === 'click') {
        const desc = data.targetName || (data.text ? `"${data.text}"` : `element ${data.selector}`)
        appendNode('action', { action: 'click', selector: data.selector, targetName: desc, intent: `Click on ${desc}` })
      } else if (data.type === 'type') {
        const desc = data.targetName || `element ${data.selector}`
        appendNode('action', { action: 'type', selector: data.selector, targetName: desc, value: data.value, intent: `Type into ${desc}` })
      } else if (data.type === 'keydown') {
        appendNode('action', { action: 'keypress', key: data.key, intent: `Press ${data.key}` })
      }
    })
    return cleanup
  }, [appendNode])

  // Global picker listeners
  useEffect(() => {
    const offStart = () => setIsPicking(true)
    const offPick = window.electronAPI.browser.onElementPicked((data) => {
      setIsPicking(false)
      const targetNodeId = (window as any)._activePickingNodeId
      if (targetNodeId) {
        setNodes(nds => nds.map(n => 
          n.id === targetNodeId 
            ? { ...n, data: { ...n.data, selector: data.selector, targetName: data.elementName || '' } }
            : n
        ))
        ;(window as any)._activePickingNodeId = null
      }
    })
    const offCancel = window.electronAPI.browser.onPickerCancelled(() => {
      setIsPicking(false)
      ;(window as any)._activePickingNodeId = null
    })
    
    window.addEventListener('picker-started', offStart)
    return () => {
      window.removeEventListener('picker-started', offStart)
      offPick()
      offCancel()
    }
  }, [setNodes])

  const toggleRecording = async () => {
    if (isRecording) {
      setIsRecording(false)
      await window.electronAPI.browser.toggleRecording(false)
    } else {
      setNodes([])
      setEdges([])
      setIsRecording(true)
      await window.electronAPI.browser.toggleRecording(true)
    }
  }
  
  const cancelRecording = async () => {
    const ok = window.confirm("Are you sure you want to cancel the recording and discard these steps?")
    if (ok) {
      setNodes([])
      setEdges([])
      setIsRecording(false)
      await window.electronAPI.browser.toggleRecording(false)
    }
  }

  const cancelPicking = async () => {
    setIsPicking(false)
    await window.electronAPI.browser.stopPicker()
  }

  const saveWorkflow = async () => {
    if (!stepName.trim()) {
      alert("Name is required")
      return
    }
    setIsSaving(true)
    
    const skillJson = {
      id: `${activePlatform}.${stepName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      name: stepName,
      platform: activePlatform,
      description: stepDescription,
      inputs: [],
      outputs: [],
      triggers: [],
      nodes: nodes,
      edges: edges
    }
    
    const filePayload = {
      version: "1",
      skills: [skillJson]
    }
    
    try {
      const folderStepName = `${activePlatform}/${stepName}`
      await window.electronAPI.workflow.saveReference(folderStepName, JSON.stringify(filePayload, null, 2))
      alert("Atomic Step saved successfully!")
    } catch (e) {
      alert("Failed to save: " + e)
    }
    
    setIsSaving(false)
    setShowSaveForm(false)
    setNodes([])
    setEdges([])
    setStepName("")
    setStepDescription("")
  }

  const animatedNodes = nodes.map(n => {
    if (n.id === flashNodeId) {
      return { ...n, className: 'node-flash' }
    }
    return n
  })

  return (
    <div className="recorder-panel">
      <div className="recorder-header">
        <h3 className="recorder-title">
          <Video size={16} className={`recorder-title-icon ${isRecording ? 'recording' : ''}`} />
          Workflow Recorder
        </h3>
        <div style={{display: 'flex', gap: '8px'}}>
          {isRecording && nodes.length > 0 && (
            <button onClick={cancelRecording} className="recorder-btn-toggle" style={{color: '#ef4444'}}>
              Cancel
            </button>
          )}
          <button 
            onClick={toggleRecording}
            className={`recorder-btn-toggle ${isRecording ? 'recording' : ''}`}
          >
            {isRecording ? <><Square size={12} fill="currentColor" /> Stop</> : <><Video size={12} /> Record</>}
          </button>
        </div>
      </div>

      {isRecording && (
        <div className="recorder-studio-palette" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--color-border)' }}>
          <button className="add-step-btn" onClick={() => appendNode('action', { action: 'verify', purpose: '' })}>
            <Plus size={14} /> Add Action
          </button>
          <button className="add-step-btn border-red" onClick={() => appendNode('condition', { conditionType: 'js', condition: 'true', action: 'condition' })}>
            <Plus size={14} /> Add Condition
          </button>
          <button className="add-step-btn text-indigo-400" onClick={() => appendNode('loop', { action: 'loop', arrayVar: '{{items}}', itemVar: 'item' })}>
            <Plus size={14} /> Add Loop
          </button>
          <button className="add-step-btn text-orange-400" onClick={() => appendNode('code', { action: 'code', code: 'return true', output: 'result' })}>
            <Plus size={14} /> Add Code
          </button>
          <button className="add-step-btn text-pink-400" onClick={() => appendNode('aiTask', { action: 'aiTask', prompt: 'Summarize {{text}}', output: 'summary' })}>
            <Plus size={14} /> Add AI Task
          </button>
        </div>
      )}

      {isPicking && (
        <div className="picker-overlay-banner">
          <div className="picker-pulse">🎯</div>
          <span>Hover to highlight, click to select</span>
          <button onClick={cancelPicking} className="recorder-btn-cancel" style={{ padding: '4px 8px', marginLeft: 'auto' }}>Cancel</button>
        </div>
      )}

      {nodes.length > 0 && (
        <div style={{ flex: 1, position: 'relative', minHeight: '300px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
          <ReactFlow 
            nodes={animatedNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onEdgeDoubleClick={(event, edge) => {
              setEdges(eds => eds.filter(e => e.id !== edge.id));
            }}
            nodeTypes={nodeTypes}
            connectionMode={'loose' as any}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#333" gap={16} />
          </ReactFlow>
        </div>
      )}

      {!isRecording && nodes.length > 0 && !showSaveForm && (
        <button
          onClick={() => setShowSaveForm(true)}
          className="recorder-btn-save"
        >
          <Save size={16} /> Save Workflow
        </button>
      )}

      {showSaveForm && (
        <div className="recorder-save-form">
          <input 
            type="text" 
            placeholder="Workflow Name (e.g. Send Connection Request)" 
            value={stepName}
            onChange={e => setStepName(e.target.value)}
            className="recorder-input"
          />
          <textarea 
            placeholder="Description (Optional)" 
            value={stepDescription}
            onChange={e => setStepDescription(e.target.value)}
            className="recorder-textarea"
          />
          <div className="recorder-form-actions">
            <button
              onClick={() => setShowSaveForm(false)}
              className="recorder-btn-cancel"
            >
              Cancel
            </button>
            <button
              onClick={saveWorkflow}
              disabled={isSaving || !stepName.trim()}
              className="recorder-btn-submit"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Workflow
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
