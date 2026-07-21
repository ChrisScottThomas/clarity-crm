export interface EmailMessage {
  externalId: string                    // provider message id — idempotency key
  direction: 'inbound' | 'outbound'
  from: string
  to: string[]
  subject: string
  snippet: string
  sentAt: Date
}

export interface InboxProvider {
  // owner: the mailbox to read — a user identifier (UPN) when Graph is live; ignored by the mock.
  fetchMessages(owner: string, from: Date, to: Date): Promise<EmailMessage[]>
}

/**
 * Active provider in local dev. Returns a small fixed set of plausible Outlook
 * messages spread across the (backward-looking) window. Two touch dana@acme.com —
 * one inbound, one outbound — the same documented lead the calendar mock uses, so
 * both integrations light up one lead. Others use clearly-fake addresses that
 * won't match anything.
 */
export class MockInboxProvider implements InboxProvider {
  async fetchMessages(_owner: string, from: Date, to: Date): Promise<EmailMessage[]> {
    const daysBefore = (days: number, hours: number) =>
      new Date(to.getTime() - days * 86400000 + hours * 3600000)
    const mk = (
      externalId: string,
      direction: 'inbound' | 'outbound',
      fromAddr: string,
      toAddrs: string[],
      subject: string,
      snippet: string,
      sentAt: Date,
    ): EmailMessage => ({ externalId, direction, from: fromAddr, to: toAddrs, subject, snippet, sentAt })
    return [
      mk('outlook-msg-1', 'inbound', 'dana@acme.com', ['alex@example.com'],
        'Re: Pricing', "thanks, let's get a call booked next week", daysBefore(2, 9)),
      mk('outlook-msg-2', 'outbound', 'alex@example.com', ['dana@acme.com'],
        'Intro & next steps', 'great to connect — quick overview attached', daysBefore(5, 14)),
      mk('outlook-msg-3', 'inbound', 'sam@northwind.example', ['jordan@example.com'],
        'Question about your service', 'do you work with teams under 10?', daysBefore(9, 11)),
    ].filter((m) => m.sentAt >= from && m.sentAt <= to)
  }
}

/** Real Microsoft Graph provider — inactive. Built when we move out of local dev. */
export class GraphInboxProvider implements InboxProvider {
  async fetchMessages(_owner: string, _from: Date, _to: Date): Promise<EmailMessage[]> {
    throw new Error('GraphInboxProvider not implemented — using mock in local dev')
  }
}

export const inboxProvider: InboxProvider = new MockInboxProvider()
