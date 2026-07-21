import { describe, it, expect } from 'vitest'
import { MockInboxProvider, GraphInboxProvider, inboxProvider } from '../lib/integrations/inbox'

const to = new Date()
const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)

describe('MockInboxProvider', () => {
  it('returns at least three sample messages', async () => {
    const msgs = await new MockInboxProvider().fetchMessages('shared', from, to)
    expect(msgs.length).toBeGreaterThanOrEqual(3)
  })

  it('places every message inside the requested window', async () => {
    const msgs = await new MockInboxProvider().fetchMessages('shared', from, to)
    for (const m of msgs) {
      expect(m.sentAt.getTime()).toBeGreaterThanOrEqual(from.getTime())
      expect(m.sentAt.getTime()).toBeLessThanOrEqual(to.getTime())
    }
  })

  it('includes dana@acme.com in both an inbound and an outbound message', async () => {
    const msgs = await new MockInboxProvider().fetchMessages('shared', from, to)
    const touchesDana = (m: { from: string; to: string[] }) =>
      m.from === 'dana@acme.com' || m.to.includes('dana@acme.com')
    expect(msgs.some((m) => touchesDana(m) && m.direction === 'inbound')).toBe(true)
    expect(msgs.some((m) => touchesDana(m) && m.direction === 'outbound')).toBe(true)
  })

  it('gives every message a unique externalId', async () => {
    const msgs = await new MockInboxProvider().fetchMessages('shared', from, to)
    const ids = msgs.map((m) => m.externalId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('GraphInboxProvider', () => {
  it('throws until implemented (mock-first in local dev)', async () => {
    await expect(new GraphInboxProvider().fetchMessages('shared', from, to)).rejects.toThrow(/not implemented/i)
  })
})

describe('inboxProvider', () => {
  it('is the mock in local dev', () => {
    expect(inboxProvider).toBeInstanceOf(MockInboxProvider)
  })
})
