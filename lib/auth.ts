import { cookies } from 'next/headers'
import { createHmac } from 'crypto'

const COOKIE = 'clarity_session'
function sign(value: string): string {
  const secret = process.env.SESSION_SECRET ?? 'dev'
  return createHmac('sha256', secret).update(value).digest('hex')
}
export function makeToken(): string {
  const v = 'ok'
  return `${v}.${sign(v)}`
}
export function verifyToken(token?: string): boolean {
  if (!token) return false
  const [v, sig] = token.split('.')
  return v === 'ok' && sig === sign(v)
}
export async function setSession() {
  const c = await cookies()
  c.set(COOKIE, makeToken(), { httpOnly: true, sameSite: 'lax', path: '/' })
}
export async function clearSession() {
  const c = await cookies()
  c.delete(COOKIE)
}
export const SESSION_COOKIE = COOKIE
