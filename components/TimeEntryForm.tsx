'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Lead = { id: string; name: string }

export default function TimeEntryForm({ leads }: { leads: Lead[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const form = new FormData(e.currentTarget)
    await fetch('/api/time-entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        description: form.get('description'),
        minutes: form.get('minutes'),
        date: form.get('date') || null,
        leadId: form.get('leadId') || null,
      }),
    })
    setLoading(false)
    setOpen(false)
    router.refresh()
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)}>+ Log Time</button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 8,
          width: 340, background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: 20, boxShadow: 'var(--shadow)', zIndex: 100,
        }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 12 }}>
              <label>Description</label>
              <input name="description" required placeholder="Proposal writing..." />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>Minutes</label>
              <input name="minutes" type="number" min="1" required placeholder="60" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>Date</label>
              <input name="date" type="date" defaultValue={today} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label>Related Lead</label>
              <select name="leadId">
                <option value="">— No lead —</option>
                {leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={loading} style={{ flex: 1 }}>{loading ? 'Saving...' : 'Log Time'}</button>
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
