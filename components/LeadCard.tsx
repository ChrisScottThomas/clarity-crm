'use client'
import { useDraggable } from '@dnd-kit/core'
import ConstraintChip from './ConstraintChip'
import { DIAGNOSTICS_ENABLED } from '../lib/constants'
export default function LeadCard({ lead }: { lead: any }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: lead.id })
  const style = { transform: transform ? `translate(${transform.x}px,${transform.y}px)` : undefined,
    border: '1px solid var(--border)', borderRadius: 6, padding: 8, marginBottom: 8, background: 'var(--bg-surface)', cursor: 'grab' }
  return (
    <div ref={setNodeRef} style={style as any} {...listeners} {...attributes}>
      <a href={`/leads/${lead.id}`} style={{ fontWeight: 700 }}>{lead.name}</a>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{lead.companyName ?? ''} · {lead.owner ?? ''}</div>
      {DIAGNOSTICS_ENABLED && <div style={{ marginTop: 6 }}><ConstraintChip value={lead.primaryConstraint} /></div>}
    </div>
  )
}
