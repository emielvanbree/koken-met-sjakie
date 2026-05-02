'use client'
import { useState, useEffect } from 'react'
import NavBar from '@/components/NavBar'
import Link from 'next/link'

const LEVEL_COLORS = ['','#74C0FC','#69DB7C','#FFA94D','#FF6B6B','#FFD700']

interface Badge { id: string; name: string; emoji: string; desc: string; earned: boolean }
interface Progress {
  level: number; xp: number; streak: number; levelName: string; levelProgress: number
  nextLevelName?: string; xpToNextLevel: number; badges: string[]
  allBadges: Badge[]; techniqueCount: number; photoCount: number
}

export default function MijnReisPage() {
  const [progress, setProgress] = useState<Progress | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    fetch('/api/gamification').then(r => r.json()).then(d => { setProgress(d.progress); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--kms-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
      <p style={{ color: '#888' }}>⏳ Voortgang laden...</p>
      <NavBar />
    </div>
  )

  if (!progress) return (
    <div style={{ minHeight: '100vh', background: 'var(--kms-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, paddingBottom: 80 }}>
      <p style={{ color: '#888' }}>Log in om je voortgang te zien.</p>
      <Link href="/login"><button className="btn-primary" style={{ width: 'auto', padding: '12px 28px' }}>Inloggen</button></Link>
      <NavBar />
    </div>
  )

  const earnedBadges = progress.allBadges.filter(b => b.earned)
  const lockedBadges = progress.allBadges.filter(b => !b.earned)
  const levelColor = LEVEL_COLORS[progress.level] || '#FF6B35'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--kms-cream)', paddingBottom: 80 }}>
      <div style={{ background: `linear-gradient(135deg, ${levelColor}, ${levelColor}99)`, padding: '24px 16px 20px', color: 'white' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>🏆 Mijn Reis</h1>
        <p style={{ margin: '4px 0 0', opacity: 0.9 }}>Op weg naar sterrenniveau</p>
      </div>

      <div style={{ padding: '16px' }}>
        {/* Level card */}
        <div className="card" style={{ marginBottom: 16, background: `linear-gradient(135deg, ${levelColor}15, white)`, border: `2px solid ${levelColor}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <p style={{ fontSize: 13, color: '#888', margin: 0 }}>NIVEAU {progress.level}</p>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--kms-dark)', margin: '2px 0' }}>{progress.levelName}</h2>
            </div>
            <div style={{ fontSize: 52 }}>
              {['','🥄','🍳','🧑‍🍳','👨‍🍳','⭐'][progress.level]}
            </div>
          </div>
          <div style={{ background: '#F0F0F0', borderRadius: 8, height: 12, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ width: `${progress.levelProgress}%`, height: '100%', background: levelColor, borderRadius: 8, transition: 'width 0.5s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#888' }}>
            <span>{progress.xp} XP</span>
            {progress.nextLevelName && <span>→ {progress.nextLevelName} nog {progress.xpToNextLevel} XP</span>}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
          {([['🔥', progress.streak, 'dagen streak'],['📚', progress.techniqueCount, 'technieken'],['📸', progress.photoCount, "foto's"]] as [string,number|string,string][]).map(([emoji, val, label]) => (
            <div key={String(label)} className="card" style={{ textAlign: 'center', padding: '12px 8px' }}>
              <div style={{ fontSize: 24 }}>{emoji}</div>
              <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--kms-dark)' }}>{val}</div>
              <div style={{ fontSize: 11, color: '#888' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Earned badges */}
        {earnedBadges.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--kms-dark)', marginBottom: 12 }}>🏅 Verdiende badges ({earnedBadges.length})</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {earnedBadges.map(badge => (
                <div key={badge.id} className="card" style={{ background: 'linear-gradient(135deg, #FFF9E6, white)', border: '2px solid var(--kms-yellow)' }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>{badge.emoji}</div>
                  <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--kms-dark)', margin: '0 0 2px' }}>{badge.name}</p>
                  <p style={{ fontSize: 12, color: '#888', margin: 0 }}>{badge.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Locked badges */}
        {lockedBadges.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--kms-dark)', margin: 0 }}>🔒 Te verdienen ({lockedBadges.length})</p>
              <button onClick={() => setShowAll(!showAll)} style={{ color: 'var(--kms-orange)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
                {showAll ? 'Minder' : 'Toon alles'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {(showAll ? lockedBadges : lockedBadges.slice(0,4)).map(badge => (
                <div key={badge.id} className="card" style={{ opacity: 0.5, filter: 'grayscale(1)' }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>{badge.emoji}</div>
                  <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--kms-dark)', margin: '0 0 2px' }}>{badge.name}</p>
                  <p style={{ fontSize: 12, color: '#888', margin: 0 }}>{badge.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {earnedBadges.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 64, marginBottom: 12 }}>🥄</div>
            <h3 style={{ fontWeight: 700, color: 'var(--kms-dark)', marginBottom: 8 }}>Begin je reis!</h3>
            <p style={{ color: '#888', marginBottom: 24 }}>Kook je eerste gerecht om je eerste badge te verdienen.</p>
            <Link href="/vandaag">
              <button className="btn-primary" style={{ width: 'auto', padding: '12px 28px' }}>🌅 Aan de slag!</button>
            </Link>
          </div>
        )}
      </div>
      <NavBar />
    </div>
  )
}
