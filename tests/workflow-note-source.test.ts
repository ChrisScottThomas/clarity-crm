import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/db', () => ({
  prisma: {
    workflowRule: { findMany: vi.fn() },
    workflowRun: { create: vi.fn().mockResolvedValue({}) },
    conversation: { create: vi.fn().mockResolvedValue({ id: 'c1' }) },
  },
}))

import { prisma } from '../lib/db'
import { runWorkflows } from '../lib/workflow-executor'

const p = prisma as unknown as {
  workflowRule: { findMany: ReturnType<typeof vi.fn> }
  conversation: { create: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.clearAllMocks()
  p.workflowRule.findMany.mockResolvedValue([
    { id: 'r1', name: 'Log it', trigger: 'Lead created', action: 'Log activity note', enabled: true },
  ])
})

describe('workflow note effect', () => {
  it('writes a Conversation tagged source=workflow', async () => {
    await runWorkflows({
      kind: 'lead.created',
      lead: { id: 'lead_1', name: 'Dana', email: 'dana@acme.com', stage: 'New Lead', owner: 'Alex' },
    })
    expect(p.conversation.create).toHaveBeenCalledTimes(1)
    const data = p.conversation.create.mock.calls[0][0].data
    expect(data.source).toBe('workflow')
    expect(data.type).toBe('note')
    expect(data.leadId).toBe('lead_1')
  })
})
