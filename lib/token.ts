// Signed, expiring session tokens.
//
// Format: `<payloadB64url>.<hmacHex>` where payload is `{ n: nonce, iat: ms }`.
// The signature covers the encoded payload; verification is timing-safe and
// enforces a TTL. One implementation, shared by the login/session code and the
// proxy (both run on the Node.js runtime), so there is no second verifier to
// drift out of sync.

import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { getSessionSecret } from './env'

export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
export const SESSION_COOKIE = 'clarity_session'

type TokenOpts = { now?: number }
type Payload = { n: string; iat: number }

function sign(payloadB64: string): string {
  return createHmac('sha256', getSessionSecret()).update(payloadB64).digest('hex')
}

function encodePayload(payload: Payload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

export function makeToken(opts: TokenOpts = {}): string {
  const iat = opts.now ?? Date.now()
  const payloadB64 = encodePayload({ n: randomBytes(16).toString('hex'), iat })
  return `${payloadB64}.${sign(payloadB64)}`
}

export function verifyToken(token: string | undefined, opts: TokenOpts = {}): boolean {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [payloadB64, sig] = parts
  if (!payloadB64 || !sig) return false

  // Timing-safe signature check. timingSafeEqual requires equal-length buffers,
  // so a wrong-length signature is rejected before the comparison.
  const expected = sign(payloadB64)
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expected)
  if (sigBuf.length !== expectedBuf.length) return false
  if (!timingSafeEqual(sigBuf, expectedBuf)) return false

  let payload: Payload
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return false
  }
  if (typeof payload?.iat !== 'number') return false

  const now = opts.now ?? Date.now()
  if (payload.iat + TOKEN_TTL_MS < now) return false

  return true
}
