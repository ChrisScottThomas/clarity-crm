import { login } from './actions'
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <form action={login} style={{ display: 'grid', gap: 12, minWidth: 280 }}>
        <h1>Clarity CRM</h1>
        <input name="password" type="password" placeholder="Password" autoFocus />
        {error && <p style={{ color: '#ff3131' }}>Incorrect password.</p>}
        <button type="submit">Sign in</button>
      </form>
    </main>
  )
}
