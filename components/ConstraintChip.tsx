import { CONSTRAINT_COLORS, Constraint } from '../lib/constants'
export default function ConstraintChip({ value }: { value?: string | null }) {
  if (!value) return null
  const color = CONSTRAINT_COLORS[value as Constraint] ?? '#888'
  return <span style={{ background: color, color: '#020f31', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{value}</span>
}
