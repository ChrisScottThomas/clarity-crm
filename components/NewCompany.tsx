'use client'
import { useState } from 'react'
export default function NewCompany() {
  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')
  async function create() {
    if (!name) return
    const res = await fetch('/api/companies', { method: 'POST', body: JSON.stringify({ name, website }) })
    const c = await res.json()
    window.location.href = `/companies/${c.id}`
  }
  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 420, marginBottom: 16 }}>
      <input placeholder="Company name" value={name} onChange={e => setName(e.target.value)} />
      <input placeholder="Website (optional)" value={website} onChange={e => setWebsite(e.target.value)} />
      <button onClick={create}>+ Add company</button>
    </div>
  )
}
