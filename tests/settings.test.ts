import { describe, it, expect } from 'vitest'
import { resolveBookingLink } from '../lib/settings'

const settings = {
  booking_link_shared: 'https://cal.com/alex-jordan/discovery',
  booking_link_alex: '',
  booking_link_jordan: 'https://cal.com/jordan/discovery',
}

describe('resolveBookingLink', () => {
  it('falls back to shared link when owner link is unset', () => {
    expect(resolveBookingLink(settings, 'Alex')).toBe('https://cal.com/alex-jordan/discovery')
  })
  it('uses the owner link when set', () => {
    expect(resolveBookingLink(settings, 'Jordan')).toBe('https://cal.com/jordan/discovery')
  })
  it('returns the shared link when no owner given', () => {
    expect(resolveBookingLink(settings)).toBe('https://cal.com/alex-jordan/discovery')
  })
})
