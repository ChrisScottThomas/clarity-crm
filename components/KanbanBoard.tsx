'use client'
import { useState } from 'react'
import { DndContext, DragEndEvent, useDroppable } from '@dnd-kit/core'
import { STAGES } from '../lib/constants'
import LeadCard from './LeadCard'

export default function KanbanBoard({ initialLeads }: { initialLeads: any[] }) {
  const [leads, setLeads] = useState(initialLeads)
  async function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id); const stage = e.over?.id ? String(e.over.id) : null
    if (!stage) return
    setLeads(prev => prev.map(l => l.id === id ? { ...l, stage } : l))
    await fetch(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ stage }) })
  }
  return (
    <DndContext onDragEnd={onDragEnd}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STAGES.length}, minmax(180px,1fr))`, gap: 12, overflowX: 'auto' }}>
        {STAGES.map(stage => (
          <Column key={stage} stage={stage} leads={leads.filter(l => l.stage === stage)} />
        ))}
      </div>
    </DndContext>
  )
}
function Column({ stage, leads }: { stage: string; leads: any[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  return (
    <div ref={setNodeRef} style={{ background: isOver ? 'var(--bg-overlay)' : 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: 8, minHeight: 200 }}>
      <div style={{ color: 'var(--accent-blue)', fontWeight: 700, marginBottom: 8 }}>{stage} ({leads.length})</div>
      {leads.map(l => <LeadCard key={l.id} lead={l} />)}
    </div>
  )
}
