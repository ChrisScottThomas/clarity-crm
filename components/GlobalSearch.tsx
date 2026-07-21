'use client'
import { useRouter } from 'next/navigation'
import { useState, useRef } from 'react'

export default function GlobalSearch() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && value.trim()) {
      router.push(`/contacts?q=${encodeURIComponent(value.trim())}`)
      setValue('')
    }
    if (e.key === 'Escape') {
      setValue('')
      inputRef.current?.blur()
    }
  }

  return (
    <div className="main-header-search" style={{ position: 'relative' }}>
      <span style={{
        position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
        color: 'var(--text-muted)', fontSize: 14, pointerEvents: 'none',
      }}>🔍</span>
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search contacts... (↵ to go)"
        style={{ paddingLeft: 32 }}
      />
    </div>
  )
}
