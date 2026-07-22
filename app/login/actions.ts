'use server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { setSession } from '../../lib/auth'
import { attemptLogin } from '../../lib/login'

export async function login(formData: FormData) {
  const password = String(formData.get('password') ?? '')
  const fwd = (await headers()).get('x-forwarded-for')
  const ip = fwd?.split(',')[0]?.trim() || 'unknown'

  const result = attemptLogin(password, ip)
  if (result === 'ok') {
    await setSession()
    redirect('/pipeline')
  }
  redirect(result === 'throttled' ? '/login?error=throttled' : '/login?error=1')
}
