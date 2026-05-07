'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import NavBar from '@/components/NavBar'
import { useRouter } from 'next/navigation'
import type { Recipe, RecipeStep, Timer } from '@/types'
import { speak, stopSpeaking, getAvailableVoices, TTS_STORAGE_KEY } from '@/lib/tts'

const TIMER_COLORS = ['#FF6B35','#2D6A4F','#E63946','#4361EE','#7209B7','#F72585']

export default function KokenPage() {
  const router = useRouter()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [timers, setTimers] = useState<Timer[]>([])
  const [panicOpen, setPanicOpen] = useState(false)
  const [panicText, setPanicText] = useState('')
  const [panicAdvice, setPanicAdvice] = useState('')
  const [panicLoading, setPanicLoading] = useState(false)
  const [techniqueModal, setTechniqueModal] = useState<{term: string, text: string} | null>(null)
  const [techniqueLoading, setTechniqueLoading] = useState(false)
  const [ratingOpen, setRatingOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [ratingEmoji, setRatingEmoji] = useState('')
  const [ratingNote, setRatingNote] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [savedBadges, setSavedBadges] = useState<{name:string,emoji:string}[]>([])
  const [leveledUp, setLeveledUp] = useState(false)
  const [voiceActive, setVoiceActive] = useState(false)
  const [usedPanic, setUsedPanic] = useState(false)
  const [startTime] = useState(Date.now())
  const [voiceModalOpen, setVoiceModalOpen] = useState(false)
  const [timerWarningOpen, setTimerWarningOpen] = useState(false)
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>('')
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recognitionRef = useRef<any>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('kms-active-recipe')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        // Injecteer een vaste "Verzamel ingrediënten" stap als eerste stap
        const ingredientStep: RecipeStep = {
          stap_nummer: 1,
          instructie: `Verzamel alle ingrediënten voor ${parsed.naam}.`,
          ingredienten_deze_stap: (parsed.ingredienten || []).map((i: { naam: string; hoeveelheid: number; eenheid: string }) =>
            `${i.hoeveelheid > 0 ? `${i.hoeveelheid} ${i.eenheid} ` : ''}${i.naam}`
          ),
          heeft_timer: false,
          timer: undefined,
          techniek_uitleg: null,
          proactieve_tip: { type: 'techniek', tekst: 'Leg alles klaar voordat je begint — dat maakt het koken veel rustiger.' },
        }
        // Hernummer de bestaande stappen
        const hergenummerd = (parsed.stappen || []).map((s: RecipeStep, idx: number) => ({
          ...s,
          stap_nummer: idx + 2,
        }))
        const recipeMetVerzamel = { ...parsed, stappen: [ingredientStep, ...hergenummerd] }
        setRecipe(recipeMetVerzamel)
        // Spreek stap 1 direct uit zodra de stemmen geladen zijn
        setTimeout(() => speak(`Stap 1: Verzamel alle ingrediënten voor ${parsed.naam}.`), 800)
      } catch {}
    }
    // Wake Lock: scherm aanblijven tijdens kookmodus
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen')
        }
      } catch {}
    }
    requestWakeLock()

    // Laad beschikbare stemmen — browsers laden deze asynchroon
    const loadVoices = () => {
      const voices = getAvailableVoices()
      setAvailableVoices(voices)
      try {
        const saved = localStorage.getItem(TTS_STORAGE_KEY)
        if (saved) setSelectedVoiceName(saved)
        else if (voices.length) setSelectedVoiceName(voices[0].name)
      } catch {}
    }
    loadVoices()
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices
    }
  }, [])

  // Timer tick
  useEffect(() => {
    timerIntervalRef.current = setInterval(() => {
      setTimers(prev => prev.map(t => {
        if (!t.actief || t.voltooid) return t
        const remaining = t.resterendSeconden - 1
        if (remaining <= 0) {
          speak(`De ${t.componentNaam} is klaar!`)
          return { ...t, resterendSeconden: 0, voltooid: true, actief: false }
        }
        return { ...t, resterendSeconden: remaining }
      }))
    }, 1000)
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); if (wakeLockRef.current) { wakeLockRef.current.release().catch(() => {}) } }
  }, [])

  function startTimer(step: RecipeStep) {
    if (!step.heeft_timer || !step.timer) return
    // Robuste extractie: AI kan meerdere veldnamen gebruiken
    const t = step.timer as Record<string, unknown>
    const rawDuur = t.duur_seconden ?? t.duration ?? t.seconds ?? t.duur ?? t.tijdsduur ?? t.tijd_seconden ?? 0
    const duurSec = Math.max(10, Number(rawDuur) || 120)
    const newTimer: Timer = {
      id: `${Date.now()}`,
      componentNaam: step.timer.component_naam,
      duurSeconden: duurSec,
      resterendSeconden: duurSec,
      type: step.timer.type as Timer['type'],
      actief: true, voltooid: false,
    }
    setTimers(prev => [...prev.slice(-5), newTimer])
  }

  function dismissTimer(id: string) { setTimers(prev => prev.filter(t => t.id !== id)) }

  function goToStep(idx: number) {
    if (!recipe) return
    setCurrentStep(idx)
    const step = recipe.stappen[idx]
    speak(`Stap ${step.stap_nummer}: ${step.instructie}`)
  }

  function handleKlaar() {
    if (!recipe) return
    const step = recipe.stappen[currentStep]
    if (step.heeft_timer) startTimer(step)
    if (currentStep < recipe.stappen.length - 1) {
      goToStep(currentStep + 1)
    } else {
      // Laatste stap: controleer of er nog actieve timers lopen
      const heeftActieveTimer = timers.some(t => t.actief && !t.voltooid)
      if (heeftActieveTimer) {
        setTimerWarningOpen(true)
      } else {
        if (wakeLockRef.current) { wakeLockRef.current.release().catch(() => {}) }
        setRatingOpen(true)
      }
    }
  }

  function handleTochDoorgaan() {
    setTimerWarningOpen(false)
    if (wakeLockRef.current) { wakeLockRef.current.release().catch(() => {}) }
    setRatingOpen(true)
  }

  async function loadTechnique(term: string) {
    if (!term) return
    setTechniqueLoading(true); setTechniqueModal({ term, text: '' })
    try {
      const res = await fetch('/api/ai/technique', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term, context: recipe?.naam || '' })
      })
      const data = await res.json()
      setTechniqueModal({ term, text: data.explanation || 'Geen uitleg beschikbaar' })
      await fetch('/api/gamification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'technique_viewed' }) })
    } catch { setTechniqueModal({ term, text: 'Kon uitleg niet laden.' }) }
    finally { setTechniqueLoading(false) }
  }

  async function handlePanic() {
    if (!panicText.trim()) return
    setPanicLoading(true); setUsedPanic(true)
    const step = recipe?.stappen[currentStep]
    const res = await fetch('/api/ai/panic', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem: panicText, dish: recipe?.naam, current_step: step?.instructie })
    })
    const data = await res.json()
    setPanicAdvice(data.advice || 'Geen advies beschikbaar')
    setPanicLoading(false)
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) { setPhoto(f); setPhotoPreview(URL.createObjectURL(f)) }
  }

  async function saveEntry() {
    setSaving(true)
    setSaveError('')
    let imagePath = ''
    if (photo) {
      try {
        const fd = new FormData(); fd.append('file', photo)
        const upRes = await fetch('/api/upload', { method: 'POST', body: fd })
        const upData = await upRes.json()
        if (upRes.ok) imagePath = upData.url
        // Als upload mislukt (bijv. niet ingelogd): ga gewoon door zonder foto
      } catch { /* upload mislukt, ga door zonder foto */ }
    }
    const duration = Math.round((Date.now() - startTime) / 60000)
    try {
      const res = await fetch('/api/diary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dishName: recipe?.naam, cuisine: recipe?.keuken_type || 'Overig',
          cookDuration: duration, difficulty: recipe?.moeilijkheid || 1,
          servings: recipe?.porties || 2, rating: rating || null,
          emoji: ratingEmoji || null, notes: ratingNote || null,
          imagePath: imagePath || null, usedPanic,
          recipeJson: recipe,
        })
      })
      const data = await res.json()
      setSaving(false)
      if (res.ok) {
        if (data.newBadges?.length) setSavedBadges(data.newBadges)
        if (data.leveledUp) setLeveledUp(true)
        sessionStorage.removeItem('kms-active-recipe')
        if (!data.newBadges?.length && !data.leveledUp) router.push('/dagboek')
      } else {
        setSaveError(res.status === 401
          ? '🔒 Je bent niet ingelogd. Log in om je kookprestaties op te slaan.'
          : (data.error || 'Opslaan mislukt. Probeer opnieuw.'))
      }
    } catch {
      setSaving(false)
      setSaveError('Verbindingsfout. Controleer je internetverbinding en probeer opnieuw.')
    }
  }

  function formatTime(s: number) { if (!isFinite(s) || isNaN(s)) return '-:--'; return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}` }
  function timerProgress(t: Timer) { return ((t.duurSeconden - t.resterendSeconden) / t.duurSeconden) * 100 }

  if (!recipe) return (
    <div style={{ minHeight: '100vh', background: 'var(--kms-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, paddingBottom: 80 }}>
      <div style={{ fontSize: 64 }}>🍳</div>
      <p style={{ color: '#666', fontSize: 16 }}>Geen actief recept.</p>
      <button className="btn-primary" style={{ width: 'auto', padding: '12px 24px' }} onClick={() => router.push('/vandaag')}>← Naar Vandaag</button>
      <NavBar />
    </div>
  )

  const step = recipe.stappen[currentStep]
  const progress = ((currentStep) / recipe.stappen.length) * 100

  return (
    <div style={{ minHeight: '100vh', background: 'var(--kms-cream)', paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #2D6A4F, #52B788)', padding: '20px 16px 16px', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>🍳 {recipe.naam}</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setVoiceModalOpen(true)} title="Stem instellen"
              style={{ background: 'rgba(255,255,255,0.25)', color: 'white', border: 'none', borderRadius: 20, padding: '6px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              🔊
            </button>
            <button onClick={() => setPanicOpen(true)}
              style={{ background: 'var(--kms-red)', color: 'white', border: 'none', borderRadius: 20, padding: '6px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              🆘 Paniek!
            </button>
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.3)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: 'white', transition: 'width 0.3s', borderRadius: 4 }} />
        </div>
        <p style={{ fontSize: 12, opacity: 0.85, margin: '4px 0 0' }}>Stap {currentStep + 1} van {recipe.stappen.length}</p>
      </div>

      {/* Active Timers */}
      {timers.length > 0 && (
        <div style={{ padding: '12px 16px', background: '#FFF8F0', borderBottom: '1px solid #FFE4CC' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#888', marginBottom: 8 }}>⏱️ ACTIEVE TIMERS</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {timers.map((t, i) => (
              <div key={t.id} onClick={() => t.voltooid && dismissTimer(t.id)}
                style={{ position: 'relative', background: t.voltooid ? '#E8F5E9' : 'white', borderRadius: 12, padding: '10px 12px', minWidth: 100, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', cursor: t.voltooid ? 'pointer' : 'default', border: `2px solid ${t.resterendSeconden <= 30 && !t.voltooid ? 'var(--kms-red)' : TIMER_COLORS[i % TIMER_COLORS.length]}` }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${TIMER_COLORS[i%TIMER_COLORS.length]}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px', fontSize: 11, fontWeight: 700, color: t.voltooid ? '#2D6A4F' : TIMER_COLORS[i%TIMER_COLORS.length] }}>
                  {t.voltooid ? '✓' : formatTime(t.resterendSeconden)}
                </div>
                <p style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#444', margin: 0 }}>{t.componentNaam}</p>
                {t.voltooid && <p style={{ textAlign: 'center', fontSize: 10, color: '#2D6A4F', margin: '2px 0 0' }}>tik om weg</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step */}
      <div style={{ padding: '16px' }}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <span style={{ background: 'var(--kms-orange)', color: 'white', borderRadius: 20, padding: '4px 12px', fontWeight: 700, fontSize: 13 }}>Stap {step.stap_nummer}</span>
            {step.techniek_uitleg && (
              <button onClick={() => loadTechnique(step.techniek_uitleg!)}
                style={{ background: '#F0F4FF', color: '#4361EE', border: 'none', borderRadius: 20, padding: '4px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                ? Uitleg
              </button>
            )}
          </div>
          <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--kms-dark)', lineHeight: 1.5, marginBottom: 12 }}>{step.instructie}</p>

          {/* Stap 1: toon de volledige ingrediëntenlijst als checklist */}
          {currentStep === 0 && recipe.ingredienten?.length > 0 ? (
            <div style={{ marginTop: 4 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ingrediëntenlijst</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                {recipe.ingredienten.map((ing) => (
                  <div key={ing.naam} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 8, background: ing.is_substituut ? '#FFF3E0' : '#F8F8F8' }}>
                    <span style={{ fontSize: 14 }}>{ing.is_substituut ? '↩' : '🥘'}</span>
                    <span style={{ fontSize: 13, color: 'var(--kms-dark)', fontWeight: 500 }}>
                      {ing.hoeveelheid > 0 ? <strong>{ing.hoeveelheid} {ing.eenheid}</strong> : null} {ing.naam}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : step.ingredienten_deze_stap?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {step.ingredienten_deze_stap.map(ing => (
                <span key={ing} className="chip" style={{ fontSize: 12, background: '#FFF3EE' }}>🥘 {ing}</span>
              ))}
            </div>
          )}
          {step.heeft_timer && step.timer && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#FFF3EE', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>⏱️</span>
              <div>
                <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: 'var(--kms-orange)' }}>{step.timer.component_naam}</p>
                <p style={{ fontSize: 13, color: '#666', margin: 0 }}>{formatTime(step.timer.duur_seconden)} — start automatisch bij "Klaar"</p>
              </div>
            </div>
          )}
        </div>

        {step.proactieve_tip && (
          <div style={{ background: 'linear-gradient(135deg, #E8F5E9, #F1F8E9)', borderRadius: 12, padding: '12px 16px', marginBottom: 16, borderLeft: '4px solid #2D6A4F' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#2D6A4F', margin: '0 0 4px' }}>💡 TIP</p>
            <p style={{ fontSize: 14, color: '#1B4332', margin: 0 }}>{step.proactieve_tip.tekst}</p>
          </div>
        )}

        <button className="btn-primary" onClick={handleKlaar} style={{ fontSize: 18, padding: '16px', marginBottom: 12 }}>
          {currentStep < recipe.stappen.length - 1 ? '✅ Klaar! Volgende stap →' : '🎉 Klaar! Beoordeel gerecht'}
        </button>

        <div style={{ display: 'flex', gap: 10 }}>
          {currentStep > 0 && <button className="btn-secondary" style={{ flex: 1 }} onClick={() => goToStep(currentStep - 1)}>← Vorige</button>}
          <button style={{ flex: 1, padding: '12px', borderRadius: 12, background: '#F3F3F3', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#666' }}
            onClick={() => speak(step.instructie)}>
            🔊 Herhaal
          </button>
        </div>
      </div>

      {/* Panic Modal */}
      {panicOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'flex-end', padding: 0 }}>
          <div style={{ background: 'white', width: '100%', borderRadius: '20px 20px 0 0', padding: '24px 20px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontWeight: 800, fontSize: 20, color: 'var(--kms-red)', margin: 0 }}>🆘 Paniekknop</h2>
              <button onClick={() => { setPanicOpen(false); setPanicAdvice(''); setPanicText('') }}
                style={{ background: '#F3F3F3', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            {!panicAdvice ? (
              <>
                <p style={{ color: '#666', marginBottom: 12 }}>Wat gaat er mis? Beschrijf het probleem:</p>
                <textarea value={panicText} onChange={e => setPanicText(e.target.value)} rows={3}
                  placeholder="bijv. 'Mijn saus is te zout en te dik geworden'"
                  style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid #E0E0E0', fontSize: 15, resize: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
                <button className="btn-primary" onClick={handlePanic} disabled={panicLoading || !panicText.trim()}>
                  {panicLoading ? '⏳ Redding halen...' : '🚨 Help me!'}
                </button>
              </>
            ) : (
              <>
                <div style={{ background: '#FFF3EE', borderRadius: 12, padding: '16px', marginBottom: 16, borderLeft: '4px solid var(--kms-orange)' }}>
                  <p style={{ fontSize: 16, color: 'var(--kms-dark)', lineHeight: 1.6, margin: 0 }}>{panicAdvice}</p>
                </div>
                <button className="btn-primary" onClick={() => { setPanicOpen(false); setPanicAdvice(''); setPanicText('') }}>
                  👍 Bedankt, ik ga verder
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Technique Modal */}
      {techniqueModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: 20, padding: '24px', maxWidth: 400, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontWeight: 800, fontSize: 18, color: 'var(--kms-dark)', margin: 0 }}>📚 {techniqueModal.term}</h3>
              <button onClick={() => setTechniqueModal(null)}
                style={{ background: '#F3F3F3', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            {techniqueLoading ? <p style={{ color: '#888', textAlign: 'center' }}>⏳ Uitleg laden...</p>
              : <p style={{ fontSize: 15, color: '#444', lineHeight: 1.6, margin: 0 }}>{techniqueModal.text}</p>}
            <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => setTechniqueModal(null)}>Begrepen!</button>
          </div>
        </div>
      )}

      {/* Rating Modal */}
      {ratingOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: 'white', width: '100%', borderRadius: '20px 20px 0 0', padding: '24px 20px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontWeight: 800, fontSize: 22, color: 'var(--kms-dark)', textAlign: 'center', marginBottom: 4 }}>🎉 Gelukt!</h2>
            <p style={{ textAlign: 'center', color: '#888', marginBottom: 20 }}>Hoe was de {recipe.naam}?</p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => setRating(n)}
                  style={{ fontSize: 36, background: 'none', border: 'none', cursor: 'pointer', transition: 'transform 0.1s', transform: rating >= n ? 'scale(1.2)' : 'scale(1)' }}>
                  {rating >= n ? '⭐' : '☆'}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
              {['😍','😊','😐','😕','😤'].map(e => (
                <button key={e} onClick={() => setRatingEmoji(ratingEmoji === e ? '' : e)}
                  style={{ fontSize: 32, background: ratingEmoji === e ? '#FFF3EE' : 'none', border: ratingEmoji === e ? '2px solid var(--kms-orange)' : '2px solid transparent', borderRadius: 12, padding: '4px 8px', cursor: 'pointer' }}>
                  {e}
                </button>
              ))}
            </div>

            {/* Photo upload */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontWeight: 600, marginBottom: 8, color: 'var(--kms-dark)' }}>📷 Foto van je gerecht</p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F8F8F8', border: '1.5px dashed #CCC', borderRadius: 12, padding: '12px 16px', cursor: 'pointer' }}>
                <span style={{ fontSize: 24 }}>📸</span>
                <span style={{ color: '#666', fontSize: 14 }}>{photo ? photo.name : 'Tik om foto toe te voegen'}</span>
                <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} style={{ display: 'none' }} />
              </label>
              {photoPreview && (
                <img src={photoPreview} alt="Foto preview" style={{ width: '100%', borderRadius: 12, marginTop: 8, maxHeight: 200, objectFit: 'cover' }} />
              )}
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontWeight: 600, marginBottom: 8, color: 'var(--kms-dark)' }}>📝 Notities (optioneel)</p>
              <textarea value={ratingNote} onChange={e => setRatingNote(e.target.value)} rows={3}
                placeholder="Tips, aanpassingen, of gewoon wat je ervan vond..."
                style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid #E0E0E0', fontSize: 15, resize: 'none', boxSizing: 'border-box' }} />
            </div>

            {saveError && (
              <div style={{ background: '#FFF0F0', border: '1px solid #FFAAAA', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#C00', fontSize: 14 }}>
                {saveError}
              </div>
            )}

            <button className="btn-primary" onClick={saveEntry} disabled={saving}>
              {saving ? '⏳ Opslaan...' : '✅ Sla kookprestatie op'}
            </button>
          </div>
        </div>
      )}

      {/* Badge celebration */}
      {savedBadges.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 24, padding: '32px 24px', maxWidth: 360, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 8 }}>🏆</div>
            <h2 style={{ fontWeight: 800, fontSize: 22, color: 'var(--kms-dark)', marginBottom: 8 }}>
              {leveledUp ? '🎉 Level up!' : 'Nieuwe badge(s)!'}
            </h2>
            {leveledUp && <p style={{ color: 'var(--kms-orange)', fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Je bent een level gestegen!</p>}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
              {savedBadges.map(b => (
                <div key={b.name} style={{ background: '#FFF3EE', borderRadius: 12, padding: '8px 16px', border: '2px solid var(--kms-orange)' }}>
                  <span style={{ fontSize: 28 }}>{b.emoji}</span>
                  <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--kms-dark)', margin: '4px 0 0' }}>{b.name}</p>
                </div>
              ))}
            </div>
            <button className="btn-primary" onClick={() => router.push('/dagboek')}>
              Naar mijn dagboek →
            </button>
          </div>
        </div>
      )}

      {/* Level up (without new badges) */}
      {leveledUp && savedBadges.length === 0 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 24, padding: '32px 24px', maxWidth: 360, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 8 }}>⬆️</div>
            <h2 style={{ fontWeight: 800, fontSize: 22, color: 'var(--kms-dark)', marginBottom: 8 }}>Level up!</h2>
            <p style={{ color: '#666', marginBottom: 24 }}>Je kookvaardigheden groeien. Ga zo door!</p>
            <button className="btn-primary" onClick={() => router.push('/dagboek')}>
              Naar mijn dagboek →
            </button>
          </div>
        </div>
      )}

      {/* Timer Waarschuwing Modal */}
      {timerWarningOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 20, padding: '28px 24px', maxWidth: 360, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⏱️</div>
            <h2 style={{ fontWeight: 800, fontSize: 19, color: 'var(--kms-dark)', marginBottom: 10 }}>Timer loopt nog!</h2>
            <p style={{ color: '#666', fontSize: 15, lineHeight: 1.5, marginBottom: 24 }}>
              Het gerecht is waarschijnlijk nog niet klaar. Weet je zeker dat je nu al wilt doorgaan naar de beoordeling?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => setTimerWarningOpen(false)} className="btn-primary">
                ← Wacht op de timer
              </button>
              <button onClick={handleTochDoorgaan}
                style={{ padding: '14px', border: '2px solid #CCC', borderRadius: 12, background: 'white', color: '#888', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
                Doorgaan zonder timer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Voice Modal */}
      {voiceModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: 'white', width: '100%', borderRadius: '20px 20px 0 0', padding: '24px 20px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h2 style={{ fontWeight: 800, fontSize: 18, color: 'var(--kms-dark)', marginBottom: 4 }}>🔊 Stem instellen</h2>
            <p style={{ color: '#888', fontSize: 14, marginBottom: 16 }}>Kies een stem voor de gesproken instructies.</p>
            {availableVoices.filter(v => v.lang.startsWith('nl')).length === 0 && (
              <div style={{ background: '#FFF8E1', border: '1px solid #FFD54F', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                <p style={{ fontSize: 13, color: '#795548', margin: 0, fontWeight: 600 }}>⚠️ Geen Nederlandse stem gevonden</p>
                <p style={{ fontSize: 12, color: '#795548', margin: '4px 0 0' }}>Ga naar Instellingen → Toegankelijkheid → Tekst naar spraak en download een Nederlandse stem (bijv. Google NL).</p>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              <button
                onClick={() => { localStorage.removeItem('kms-preferred-voice'); setSelectedVoiceName(''); setVoiceModalOpen(false); }}
                style={{ padding: '12px 16px', borderRadius: 10, border: selectedVoiceName === '' ? '2px solid var(--kms-orange)' : '1.5px solid #E0E0E0', background: selectedVoiceName === '' ? '#FFF3EE' : 'white', fontWeight: 600, fontSize: 14, cursor: 'pointer', textAlign: 'left' }}>
                🤖 Automatisch (aanbevolen)
              </button>
              {availableVoices.map(v => (
                <button key={v.name}
                  onClick={() => { localStorage.setItem('kms-preferred-voice', v.name); setSelectedVoiceName(v.name); setVoiceModalOpen(false); }}
                  style={{ padding: '12px 16px', borderRadius: 10, border: selectedVoiceName === v.name ? '2px solid var(--kms-orange)' : '1.5px solid #E0E0E0', background: selectedVoiceName === v.name ? '#FFF3EE' : 'white', fontWeight: 600, fontSize: 14, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{v.name}</span>
                  <span style={{ fontSize: 12, color: v.lang.startsWith('nl') ? '#2D6A4F' : '#999', fontWeight: v.lang.startsWith('nl') ? 700 : 400 }}>{v.lang.startsWith('nl') ? '🇳🇱 NL' : v.lang}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setVoiceModalOpen(false)} style={{ width: '100%', padding: '14px', border: 'none', background: '#F5F5F5', borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer', color: '#555' }}>
              Sluiten
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
