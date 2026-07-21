export default function RelationshipBadge({ value }: { value: string }) {
  const isClient = value === 'client'
  return (
    <span style={{
      padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
      border: isClient ? '2px solid #34d399' : '1px solid #1d2c52',
      background: isClient ? '#0c2a1f' : 'transparent',
      color: isClient ? '#34d399' : '#cbd5e1',
    }}>{value}{isClient ? ' ✓' : ''}</span>
  )
}
