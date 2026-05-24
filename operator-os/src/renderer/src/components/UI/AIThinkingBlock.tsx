import React from 'react'
import './AIThinkingBlock.css'
import { BrainCircuit, Sparkles } from 'lucide-react'

interface AIThinkingBlockProps {
  status: 'consulting_memory' | 'analyzing_intent' | 'scheduling' | 'done'
  message?: string
}

export default function AIThinkingBlock({ status, message }: AIThinkingBlockProps) {
  const getStatusText = () => {
    switch (status) {
      case 'consulting_memory': return 'Consulting Knowledge Graph...'
      case 'analyzing_intent': return 'Analyzing Execution Intent...'
      case 'scheduling': return 'Calculating Temporal Execution Time...'
      case 'done': return 'Task Computed'
      default: return 'Thinking...'
    }
  }

  return (
    <div className={`ai-thinking-block ${status === 'done' ? 'done' : 'active'}`}>
      <div className="ai-thinking-glass-pane">
        <div className="ai-thinking-icon-container">
          {status === 'done' ? <Sparkles size={16} className="text-accent" /> : <BrainCircuit size={16} className="ai-thinking-pulse" />}
        </div>
        <div className="ai-thinking-content">
          <span className="ai-thinking-title">{message || getStatusText()}</span>
          {status !== 'done' && (
            <div className="ai-thinking-progress-bar">
              <div className="ai-thinking-progress-fill"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
