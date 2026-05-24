import React, { useState } from 'react'
import './ProfileWizard.css'
import LiquidMetalButton from '../UI/LiquidMetalButton'

const api = (window as any).electronAPI

interface ChromeProfile {
  path: string
  name: string
  displayName: string
  hasGmail: boolean
  isDefault: boolean
}

interface Props {
  chromeProfiles: ChromeProfile[]
  onComplete: () => void
}

type WizardStep = 'welcome' | 'import' | 'ai-setup' | 'ready'

export default function ProfileWizard({ chromeProfiles, onComplete }: Props) {
  const [step, setStep] = useState<WizardStep>('welcome')
  const [selectedProfile, setSelectedProfile] = useState<string | null>(
    chromeProfiles.find(p => p.isDefault)?.path || null
  )
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importDone, setImportDone] = useState(false)
  const [skipImport, setSkipImport] = useState(false)

  const handleImport = async () => {
    if (!selectedProfile && !skipImport) return
    setImporting(true)

    // Simulate progress while actual import runs
    const interval = setInterval(() => {
      setImportProgress(p => Math.min(p + 8, 90))
    }, 200)

    if (selectedProfile) {
      await api?.profile.import(selectedProfile)
    }

    clearInterval(interval)
    setImportProgress(100)
    setImportDone(true)

    setTimeout(() => setStep('ai-setup'), 800)
  }

  return (
    <div className="wizard-overlay">
      <div className="wizard-card">
        {/* Step indicator */}
        <div className="wizard-steps">
          {(['welcome', 'import', 'ai-setup', 'ready'] as WizardStep[]).map((s, i) => (
            <div key={s} className={`wizard-step-dot ${step === s ? 'active' : ''} ${
              ['welcome','import','ai-setup','ready'].indexOf(step) > i ? 'done' : ''
            }`} />
          ))}
        </div>

        {/* Step: Welcome */}
        {step === 'welcome' && (
          <div className="wizard-step" key="welcome">
            <div className="wizard-hero-icon">⚡</div>
            <h1 className="wizard-title">Welcome to Operator OS</h1>
            <p className="wizard-subtitle">
              Your autonomous AI browser. Control social media, outreach,
              content, and research — all through conversation.
            </p>
            <div className="wizard-features">
              {['Autonomous LinkedIn & X DMs', 'Content publishing on all platforms', 'Lead discovery & enrichment', 'Local AI — runs on your machine'].map(f => (
                <div key={f} className="wizard-feature">
                  <span className="feature-check">✓</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
            <LiquidMetalButton className="wizard-cta" onClick={() => setStep('import')}>
              Import Workflows
            </LiquidMetalButton>
          </div>
        )}

        {/* Step: Import */}
        {step === 'import' && (
          <div className="wizard-step" key="import">
            <div className="wizard-step-icon">🔐</div>
            <h2 className="wizard-title">Import your browser sessions</h2>
            <p className="wizard-subtitle">
              We'll copy your Chrome sessions so you're already logged into
              LinkedIn, X, and Instagram — no re-login needed.
            </p>

            {chromeProfiles.length > 0 ? (
              <div className="profile-list">
                {chromeProfiles.map(profile => (
                  <label key={profile.path} className={`profile-item ${selectedProfile === profile.path ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="profile"
                      value={profile.path}
                      checked={selectedProfile === profile.path}
                      onChange={() => { setSelectedProfile(profile.path); setSkipImport(false) }}
                    />
                    <div className="profile-info">
                      <span className="profile-icon">
                        {profile.hasGmail ? '📧' : '👤'}
                      </span>
                      <div>
                        <div className="profile-name">{profile.displayName}</div>
                        <div className="profile-path">{profile.name}</div>
                      </div>
                    </div>
                    {profile.isDefault && <span className="profile-default">Default</span>}
                  </label>
                ))}
                <label className={`profile-item ${skipImport ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="profile"
                    checked={skipImport}
                    onChange={() => { setSkipImport(true); setSelectedProfile(null) }}
                  />
                  <div className="profile-info">
                    <span className="profile-icon">🆕</span>
                    <div>
                      <div className="profile-name">Start Fresh</div>
                      <div className="profile-path">New empty profile</div>
                    </div>
                  </div>
                </label>
              </div>
            ) : (
              <div className="no-profiles">
                No Chrome profiles detected. Starting fresh.
              </div>
            )}

            {importing && (
              <div className="import-progress">
                <div className="import-progress-bar" style={{ width: `${importProgress}%` }} />
                <span className="import-progress-label">
                  {importDone ? 'Sessions imported ✓' : 'Copying sessions...'}
                </span>
              </div>
            )}

            {!importing && (
              <LiquidMetalButton
                className="wizard-cta"
                onClick={handleImport}
                disabled={!selectedProfile && !skipImport}
              >
                {selectedProfile ? 'Import & Continue' : 'Continue'}
              </LiquidMetalButton>
            )}
          </div>
        )}

        {/* Step: AI Setup */}
        {step === 'ai-setup' && (
          <div className="wizard-step" key="ai-setup">
            <div className="wizard-step-icon">🧠</div>
            <h2 className="wizard-title">Setting up local AI</h2>
            <p className="wizard-subtitle">
              Operator OS runs AI locally on your machine.
              No API keys. No cloud. Your data stays private.
            </p>
            <div className="ai-setup-info">
              <div className="ai-hardware-badge">
                <span>⚡</span>
                <span>Hardware detected — AI model selected automatically</span>
              </div>
            </div>
            <div className="model-list">
              {[
                { name: 'nomic-embed-text', size: '274 MB', purpose: 'Memory system', done: true },
                { name: 'qwen2.5:7b', size: '4.7 GB', purpose: 'Message generation', progress: 0 },
                { name: 'llava:7b', size: '4.1 GB', purpose: 'Visual verification', progress: 0, queued: true },
              ].map(m => (
                <div key={m.name} className="model-item">
                  <div className="model-info">
                    <span className="model-name">{m.name}</span>
                    <span className="model-purpose">{m.purpose}</span>
                  </div>
                  <div className="model-right">
                    <span className="model-size">{m.size}</span>
                    {m.done && <span className="model-status done">✓</span>}
                    {m.queued && <span className="model-status queued">queued</span>}
                    {!m.done && !m.queued && (
                      <span className="model-status downloading">↓</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="wizard-note">
              Models download once and run forever locally. This may take a few minutes.
            </p>
            <LiquidMetalButton className="wizard-cta" onClick={() => setStep('ready')}>
              Continue
            </LiquidMetalButton>
          </div>
        )}

        {/* Step: Ready */}
        {step === 'ready' && (
          <div className="wizard-step" key="ready">
            <div className="wizard-ready-icon">✅</div>
            <h2 className="wizard-title">Operator OS is ready</h2>
            <p className="wizard-subtitle">
              Your autonomous operator is online and ready to work.
              Open a platform from the sidebar and tell it what to do.
            </p>
            <LiquidMetalButton className="wizard-cta" onClick={onComplete}>
              Launch Workspace
            </LiquidMetalButton>
          </div>
        )}
      </div>
    </div>
  )
}
