import { cookies } from 'next/headers'

export async function getTheme(): Promise<'dark' | 'light'> {
  const jar = await cookies()
  const val = jar.get('theme')?.value
  return val === 'light' ? 'light' : 'dark'
}
