'use client'
import { useRouter } from 'next/navigation'

export default function ThemeToggle({ current }: { current: 'dark' | 'light' }) {
  const router = useRouter()
  async function toggle() {
    const next = current === 'dark' ? 'light' : 'dark'
    await fetch('/api/theme', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: next }),
    })
    router.refresh()
  }
  return (
    <button onClick={toggle} className="btn-ghost" style={{ padding: '6px 10px', fontSize: 16 }} title="Toggle theme">
      {current === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}
