import React from 'react'
import { NotebookPen, Sparkles } from 'lucide-react'

export default function AINotes() {
  return (
    <div style={{ flex: 1, padding: '40px', color: 'var(--color-text)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--color-border)', paddingBottom: '20px' }}>
        <div style={{ padding: '10px', background: 'var(--color-accent-soft)', borderRadius: '12px', color: 'var(--color-accent)' }}>
          <NotebookPen size={28} />
        </div>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            AI Notes <Sparkles size={16} color="var(--color-accent)" />
          </h1>
          <p style={{ color: 'var(--color-text-2)', fontSize: '14px', margin: '4px 0 0 0' }}>
            Your agent automatically extracts and organizes leads, contacts, and important information here.
          </p>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'var(--color-text-3)', gap: '16px' }}>
        <NotebookPen size={48} opacity={0.3} />
        <p style={{ fontSize: '15px' }}>No notes collected yet. Run a workflow to start extracting data.</p>
      </div>
    </div>
  )
}
