'use server'
import { redirect } from 'next/navigation'
import { setSession } from '../../lib/auth'

export async function login(formData: FormData) {
  const password = String(formData.get('password') ?? '')
  if (password === process.env.CRM_PASSWORD) { await setSession(); redirect('/pipeline') }
  redirect('/login?error=1')
}
