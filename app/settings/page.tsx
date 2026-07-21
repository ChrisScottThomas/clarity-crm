import { prisma } from '../../lib/db'
import SettingsForm from '../../components/SettingsForm'
export const dynamic = 'force-dynamic'
export default async function Settings() {
  const rows = await prisma.setting.findMany()
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]))
  return (<div className="page-body"><h1>Settings</h1><SettingsForm initial={settings} /></div>)
}
