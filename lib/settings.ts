import { Owner } from './constants'

export type SettingsMap = Record<string, string>

export function resolveBookingLink(settings: SettingsMap, owner?: Owner): string {
  const shared = settings.booking_link_shared ?? ''
  if (!owner) return shared
  const key = owner === 'Alex' ? 'booking_link_alex' : 'booking_link_jordan'
  const ownerLink = settings[key]
  return ownerLink && ownerLink.length > 0 ? ownerLink : shared
}

export async function loadSettings(prisma: { setting: { findMany: () => Promise<{ key: string; value: string }[]> } }): Promise<SettingsMap> {
  const rows = await prisma.setting.findMany()
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}
