export interface EmailMessage { to: string; subject: string; body: string }
export interface EmailProvider { send(msg: EmailMessage): Promise<{ ok: boolean }> }
export class MockEmailProvider implements EmailProvider {
  sent: EmailMessage[] = []
  async send(msg: EmailMessage) { this.sent.push(msg); console.log('[mock email]', msg.to, msg.subject); return { ok: true } }
}
export const emailProvider: EmailProvider = new MockEmailProvider()
