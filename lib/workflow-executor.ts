// Workflow executor — the effectful half of the engine.
//
// Loads enabled rules, asks the pure engine (workflow-engine.ts) what should
// happen, performs the I/O, and records every outcome in WorkflowRun. Designed
// to be fire-and-forget from API routes: a failing rule is logged, never thrown
// back to the caller, so automation can never break a core lead mutation.
import { prisma } from './db'
import { emailProvider } from './integrations/email'
import { Stage } from './constants'
import {
  WorkflowEvent, WorkflowEffect, RuleLike,
  triggerMatches, planEffects, planScheduledEffect,
} from './workflow-engine'

type RunStatus = 'success' | 'skipped' | 'error'

async function record(rule: RuleLike, leadId: string | null, status: RunStatus, detail: string) {
  await prisma.workflowRun.create({
    data: { ruleId: rule.id, trigger: rule.trigger, action: rule.action, leadId, status, detail },
  })
}

// Perform one planned effect, returning a human-readable outcome line.
async function perform(effect: WorkflowEffect): Promise<{ status: RunStatus; detail: string }> {
  switch (effect.type) {
    case 'email': {
      const res = await emailProvider.send({ to: effect.to, subject: effect.subject, body: effect.body })
      return { status: res.ok ? 'success' : 'error', detail: `emailed ${effect.to}` }
    }
    case 'reminder': {
      const dueDate = new Date(Date.now() + effect.dueInDays * 24 * 60 * 60 * 1000)
      await prisma.openLoop.create({
        data: { leadId: effect.leadId, description: effect.description, direction: 'owed-from', dueDate },
      })
      return { status: 'success', detail: `reminder due in ${effect.dueInDays}d` }
    }
    case 'note': {
      await prisma.conversation.create({ data: { leadId: effect.leadId, type: 'note', source: 'workflow', body: effect.body } })
      return { status: 'success', detail: 'logged activity note' }
    }
    case 'slack':
      // No Slack provider yet — log the intent so it is visible and auditable.
      console.log('[workflow:slack]', effect.text)
      return { status: 'success', detail: `slack (logged): ${effect.text}` }
    case 'advance_stage': {
      await prisma.lead.update({
        where: { id: effect.leadId },
        data: { stage: effect.toStage, stageChangedAt: new Date() },
      })
      return { status: 'success', detail: `advanced ${effect.fromStage} → ${effect.toStage}` }
    }
    case 'noop':
      return { status: 'skipped', detail: effect.reason }
  }
}

/**
 * Run all enabled rules that match a live event. Fire-and-forget safe.
 * Returns the number of rules that fired (matched + at least one non-noop effect).
 */
export async function runWorkflows(event: WorkflowEvent): Promise<number> {
  const rules = await prisma.workflowRule.findMany({ where: { enabled: true } })
  let fired = 0
  for (const rule of rules) {
    if (!triggerMatches(rule.trigger, event)) continue
    try {
      const effects = planEffects(rule.action, event)
      let didSomething = false
      for (const effect of effects) {
        const { status, detail } = await perform(effect)
        if (status !== 'skipped') didSomething = true
        await record(rule, event.lead.id, status, detail)
      }
      if (didSomething) fired++
    } catch (err) {
      console.error('[workflow] rule failed:', rule.name, err)
      await record(rule, event.lead.id, 'error', String(err))
    }
  }
  return fired
}

/**
 * Run all enabled time-based rules across the whole pipeline. Invoked by the
 * manual "Run scheduled rules" endpoint (or a future cron).
 */
export async function runScheduledWorkflows(now = new Date()): Promise<number> {
  const rules = await prisma.workflowRule.findMany({ where: { enabled: true } })
  const scheduled = rules.filter(r => r.action === 'Move to next stage after 7 days')
  if (scheduled.length === 0) return 0

  const leads = await prisma.lead.findMany({
    select: { id: true, name: true, email: true, stage: true, owner: true, stageChangedAt: true },
  })
  let fired = 0
  for (const rule of scheduled) {
    for (const lead of leads) {
      const ctx = { id: lead.id, name: lead.name, email: lead.email, stage: lead.stage as Stage, owner: lead.owner }
      const effect = planScheduledEffect(rule.action, ctx, lead.stageChangedAt, now)
      if (effect.type === 'noop') continue
      try {
        const { status, detail } = await perform(effect)
        await record(rule, lead.id, status, detail)
        if (status !== 'skipped') fired++
      } catch (err) {
        console.error('[workflow] scheduled rule failed:', rule.name, err)
        await record(rule, lead.id, 'error', String(err))
      }
    }
  }
  return fired
}
