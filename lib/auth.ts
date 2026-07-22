import { cookies } from 'next/headers'
import { makeToken, TOKEN_TTL_MS, SESSION_COOKIE } from './token'

export async function setSession() {
  const c = await cookies()
  c.set(SESSION_COOKIE, makeToken(), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: Math.floor(TOKEN_TTL_MS / 1000),
  })
}
export async function clearSession() {
  const c = await cookies()
  c.delete(SESSION_COOKIE)
}
export { SESSION_COOKIE }
