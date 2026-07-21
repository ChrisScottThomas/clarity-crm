'use client'
import { useState } from 'react'
const fields = [
  ['booking_link_shared', 'Shared discovery link'],
  ['booking_link_alex', "Alex's discovery link"],
  ['booking_link_jordan', "Jordan's discovery link"],
] as const
export default function SettingsForm({ initial }: { initial: Record<string, string> }) {
  const [form, setForm] = useState(initial)
  async function save() {
    await fetch('/api/settings', { method: 'PATCH', body: JSON.stringify(form) })
    alert('Saved')
  }
  return (
    <div style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
      {fields.map(([k, label]) => (
        <label key={k}>{label}
          <input value={form[k] ?? ''} placeholder="https://cal.com/..." onChange={e => setForm({ ...form, [k]: e.target.value })} />
        </label>
      ))}
      <p style={{ opacity: 0.7, fontSize: 13 }}>Per-owner links fall back to the shared link until set.</p>
      <button onClick={save}>Save</button>
    </div>
  )
}
