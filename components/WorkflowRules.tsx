'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Rule = { id: string; name: string; trigger: string; action: string; enabled: boolean }
type Run = { id: string; action: string; trigger: string; status: string; detail: string | null; createdAt: string }

const STATUS_COLOR: Record<string, string> = {
  success: 'var(--accent-green)',
  skipped: 'var(--text-muted)',
  error: 'var(--accent-red)',
}

export default function WorkflowRules({ rules, recentRuns }: { rules: Rule[]; recentRuns: Run[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function toggle(rule: Rule) {
    setBusy(rule.id)
    await fetch(`/api/workflows/${rule.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: !rule.enabled }),
    })
    setBusy(null); router.refresh()
  }

  async function remove(rule: Rule) {
    if (!confirm(`Delete rule "${rule.name}"?`)) return
    setBusy(rule.id)
    await fetch(`/api/workflows/${rule.id}`, { method: 'DELETE' })
    setBusy(null); router.refresh()
  }

  async function runScheduled() {
    setBusy('run')
    const res = await fetch('/api/workflows/run', { method: 'POST' })
    const { fired } = await res.json()
    setBusy(null); router.refresh()
    alert(fired > 0 ? `Scheduled sweep ran — ${fired} action(s) fired.` : 'Scheduled sweep ran — nothing was due.')
  }

  const hasScheduled = rules.some(r => r.action === 'Move to next stage after 7 days')

  return (
    <>
      {hasScheduled && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={runScheduled} disabled={busy === 'run'}
            style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border)' }}>
            {busy === 'run' ? 'Running…' : '▶ Run scheduled rules now'}
          </button>
        </div>
      )}

      {rules.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <p style={{ fontSize: 32, margin: '0 0 8px' }}>⚡</p>
          <p>No workflow rules yet. Create your first rule above.</p>
        </div>
      ) : rules.map(rule => (
        <div key={rule.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: rule.enabled ? 'var(--accent-green)' : 'var(--text-muted)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{rule.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              <span style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(66,158,219,0.12)', border: '1px solid rgba(66,158,219,0.2)', color: 'var(--accent-blue)', marginRight: 8 }}>{rule.trigger}</span>
              →
              <span style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.2)', color: 'var(--accent-green)', marginLeft: 8 }}>{rule.action}</span>
            </div>
          </div>
          <button onClick={() => toggle(rule)} disabled={busy === rule.id}
            style={{ fontSize: 12, padding: '4px 10px', background: 'var(--bg-overlay)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            {rule.enabled ? 'Disable' : 'Enable'}
          </button>
          <button onClick={() => remove(rule)} disabled={busy === rule.id}
            style={{ fontSize: 12, padding: '4px 10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            Delete
          </button>
        </div>
      ))}

      {recentRuns.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Recent activity
          </div>
          {recentRuns.map(run => (
            <div key={run.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[run.status] ?? 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ color: 'var(--text-secondary)', flex: 1 }}>
                <strong style={{ color: 'var(--text-primary)' }}>{run.action}</strong> — {run.detail ?? run.status}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                {new Date(run.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
