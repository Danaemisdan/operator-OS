import React, { useState } from 'react'
import { Settings as SettingsIcon, Cpu, Shield, Bell, Key, Network } from 'lucide-react'

const SETTINGS_CATEGORIES = [
  { id: 'general', icon: SettingsIcon, label: 'General' },
  { id: 'prompting', icon: Cpu, label: 'AI Prompting' },
  { id: 'security', icon: Shield, label: 'Security & Privacy' },
  { id: 'notifications', icon: Bell, label: 'Notifications' },
  { id: 'api_keys', icon: Key, label: 'API Keys' },
  { id: 'network', icon: Network, label: 'Network & Proxies' }
]

export default function Settings() {
  const [activeTab, setActiveTab] = useState('prompting')

  // Dummy state for prompting settings
  const [systemPrompt, setSystemPrompt] = useState("You are an expert AI operator designed to execute tasks flawlessly across web platforms. Maintain a professional yet persuasive tone when engaging with leads.")
  const [creativity, setCreativity] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(2048)
  const [autoApprove, setAutoApprove] = useState(false)

  return (
    <div className="task-dashboard-container">
      {/* ── Left Sidebar ── */}
      <div className="task-sidebar">
        <div className="task-sidebar-header">
          <span>Settings</span>
        </div>
        <div className="task-list">
          {SETTINGS_CATEGORIES.map(cat => (
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
            {SETTINGS_CATEGORIES.find(c => c.id === activeTab)?.label}
          </h2>
          <div className="task-detail-meta">
            Configure system preferences and AI agent behavior.
          </div>
        </div>

        {activeTab === 'general' && (
          <div className="settings-section" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="task-section" style={{ marginBottom: 0 }}>
              <div className="task-section-title">Application Preferences</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input type="checkbox" defaultChecked style={{ accentColor: 'var(--color-accent)', width: '16px', height: '16px' }} />
                  <span style={{ fontSize: '14px' }}>Launch on System Startup</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input type="checkbox" defaultChecked style={{ accentColor: 'var(--color-accent)', width: '16px', height: '16px' }} />
                  <span style={{ fontSize: '14px' }}>Hardware Acceleration (Requires restart)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input type="checkbox" style={{ accentColor: 'var(--color-accent)', width: '16px', height: '16px' }} />
                  <span style={{ fontSize: '14px' }}>Minimize to Tray on Close</span>
                </label>
              </div>
            </div>
            <div className="task-section" style={{ marginBottom: 0 }}>
              <div className="task-section-title">Theme & Appearance</div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <button className="btn btn-primary">Dark Mode (Active)</button>
                <button className="btn btn-ghost">Light Mode</button>
                <button className="btn btn-ghost">System Default</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'prompting' && (
          <div className="settings-section" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            <div className="task-section" style={{ marginBottom: 0 }}>
              <div className="task-section-title">Global System Prompt</div>
              <p style={{ fontSize: '13px', color: 'var(--color-text-3)', marginBottom: '16px' }}>
                Define the core personality and operational instructions for all your AI agents. This prompt prepends every execution.
              </p>
              <textarea 
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                style={{
                  width: '100%', height: '120px', backgroundColor: '#0d0d12', color: 'var(--color-text)',
                  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                  padding: '12px', fontSize: '14px', fontFamily: 'var(--font-sans)',
                  resize: 'vertical', outline: 'none'
                }}
              />
            </div>

            <div className="task-section" style={{ marginBottom: 0 }}>
              <div className="task-section-title">Generation Parameters</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 500 }}>Creativity (Temperature): {creativity}</label>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.1" 
                    value={creativity} onChange={e => setCreativity(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--color-accent)' }}
                  />
                  <p style={{ fontSize: '12px', color: 'var(--color-text-3)', marginTop: '8px' }}>
                    Higher values make the AI more creative and less deterministic. Lower values are better for strict data extraction tasks.
                  </p>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 500 }}>Max Tokens Output: {maxTokens}</label>
                  </div>
                  <input 
                    type="range" min="256" max="8192" step="256" 
                    value={maxTokens} onChange={e => setMaxTokens(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--color-accent)' }}
                  />
                  <p style={{ fontSize: '12px', color: 'var(--color-text-3)', marginTop: '8px' }}>
                    The absolute maximum length of the AI's response per step.
                  </p>
                </div>

              </div>
            </div>

            <div className="task-section" style={{ marginBottom: 0 }}>
              <div className="task-section-title">Execution Safety</div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={autoApprove} 
                  onChange={e => setAutoApprove(e.target.checked)}
                  style={{ marginTop: '4px', accentColor: 'var(--color-accent)', width: '16px', height: '16px' }}
                />
                <div>
                  <span style={{ fontSize: '14px', fontWeight: 500 }}>Auto-Approve Destructive Actions</span>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-3)', marginTop: '4px' }}>
                    If enabled, the AI will automatically send messages and submit forms without asking for your explicit review in the UI. Use with extreme caution.
                  </p>
                </div>
              </label>
            </div>

            <button className="btn btn-primary" style={{ alignSelf: 'flex-start', marginTop: '12px' }}>Save Prompt Settings</button>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="settings-section" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="task-section" style={{ marginBottom: 0 }}>
              <div className="task-section-title">Privacy Controls</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <input type="checkbox" defaultChecked style={{ marginTop: '4px', accentColor: 'var(--color-accent)', width: '16px', height: '16px' }} />
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>Local Storage Encryption</span>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-3)', marginTop: '4px' }}>Encrypt all task data and session cookies stored on this machine.</p>
                  </div>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <input type="checkbox" style={{ marginTop: '4px', accentColor: 'var(--color-accent)', width: '16px', height: '16px' }} />
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>Incognito Mode for Workflows</span>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-3)', marginTop: '4px' }}>Do not save history or traces when executing scheduled workflows.</p>
                  </div>
                </label>
              </div>
            </div>
            <button className="btn btn-primary" style={{ alignSelf: 'flex-start', marginTop: '12px' }}>Update Security Settings</button>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="settings-section" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="task-section" style={{ marginBottom: 0 }}>
              <div className="task-section-title">System Alerts</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input type="checkbox" defaultChecked style={{ accentColor: 'var(--color-accent)', width: '16px', height: '16px' }} />
                  <span style={{ fontSize: '14px' }}>Enable Desktop Notifications</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input type="checkbox" defaultChecked style={{ accentColor: 'var(--color-accent)', width: '16px', height: '16px' }} />
                  <span style={{ fontSize: '14px' }}>Play Sound on Task Complete</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input type="checkbox" defaultChecked style={{ accentColor: 'var(--color-accent)', width: '16px', height: '16px' }} />
                  <span style={{ fontSize: '14px' }}>Notify on Critical Workflow Failures</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'api_keys' && (
          <div className="settings-section" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="task-section" style={{ marginBottom: 0 }}>
              <div className="task-section-title">LLM Providers</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', fontWeight: 500 }}>Local Llama Server URL</label>
                  <input type="text" defaultValue="http://localhost:18742" style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: '#0d0d12', color: 'var(--color-text)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', fontWeight: 500 }}>OpenAI API Key (Fallback)</label>
                  <input type="password" placeholder="sk-..." style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: '#0d0d12', color: 'var(--color-text)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', fontWeight: 500 }}>Anthropic API Key</label>
                  <input type="password" placeholder="sk-ant-..." style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: '#0d0d12', color: 'var(--color-text)' }} />
                </div>
              </div>
            </div>
            <button className="btn btn-primary" style={{ alignSelf: 'flex-start', marginTop: '12px' }}>Save API Keys</button>
          </div>
        )}

        {activeTab === 'network' && (
          <div className="settings-section" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="task-section" style={{ marginBottom: 0 }}>
              <div className="task-section-title">Proxy Configuration</div>
              <p style={{ fontSize: '13px', color: 'var(--color-text-3)', marginBottom: '16px' }}>
                Configure rotating proxies to prevent IP bans during high-volume scraping workflows.
              </p>
              <div>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', fontWeight: 500 }}>HTTP/HTTPS Proxy URL</label>
                <input type="text" placeholder="http://user:pass@proxy.example.com:8080" style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: '#0d0d12', color: 'var(--color-text)' }} />
              </div>
            </div>
            <div className="task-section" style={{ marginBottom: 0 }}>
              <div className="task-section-title">Stealth Options</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input type="checkbox" defaultChecked style={{ accentColor: 'var(--color-accent)', width: '16px', height: '16px' }} />
                <span style={{ fontSize: '14px' }}>Rotate User Agents Automatically</span>
              </label>
            </div>
            <button className="btn btn-primary" style={{ alignSelf: 'flex-start', marginTop: '12px' }}>Apply Network Settings</button>
          </div>
        )}

      </div>
    </div>
  )
}
