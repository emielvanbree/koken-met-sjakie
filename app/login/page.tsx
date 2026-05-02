'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error || 'Inloggen mislukt'); return }
    router.push('/vandaag')
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--kms-cream)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ fontSize: 56 }}>👨‍🍳</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--kms-dark)', margin: '8px 0 4px' }}>Koken met Sjakie</h1>
      <p style={{ color: '#888', marginBottom: 32 }}>Op weg naar sterrenniveau</p>
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 400 }}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, color: 'var(--kms-dark)' }}>E-mailadres</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid #E0E0E0', fontSize: 16, outline: 'none', boxSizing: 'border-box' }}
              placeholder="jouw@email.nl" />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, color: 'var(--kms-dark)' }}>Wachtwoord</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid #E0E0E0', fontSize: 16, outline: 'none', boxSizing: 'border-box' }}
              placeholder="••••••••" />
          </div>
        </div>
        {error && <p style={{ color: 'var(--kms-red)', marginBottom: 12, textAlign: 'center', fontSize: 14 }}>{error}</p>}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? '⏳ Inloggen...' : '🔑 Inloggen'}
        </button>
        <div style={{ textAlign: 'center', marginTop: 16, color: '#666' }}>
          Nog geen account?{' '}
          <Link href="/register" style={{ color: 'var(--kms-orange)', fontWeight: 600 }}>Registreren</Link>
        </div>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Link href="/vandaag?guest=1" style={{ color: '#888', fontSize: 14 }}>Doorgaan zonder account →</Link>
        </div>
      </form>
    </div>
  )
}
