'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SyncCalendarButton() {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)

  async function sync() {
    setSyncing(true)
    try {
      await fetch('/api/integrations/outlook/sync', { method: 'POST' })
      router.refresh()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <button
      type="button"
      onClick={sync}
      disabled={syncing}
      style={{
        padding: '8px 16px', borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: 'pointer',
        background: 'var(--bg-overlay)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
        opacity: syncing ? 0.6 : 1,
      }}
    >
      {syncing ? 'Syncing…' : '↻ Sync calendar'}
    </button>
  )
}
