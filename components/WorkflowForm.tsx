'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
// Vocabulary is owned by the engine so the form can only ever create rules the
// executor knows how to run. Keeps the UI and engine from drifting apart.
import { TRIGGERS, ACTIONS } from '../lib/workflow-engine'

export default function WorkflowForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [trigger, setTrigger] = useState('')
  const [action, setAction] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !trigger || !action) return
    setLoading(true)
    await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, trigger, action }),
    })
    setName(''); setTrigger(''); setAction('')
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-title">New Workflow Rule</div>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label>Rule Name</label>
            <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Notify team when deal closes" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label>Trigger — When this happens...</label>
            <select value={trigger} onChange={e => setTrigger(e.target.value)} required>
              <option value="">Select trigger</option>
              {TRIGGERS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label>Action — Do this</label>
            <select value={action} onChange={e => setAction(e.target.value)} required>
              <option value="">Select action</option>
              {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <button type="submit" disabled={loading} style={{ marginTop: 16 }}>{loading ? 'Creating...' : 'Create Rule'}</button>
      </form>
    </div>
  )
}
