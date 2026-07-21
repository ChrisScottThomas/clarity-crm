import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EmailMessage } from '../lib/integrations/inbox'

vi.mock('../lib/db', () => ({
  prisma: {
    lead: { findFirst: vi.fn() },
    conversation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('../lib/integrations/inbox', () => ({ inboxProvider: { fetchMessages: vi.fn() } }))

import { prisma } from '../lib/db'
import { inboxProvider } from '../lib/integrations/inbox'
import { syncEmailActivity } from '../lib/integrations/email-sync'

const p = prisma as unknown as {
  lead: { findFirst: ReturnType<typeof vi.fn> }
  conversation: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
}
const fetchMessages = (inboxProvider as unknown as { fetchMessages: ReturnType<typeof vi.fn> }).fetchMessages

function msg(over: Partial<EmailMessage> = {}): EmailMessage {
  return {
    externalId: 'msg_1',
    direction: 'inbound',
    from: 'dana@acme.com',
    to: ['alex@example.com'],
    subject: 'Re: Pricing',
    snippet: 'lets book a call',
    sentAt: new Date('2026-06-20T09:00:00.000Z'),
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  p.lead.findFirst.mockResolvedValue(null)
  p.conversation.findUnique.mockResolvedValue(null)
  p.conversation.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'conv_new', ...data }))
  p.conversation.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'conv_x', ...data }))
  fetchMessages.mockResolvedValue([])
})

describe('syncEmailActivity', () => {
  it('creates a Conversation for a matched inbound email', async () => {
    p.lead.findFirst.mockResolvedValue({ id: 'lead_1', email: 'dana@acme.com' })
    fetchMessages.mockResolvedValue([msg()])
    const result = await syncEmailActivity()
    expect(p.lead.findFirst).toHaveBeenCalledWith({ where: { email: { in: ['dana@acme.com'] } } })
    const data = p.conversation.create.mock.calls[0][0].data
    expect(data.type).toBe('email')
    expect(data.source).toBe('outlook')
    expect(data.leadId).toBe('lead_1')
    expect(data.externalId).toBe('msg_1')
    expect(data.createdAt).toEqual(new Date('2026-06-20T09:00:00.000Z'))
    expect(data.body).toContain('←')
    expect(result).toEqual({ created: 1, updated: 0, skipped: 0 })
  })

  it('matches an outbound email by its recipient (to) address', async () => {
    p.lead.findFirst.mockResolvedValue({ id: 'lead_1', email: 'dana@acme.com' })
    fetchMessages.mockResolvedValue([msg({
      direction: 'outbound', from: 'alex@example.com', to: ['dana@acme.com'],
    })])
    const result = await syncEmailActivity()
    expect(p.lead.findFirst).toHaveBeenCalledWith({ where: { email: { in: ['dana@acme.com'] } } })
    expect(p.conversation.create.mock.calls[0][0].data.body).toContain('→')
    expect(result.created).toBe(1)
  })

  it('skips an email whose counterpart matches no lead', async () => {
    fetchMessages.mockResolvedValue([msg({ from: 'stranger@nowhere.example' })])
    const result = await syncEmailActivity()
    expect(p.conversation.create).not.toHaveBeenCalled()
    expect(result).toEqual({ created: 0, updated: 0, skipped: 1 })
  })

  it('excludes team addresses when matching an outbound recipient list', async () => {
    p.lead.findFirst.mockResolvedValue({ id: 'lead_1', email: 'dana@acme.com' })
    fetchMessages.mockResolvedValue([msg({
      direction: 'outbound', from: 'alex@example.com',
      to: ['jordan@example.com', 'dana@acme.com'],
    })])
    await syncEmailActivity()
    expect(p.lead.findFirst).toHaveBeenCalledWith({ where: { email: { in: ['dana@acme.com'] } } })
  })

  it('is idempotent: a re-synced email updates instead of duplicating', async () => {
    p.lead.findFirst.mockResolvedValue({ id: 'lead_1', email: 'dana@acme.com' })
    p.conversation.findUnique.mockResolvedValue({ id: 'conv_existing', externalId: 'msg_1' })
    fetchMessages.mockResolvedValue([msg()])
    const result = await syncEmailActivity()
    expect(p.conversation.create).not.toHaveBeenCalled()
    expect(p.conversation.update).toHaveBeenCalledTimes(1)
    expect(p.conversation.update.mock.calls[0][0].where).toEqual({ id: 'conv_existing' })
    expect(result).toEqual({ created: 0, updated: 1, skipped: 0 })
  })

  it('sets createdAt to the email sentAt so the timeline sorts correctly', async () => {
    p.lead.findFirst.mockResolvedValue({ id: 'lead_1', email: 'dana@acme.com' })
    fetchMessages.mockResolvedValue([msg({ sentAt: new Date('2026-06-15T12:00:00.000Z') })])
    await syncEmailActivity()
    expect(p.conversation.create.mock.calls[0][0].data.createdAt).toEqual(new Date('2026-06-15T12:00:00.000Z'))
  })
})
