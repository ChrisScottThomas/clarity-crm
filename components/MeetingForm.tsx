'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Lead = { id: string; name: string }

export default function MeetingForm({ leads }: { leads: Lead[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const form = new FormData(e.currentTarget)
    await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: form.get('title'),
        date: form.get('date'),
        duration: form.get('duration') || null,
        notes: form.get('notes') || null,
        leadId: form.get('leadId') || null,
      }),
    })
    setLoading(false)
    setOpen(false)
    router.refresh()
  }

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)}>+ Log Meeting</button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 8,
          width: 360, background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: 20, boxShadow: 'var(--shadow)', zIndex: 100,
        }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 12 }}>
              <label>Title</label>
              <input name="title" required placeholder="Discovery call..." />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>Date &amp; Time</label>
              <input name="date" type="datetime-local" required />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>Duration (minutes)</label>
              <input name="duration" type="number" placeholder="60" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>Related Lead</label>
              <select name="leadId">
                <option value="">— No lead —</option>
                {leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label>Notes</label>
              <textarea name="notes" rows={3} placeholder="Key discussion points..." />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={loading} style={{ flex: 1 }}>
                {loading ? 'Saving...' : 'Log Meeting'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
