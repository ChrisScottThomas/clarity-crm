import { NextResponse } from 'next/server'
import { prisma } from '../../../../../lib/db'
import { scoreLead } from '../../../../../lib/ai-score'
import { runWorkflows } from '../../../../../lib/workflow-executor'
import { Stage } from '../../../../../lib/constants'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const lead = await prisma.lead.findUnique({ where: { id } })
  if (!lead) return NextResponse.json({ error: 'not found' }, { status: 404 })

  try {
    const result = await scoreLead(lead)
    const updated = await prisma.lead.update({
      where: { id },
      data: {
        aiScore: result.score,
        aiScoreLabel: result.label,
        aiSummary: result.summary,
        aiRecommendation: result.recommendation,
      },
    })
    await runWorkflows({
      kind: 'lead.score_updated',
      lead: { id: updated.id, name: updated.name, email: updated.email, stage: updated.stage as Stage, owner: updated.owner },
      score: updated.aiScore,
    })
    return NextResponse.json(updated)
  } catch (err) {
    console.error('AI scoring failed:', err)
    return NextResponse.json({ error: 'scoring failed' }, { status: 500 })
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const lead = await prisma.lead.findUnique({ where: { id } })
  if (!lead) return NextResponse.redirect(new URL('/contacts', req.url))

  try {
    const result = await scoreLead(lead)
    const updated = await prisma.lead.update({
      where: { id },
      data: {
        aiScore: result.score,
        aiScoreLabel: result.label,
        aiSummary: result.summary,
        aiRecommendation: result.recommendation,
      },
    })
    await runWorkflows({
      kind: 'lead.score_updated',
      lead: { id: updated.id, name: updated.name, email: updated.email, stage: updated.stage as Stage, owner: updated.owner },
      score: updated.aiScore,
    })
  } catch (err) {
    console.error('AI scoring failed:', err)
  }
  return NextResponse.redirect(new URL(`/leads/${id}`, req.url))
}
