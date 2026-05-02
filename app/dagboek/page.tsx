'use client'
import { useState, useEffect } from 'react'
import NavBar from '@/components/NavBar'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface DiaryEntry { id: string; dishName: string; cuisine: string; date: string; cookDuration: number; difficulty: number; rating?: number; emoji?: string; notes?: string; imagePath?: string; badgesEarned: string[]; usedPanic: boolean; recipeJson?: string }

const STARS = (n?: number) => n ? '⭐'.repeat(n) + '☆'.repeat(5-n) : '—'
const DIFF_LABEL = ['','Makkelijk','Gemiddeld','Pittig','Moeilijk','Ster'] 
const CUISINE_EMOJI: Record<string,string> = { 'Italiaans':'🍝','Aziatisch':'🍜','Mexicaans':'🌮','Nederlands':'🧀','Frans':'🥐','Indiaas':'🍛','Japans':'🍱','Grieks':'🫒','Mediterraan':'🫐','Overig':'🍽️' }

function DifficultyChart({ entries }: { entries: DiaryEntry[] }) {
  if (entries.length < 2) return null
  const sorted = [...entries].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-20)
  const W = 300, H = 100, pad = 20
  const points = sorted.map((e, i) => ({
    x: pad + (i / (sorted.length - 1)) * (W - 2*pad),
    y: H - pad - ((e.difficulty - 1) / 4) * (H - 2*pad)
  }))
  const d = points.map((p,i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <p style={{ fontWeight: 700, marginBottom: 12, color: 'var(--kms-dark)' }}>📈 Moeilijkheidsontwikkeling</p>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }}>
        {[1,2,3,4,5].map(level => (
          <text key={level} x={8} y={H - pad - ((level-1)/(4)) * (H-2*pad) + 4} fontSize={9} fill="#CCC">{level}</text>
        ))}
        <path d={d} fill="none" stroke="var(--kms-orange)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p,i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill="var(--kms-orange)" />)}
      </svg>
      <p style={{ fontSize: 12, color: '#888', textAlign: 'center' }}>Laatste {sorted.length} gerechten</p>
    </div>
  )
}

export default function DagboekPage() {
  const router = useRouter()
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [restarting, setRestarting] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/diary').then(r => r.json()).then(d => { setEntries(d.entries || []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  async function herhaalGerecht(entry: DiaryEntry) {
    setRestarting(entry.id)
    try {
      // Als er een opgeslagen recept is, gebruik dat direct
      if (entry.recipeJson && entry.recipeJson !== '{}') {
        const parsed = JSON.parse(entry.recipeJson)
        if (parsed && parsed.stappen) {
          sessionStorage.setItem('kms-active-recipe', entry.recipeJson)
          router.push('/koken')
          return
        }
      }
      // Anders: genereer het recept opnieuw via de API
      const res = await fetch('/api/ai/generate-recipe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dish_name: entry.dishName, servings: 2, user_level: 1, missing_ingredients: [] })
      })
      const data = await res.json()
      if (res.ok && data.recipe) {
        sessionStorage.setItem('kms-active-recipe', JSON.stringify(data.recipe))
        router.push('/koken')
      }
    } catch { /* ignore */ }
    finally { setRestarting(null) }
  }

  const totalTime = entries.reduce((s, e) => s + e.cookDuration, 0)
  const avgRating = entries.filter(e => e.rating).length ? (entries.filter(e => e.rating).reduce((s,e) => s + (e.rating||0), 0) / entries.filter(e => e.rating).length).toFixed(1) : '—'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--kms-cream)', paddingBottom: 80 }}>
      <div style={{ background: 'linear-gradient(135deg, #E63946, #F4A261)', padding: '24px 16px 20px', color: 'white' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>📖 Dagboek</h1>
        <p style={{ margin: '4px 0 0', opacity: 0.9 }}>{entries.length} gerechten gekookt</p>
      </div>

      <div style={{ padding: '16px' }}>
        {!loading && entries.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[['🍽️', entries.length, 'gerechten'],['⏱️', `${Math.floor(totalTime/60)}u`, 'kooktijd'],['⭐', avgRating, 'gem. score']].map(([emoji, val, label]) => (
                <div key={String(label)} className="card" style={{ textAlign: 'center', padding: '12px 8px' }}>
                  <div style={{ fontSize: 24 }}>{emoji}</div>
                  <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--kms-dark)' }}>{val}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{label}</div>
                </div>
              ))}
            </div>
            <DifficultyChart entries={entries} />
          </>
        )}

        {loading && <div style={{ textAlign: 'center', padding: '40px 0', color: '#888' }}>⏳ Dagboek laden...</div>}

        {!loading && entries.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>📖</div>
            <h3 style={{ fontWeight: 700, color: 'var(--kms-dark)', marginBottom: 8 }}>Nog geen dagboek-entries</h3>
            <p style={{ color: '#888', marginBottom: 24 }}>Kook je eerste gerecht en sla het op!</p>
            <Link href="/vandaag">
              <button className="btn-primary" style={{ width: 'auto', padding: '12px 28px' }}>🌅 Naar Vandaag</button>
            </Link>
          </div>
        )}

        {entries.map(entry => (
          <div key={entry.id} className="card" style={{ marginBottom: 14 }}>
            {entry.imagePath && (
              <img src={entry.imagePath} alt={entry.dishName} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 10, marginBottom: 12 }} />
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 22 }}>{CUISINE_EMOJI[entry.cuisine] || '🍽️'}</span>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--kms-dark)', margin: 0 }}>{entry.dishName}</h3>
                </div>
                <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
                  {new Date(entry.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {entry.emoji && <span style={{ fontSize: 24 }}>{entry.emoji}</span>}
                <button onClick={() => handleRestart(entry)} disabled={restarting === entry.id}
                  style={{ background: 'var(--kms-orange)', color: 'white', border: 'none', borderRadius: 10, padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {restarting === entry.id ? '⏳' : '🔄'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {entry.rating && <span style={{ fontSize: 13, color: '#F4A261' }}>{STARS(entry.rating)}</span>}
              <span style={{ fontSize: 12, background: '#F3F3F3', padding: '2px 8px', borderRadius: 6, color: '#666' }}>{DIFF_LABEL[entry.difficulty]}</span>
              {entry.cookDuration > 0 && <span style={{ fontSize: 12, background: '#F3F3F3', padding: '2px 8px', borderRadius: 6, color: '#666' }}>⏱️ {entry.cookDuration}min</span>}
              {entry.usedPanic && <span style={{ fontSize: 12, background: '#FFF3EE', padding: '2px 8px', borderRadius: 6, color: 'var(--kms-orange)' }}>🚨 Panic gebruikt</span>}
            </div>

            {entry.notes && <p style={{ fontSize: 13, color: '#555', margin: '0 0 8px', fontStyle: 'italic' }}>"{entry.notes}"</p>}

            {entry.badgesEarned.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {entry.badgesEarned.map((b: string) => (
                  <span key={b} style={{ fontSize: 11, background: '#FFF3EE', border: '1px solid #FFD0B0', padding: '2px 6px', borderRadius: 6, color: 'var(--kms-orange)' }}>{b}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <NavBar />
    </div>
  )
}
