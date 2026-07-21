'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const TYPE_ICONS: Record<string, string> = { note: '📝', call: '📞', email: '✉️', linkedin: '💼' }
const TYPES = ['note', 'call', 'email', 'linkedin'] as const

export default function ConversationEntryForm({ leadId }: { leadId: string }) {
  const router = useRouter()
  const [type, setType] = useState<(typeof TYPES)[number]>('note')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setLoading(true)
    const source = type === 'linkedin' ? 'linkedin' : 'manual'
    await fetch('/api/activity', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, source, body, leadId }),
    })
    setBody('')
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-title">Log Activity</div>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
          {TYPES.map(t => (
            <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13, textTransform: 'none', letterSpacing: 'normal', fontWeight: 'normal', color: 'var(--text-primary)' }}>
              <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} style={{ width: 'auto' }} />
              {TYPE_ICONS[t]} {t === 'linkedin' ? 'LinkedIn' : t}
            </label>
          ))}
        </div>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={3}
          required
          placeholder={type === 'linkedin' ? 'What was exchanged on LinkedIn?' : 'What happened? What was discussed?'}
          style={{ marginBottom: 10 }}
        />
        <button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Entry'}</button>
      </form>
    </div>
  )
}
