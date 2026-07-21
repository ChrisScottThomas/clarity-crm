'use client'
import { useState, useEffect } from 'react'
import { OWNERS, TRACKS, SOURCES, NEXT_ACTIONS, RELATIONSHIPS, CONSTRAINTS, BUSINESS_DEBTS, ROADMAP_STAGES } from '../lib/constants'

const text = ['name','companyName','email','linkedinUrl','website','graduationCriterion']
const selects: [string, readonly string[]][] = [
  ['owner', OWNERS], ['track', TRACKS], ['source', SOURCES], ['nextAction', NEXT_ACTIONS],
  ['relationship', RELATIONSHIPS], ['primaryConstraint', CONSTRAINTS],
  ['businessDebt', BUSINESS_DEBTS], ['scalingRoadmapStage', ROADMAP_STAGES],
]
const OMIT_ON_EDIT = ['id', 'contactAdded', 'dateContacted', 'callDate', 'followUpDate', 'closedDate', 'company', 'openLoops']
export default function LeadForm({ lead, mode }: { lead?: any; mode: 'create' | 'edit' }) {
  const [form, setForm] = useState<any>(lead ?? { relationship: 'contact' })
  const [companies, setCompanies] = useState<any[]>([])
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
  useEffect(() => { fetch('/api/companies').then(r => r.json()).then(setCompanies).catch(() => {}) }, [])
  async function save() {
    const url = mode === 'create' ? '/api/leads' : `/api/leads/${lead.id}`
    const method = mode === 'create' ? 'POST' : 'PATCH'
    let payload = form
    if (mode === 'edit') {
      payload = { ...form }
      for (const k of OMIT_ON_EDIT) delete payload[k]
    }
    const res = await fetch(url, { method, body: JSON.stringify(payload) })
    const saved = await res.json()
    window.location.href = `/leads/${saved.id ?? lead.id}`
  }
  return (
    <div style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
      {text.map(k => <label key={k}>{k}<input value={form[k] ?? ''} onChange={e => set(k, e.target.value)} /></label>)}
      {selects.map(([k, opts]) => (
        <label key={k}>{k}
          <select value={form[k] ?? ''} onChange={e => set(k, e.target.value)}>
            <option value=""></option>{opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      ))}
      <label>company
        <select value={form.companyId ?? ''} onChange={e => set('companyId', e.target.value || null)}>
          <option value="">(none)</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>monthlyValue<input type="number" value={form.monthlyValue ?? ''} onChange={e => set('monthlyValue', Number(e.target.value))} /></label>
      <label><input type="checkbox" checked={!!form.intakeFormReceived} onChange={e => set('intakeFormReceived', e.target.checked)} /> Intake form received</label>
      <label>notes<textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} /></label>
      <button onClick={save}>Save</button>
    </div>
  )
}
