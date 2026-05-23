import React, { useState, useRef, useEffect, useCallback } from 'react'
import './ChatInterface.css'
import { ActivityEvent } from '../../App'

const api = (window as any).electronAPI

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Operator, an autonomous AI browser agent. You help users automate social media tasks through a real browser you control.

Keep all replies SHORT (2-3 sentences max). Be direct and conversational. When a user asks you to do something, confirm what you'll do and say you're starting. When asked a question, answer it briefly.

You can: send DMs on LinkedIn/X/Instagram, post content, scrape leads, engage with posts, monitor inboxes, research people.

Never use bullet points or headers. Just talk normally like a smart assistant.`

// ─── Intent detection ─────────────────────────────────────────────────────────
interface Intent {
  action: 'open_platform' | 'dm' | 'post' | 'scrape' | 'engage' | 'none'
  platform?: string
  params?: Record<string, string>
}

function detectIntent(text: string): Intent {
  const lower = text.toLowerCase()

  // Platform detection
  const platform =
    lower.includes('linkedin') ? 'linkedin' :
    lower.includes('twitter') || lower.includes(' x ') || lower.includes(' x.com') ? 'twitter' :
    lower.includes('instagram') ? 'instagram' :
    lower.includes('whatsapp') ? 'whatsapp' :
    lower.includes('telegram') ? 'telegram' : undefined

  // Action detection
  if (/\b(dm|message|send|outreach|reach out)\b/.test(lower)) {
    return { action: 'dm', platform: platform || 'linkedin', params: { raw: text } }
  }
  if (/\b(post|publish|share|tweet|write)\b/.test(lower)) {
    return { action: 'post', platform, params: { raw: text } }
  }
  if (/\b(scrape|find|collect|leads|extract|list)\b/.test(lower)) {
    return { action: 'scrape', platform, params: { raw: text } }
  }
  if (/\b(engage|like|comment|follow|react)\b/.test(lower)) {
    return { action: 'engage', platform, params: { raw: text } }
  }
  if (platform && /\b(open|go to|show|load|navigate)\b/.test(lower)) {
    return { action: 'open_platform', platform }
  }

  return { action: 'none' }
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  streaming?: boolean
}

interface Props {
  activityEvents: ActivityEvent[]
  aiStatus: { running: boolean; tierName?: string } | null
  addActivity: (e: Omit<ActivityEvent, 'id' | 'timestamp'>) => void
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Keep a rolling conversation for context
const conversationHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
  { role: 'system', content: SYSTEM_PROMPT }
]

// ─── Component ────────────────────────────────────────────────────────────────
export default function ChatInterface({ activityEvents, aiStatus, addActivity }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'sys-1',
      role: 'system',
      content: '⚡ Operator OS online. stealth-engine-3b loaded.',
      timestamp: Date.now() - 1000
    },
    {
      id: 'ai-1',
      role: 'assistant',
      content: "Hey! Ready to go. Tell me what you need — I can DM people on LinkedIn, post content, scrape leads, and more. What's the move?",
      timestamp: Date.now()
    }
  ])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  // Sync AI thoughts and actions from the orchestrator into the chat view
  useEffect(() => {
    const lastEvent = activityEvents[activityEvents.length - 1]
    if (!lastEvent) return

    const allowedTypes = ['thinking', 'action', 'info', 'success', 'error']
    if (allowedTypes.includes(lastEvent.type)) {
      let content = lastEvent.message
      
      // Add emoji prefixes based on type if missing
      if (lastEvent.type === 'action' && !content.startsWith('🔧')) content = `🔧 ${content}`
      if (lastEvent.type === 'success' && !content.startsWith('✅')) content = `✅ ${content}`
      if (lastEvent.type === 'error' && !content.startsWith('❌')) content = `❌ ${content}`
      if (lastEvent.type === 'info' && !content.startsWith('ℹ️') && !content.startsWith('🧠')) content = `ℹ️ ${content}`

      setMessages(prev => {
        // Prevent duplicate appending
        if (prev.length > 0 && prev[prev.length - 1].content === content) return prev
        return [...prev, {
          id: lastEvent.id,
          role: 'assistant',
          content: content,
          timestamp: lastEvent.timestamp
        }]
      })
    }
  }, [activityEvents])

  const autoResize = () => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 100) + 'px'
  }

  const dispatchAction = useCallback(async (intent: Intent) => {
    if (!api) return

    if (intent.platform && (intent.action === 'dm' || intent.action === 'post' || intent.action === 'scrape' || intent.action === 'engage')) {
      // Open the platform tab first
      try {
        addActivity({ type: 'action', platform: intent.platform, message: `Opening ${intent.platform}...` })
        await api.browser.openTab(intent.platform)
      } catch (e) { /* ignore */ }
    }

    if (intent.action === 'open_platform' && intent.platform) {
      try {
        await api.browser.openTab(intent.platform)
        addActivity({ type: 'success', platform: intent.platform, message: `${intent.platform} opened` })
      } catch (e) { /* ignore */ }
    }
  }, [addActivity])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isThinking) return

    const userMsg: Message = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now()
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setIsThinking(true)

    // Detect intent and dispatch side effects
    const intent = detectIntent(text)
    addActivity({ type: 'thinking', message: `Processing: "${text.slice(0, 50)}..."` })

    // Add to conversation history
    conversationHistory.push({ role: 'user', content: text })

    // Keep history to last 10 turns (system + 10 exchanges)
    while (conversationHistory.length > 21) {
      conversationHistory.splice(1, 2) // remove oldest user/assistant pair
    }

    const assistantMsgId = `ai_${Date.now()}`

    try {
      let fullResponse = ''

      // Add placeholder streaming message
      setMessages(prev => [...prev, {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        streaming: true
      }])

      if (api?.agent) {
        // Route through the orchestrator — it handles planning + execution
        const result = await api.agent.run(text)
        fullResponse = (result?.reply || result?.response || '').trim()
        if (!fullResponse || fullResponse.length < 2) {
          fullResponse = "On it."
        }
      } else if (api?.ai) {
        // Fallback: direct AI without orchestration
        const result = await api.ai.generate({ messages: conversationHistory })
        fullResponse = (result?.response || '').trim() || "On it."
      } else {
        fullResponse = "AI not connected yet."
      }

      // Add assistant response to history
      conversationHistory.push({ role: 'assistant', content: fullResponse })

      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: fullResponse, streaming: false }
          : m
      ))
      addActivity({ type: 'success', message: 'Response ready' })

      // Now dispatch the actual automation action
      if (intent.action !== 'none') {
        await dispatchAction(intent)
      }

    } catch (e) {
      const errMsg = 'Error: ' + String(e)
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: errMsg, streaming: false }
          : m
      ))
      addActivity({ type: 'error', message: errMsg })
    } finally {
      setIsThinking(false)
    }
  }, [input, isThinking, addActivity, dispatchAction])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chat-interface">
      <div className="chat-messages">
        {messages.map(msg => (
          <div key={msg.id} className={`message message-${msg.role}`}>
            {msg.role !== 'system' && (
              <div className="message-avatar">
                {msg.role === 'user' ? '👤' : '⚡'}
              </div>
            )}
            <div className="message-body">
              {msg.role === 'system' ? (
                <div className="message-system-text">{msg.content}</div>
              ) : (
                <>
                  <div className="message-content">
                    {msg.content || (msg.streaming ? '' : '...')}
                    {msg.streaming && <span className="streaming-cursor" />}
                  </div>
                  <div className="message-time">{formatTime(msg.timestamp)}</div>
                </>
              )}
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="message message-assistant">
            <div className="message-avatar">⚡</div>
            <div className="message-body">
              <div className="thinking-indicator">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <div className="chat-input-wrap">
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={input}
            onChange={e => { setInput(e.target.value); autoResize() }}
            onKeyDown={handleKeyDown}
            placeholder="Tell Operator what to do..."
            rows={1}
            disabled={isThinking}
          />
          <button
            className={`chat-send-btn ${input.trim() ? 'active' : ''}`}
            onClick={handleSend}
            disabled={!input.trim() || isThinking}
            title="Send (Enter)"
          >
            ⚡
          </button>
        </div>
        <div className="chat-hint">Enter to send · Shift+Enter for new line</div>
      </div>
    </div>
  )
}
