'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import NavBar from '@/components/NavBar'
import { useRouter } from 'next/navigation'
import type { Recipe, RecipeStep, Timer } from '@/types'
import { speak, stopSpeaking, getAvailableVoices, TTS_STORAGE_KEY } from '@/lib/tts'

const TIMER_COLORS = ['#FF6B35','#2D6A4F','#E63946','#4361EE','#7209B7','#F72585']

// Speelt een set piepjes via Web Audio API
function playBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx()
    const schedule = (freq: number, startAt: number, dur: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.4, ctx.currentTime + startAt)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + dur)
      osc.start(ctx.currentTime + startAt)
      osc.stop(ctx.currentTime + startAt + dur)
    }
    schedule(880,  0.00, 0.20)
    schedule(880,  0.28, 0.20)
    schedule(1100, 0.56, 0.35)
  } catch { /* AudioContext niet beschikbaar */ }
}

const SESSION_KEY = 'kms-cook-session'

interface CookSession {
  recipe: unknown
  currentStep: number
  timers: { id: string; componentNaam: string; resterendSeconden: number; duurSeconden: number; type: string; savedAt: number }[]
}

function saveSession(recipe: unknown, step: number, timers: { id: string; componentNaam: string; resterendSeconden: number; duurSeconden: number; type: string }[]) {
  try {
    const session: CookSession = {
      recipe,
      currentStep: step,
      timers: timers.map(t => ({ ...t, savedAt: Date.now() })),
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch { /* stil */ }
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY) } catch { /* stil */ }
}

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
  const [shareToast, setShareToast] = useState('')
  const [voiceToast, setVoiceToast] = useState('')
  const [leveledUp, setLeveledUp] = useState(false)
  const [voiceActive, setVoiceActive] = useState(false)
  const [cookingStarted, setCookingStarted] = useState(false)
  const [usedPanic, setUsedPanic] = useState(false)
  const [startTime] = useState(Date.now())
  const [voiceModalOpen, setVoiceModalOpen] = useState(false)
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>('')

  const [waitingForLastStepTimer, setWaitingForLastStepTimer] = useState(false)
  const [confirmLastStepOpen, setConfirmLastStepOpen] = useState(false)
  const lastStepTimerIdRef = useRef<string | null>(null)

  // Alarm-beheer: welke timers piepen nu actief
  const [alarmingTimers, setAlarmingTimers] = useState<Set<string>>(new Set())
  // Minuten per timer die de gebruiker kiest bij 'verlengen'
  const [extendMinutesMap, setExtendMinutesMap] = useState<Map<string, number>>(new Map())
  const alarmIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const sessionSaveTickRef = useRef(0)
  const recipeRef = useRef<unknown>(null)
  const currentStepRef = useRef(0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const panicOpenRef = useRef(false)

  // Sync panicOpenRef zodat voice recognition er gebruik van kan maken
  useEffect(() => { panicOpenRef.current = panicOpen }, [panicOpen])

  // startAlarm via ref zodat de timer-tick-closure altijd de laatste versie gebruikt
  const startAlarmRef = useRef<(id: string) => void>(() => {})

  const startAlarm = useCallback((id: string) => {
    playBeep()
    setAlarmingTimers(prev => new Set([...prev, id]))
    let count = 0
    const interval = setInterval(() => {
      count++
      if (count >= 7) {
        clearInterval(interval)
        alarmIntervalsRef.current.delete(id)
        setAlarmingTimers(prev => { const s = new Set(prev); s.delete(id); return s })
        return
      }
      playBeep()
    }, 1400)
    alarmIntervalsRef.current.set(id, interval)
  }, [])

  useEffect(() => { startAlarmRef.current = startAlarm }, [startAlarm])

  function stopAlarm(id: string) {
    const iv = alarmIntervalsRef.current.get(id)
    if (iv) clearInterval(iv)
    alarmIntervalsRef.current.delete(id)
    setAlarmingTimers(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  function dismissAlarm(id: string) {
    stopAlarm(id)
    setTimers(prev => prev.filter(t => t.id !== id))
    if (id === lastStepTimerIdRef.current) {
      lastStepTimerIdRef.current = null
      clearSession()
      setTimeout(() => setRatingOpen(true), 300)
    }
  }

  function getExtendMinutes(id: string) {
    return extendMinutesMap.get(id) ?? 5
  }

  function setExtendMinutes(id: string, delta: number) {
    setExtendMinutesMap(prev => {
      const next = new Map(prev)
      const current = next.get(id) ?? 5
      const updated = Math.max(1, Math.min(60, current + delta))
      next.set(id, updated)
      return next
    })
  }

  function extendAlarm(id: string) {
    const minutes = getExtendMinutes(id)
    const extraSec = minutes * 60
    stopAlarm(id)
    setTimers(prev => prev.map(t => {
      if (t.id !== id) return t
      return { ...t, voltooid: false, actief: true, resterendSeconden: extraSec, duurSeconden: t.duurSeconden + extraSec }
    }))
    if (id === lastStepTimerIdRef.current) {
      setWaitingForLastStepTimer(true)
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem('kms-active-recipe')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        const ingredientStep: RecipeStep = {
          stap_nummer: 1,
          instructie: `Verzamel alle ingredienten voor ${parsed.naam}.`,
          ingredienten_deze_stap: (parsed.ingredienten || []).map((i: { naam: string; hoeveelheid: number; eenheid: string }) =>
            `${i.hoeveelheid > 0 ? `${i.hoeveelheid} ${i.eenheid} ` : ''}${i.naam}`
          ),
          heeft_timer: false,
          timer: undefined,
          techniek_uitleg: null,
          proactieve_tip: { type: 'techniek', tekst: 'Leg alles klaar voordat je begint.' },
        }
        const hergenummerd = (parsed.stappen || []).map((s: RecipeStep, idx: number) => ({
          ...s,
          stap_nummer: idx + 2,
        }))
        const recipeMetVerzamel = { ...parsed, stappen: [ingredientStep, ...hergenummerd] }
        setRecipe(recipeMetVerzamel)
        recipeRef.current = recipeMetVerzamel
        // Spreken gebeurt wanneer de gebruiker 'Aan de slag!' klikt
      } catch {}
    }
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

  // Wake Lock: houd scherm wakker tijdens koken
  useEffect(() => {
    async function requestWakeLock() {
      if (!('wakeLock' in navigator)) return
      try {
        wakeLockRef.current = await (navigator as unknown as { wakeLock: { request: (t: string) => Promise<WakeLockSentinel> } }).wakeLock.request('screen')
      } catch { /* Wake Lock niet beschikbaar */ }
    }
    requestWakeLock()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') requestWakeLock()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      wakeLockRef.current?.release().catch(() => {})
    }
  }, [])

  // Sessie herstellen bij terugkeren na afsluiten
  useEffect(() => {
    if (!recipe) return // Wacht tot recept geladen is
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return
    try {
      const session: CookSession = JSON.parse(raw)
      // Controleer of de sessie bij het huidige recept hoort
      const sessionRecipe = session.recipe as { naam?: string } | null
      if (!sessionRecipe || sessionRecipe.naam !== recipe.naam) {
        clearSession()
        return
      }
      setCookingStarted(true)
      const now = Date.now()
      // Herstel stap
      if (session.currentStep > 0) {
        currentStepRef.current = session.currentStep
        setCurrentStep(session.currentStep)
      }
      // Herstel timers met elapsed time verrekend
      if (session.timers && session.timers.length > 0) {
        const restored = session.timers.map(t => {
          const elapsed = Math.floor((now - t.savedAt) / 1000)
          const resterend = t.resterendSeconden - elapsed
          return {
            id: t.id,
            componentNaam: t.componentNaam,
            duurSeconden: t.duurSeconden,
            resterendSeconden: Math.max(0, resterend),
            type: t.type as Timer['type'],
            actief: resterend > 0,
            voltooid: resterend <= 0,
          }
        })
        setTimers(restored)
        // Timers die afliepen terwijl app dicht was → meteen alarm
        restored.filter(t => t.voltooid).forEach(t => {
          setTimeout(() => startAlarmRef.current(t.id), 500)
        })
      }
    } catch { /* stil */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe])

  // Houd recipeRef actueel
  useEffect(() => { recipeRef.current = recipe }, [recipe])

  // Timer tick
  useEffect(() => {
    timerIntervalRef.current = setInterval(() => {
      setTimers(prev => {
        let completedId: string | null = null
        const updated = prev.map(t => {
          if (!t.actief || t.voltooid) return t
          const remaining = t.resterendSeconden - 1
          if (remaining <= 0) {
            speak(`De ${t.componentNaam} is klaar!`)
            completedId = t.id
            return { ...t, resterendSeconden: 0, voltooid: true, actief: false }
          }
          return { ...t, resterendSeconden: remaining }
        })
        if (completedId) startAlarmRef.current(completedId)
        // Sessie elke 5 seconden opslaan
        sessionSaveTickRef.current += 1
        if (sessionSaveTickRef.current % 5 === 0) {
          saveSession(recipeRef.current, currentStepRef.current, updated.filter(t => t.actief && !t.voltooid))
        }
        return updated
      })
    }, 1000)
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current) }
  }, [])

  useEffect(() => {
    if (!waitingForLastStepTimer || !lastStepTimerIdRef.current) return
    const lastTimer = timers.find(t => t.id === lastStepTimerIdRef.current)
    if (lastTimer?.voltooid) {
      setWaitingForLastStepTimer(false)
    }
  }, [timers, waitingForLastStepTimer])

  function startTimer(step: RecipeStep): string | null {
    if (!step.heeft_timer || !step.timer) return null
    const id = `${Date.now()}`
    const newTimer: Timer = {
      id,
      componentNaam: step.timer.component_naam,
      duurSeconden: step.timer.duur_seconden,
      resterendSeconden: step.timer.duur_seconden,
      type: step.timer.type as Timer['type'],
      actief: true, voltooid: false,
    }
    setTimers(prev => [...prev.slice(-5), newTimer])
    return id
  }

  function dismissTimer(id: string) { setTimers(prev => prev.filter(t => t.id !== id)) }

  function adjustTimer(id: string, deltaSecs: number) {
    setTimers(prev => prev.map(t => {
      if (t.id !== id || t.voltooid || !t.actief) return t
      const newRemaining = Math.max(5, t.resterendSeconden + deltaSecs)
      const newDuur = Math.max(5, t.duurSeconden + deltaSecs)
      return { ...t, resterendSeconden: newRemaining, duurSeconden: newDuur }
    }))
  }

  function stopTimer(id: string) {
    stopAlarm(id)
    setTimers(prev => prev.map(t => {
      if (t.id !== id) return t
      return { ...t, actief: false, voltooid: true, resterendSeconden: 0 }
    }))
    if (id === lastStepTimerIdRef.current) {
      setWaitingForLastStepTimer(false)
      lastStepTimerIdRef.current = null
      setTimeout(() => setRatingOpen(true), 300)
    }
  }

  function goToStep(idx: number) {
    if (!recipe) return
    currentStepRef.current = idx
    setCurrentStep(idx)
    const step = recipe.stappen[idx]
    speak(`Stap ${step.stap_nummer}: ${step.instructie}`)
  }

  async function awardBadge(badgeId: string) {
    try {
      const res = await fetch('/api/gamification/award', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ badgeId }),
      })
      const data = await res.json()
      if (data.newBadge) setSavedBadges(prev => [...prev, data.newBadge])
    } catch { /* stil */ }
  }

  function shareIngredients() {
    if (!recipe) return
    const lines = (recipe.ingredienten || []).map((i: {hoeveelheid: number; eenheid: string; naam: string}) =>
      `${i.hoeveelheid > 0 ? `${i.hoeveelheid} ${i.eenheid} ` : ''}${i.naam}`
    )
    const text = `🛒 Boodschappenlijst voor ${recipe.naam}\n\n${lines.map(l => `• ${l}`).join('\n')}`
    if (navigator.share) {
      navigator.share({ title: `Boodschappenlijst: ${recipe.naam}`, text })
    } else {
      navigator.clipboard.writeText(text)
      setShareToast('📋 Gekopieerd!')
      setTimeout(() => setShareToast(''), 2500)
    }
    awardBadge('sociaal_kok')
  }

  function shareRecipe() {
    if (!recipe) return
    const stappen = (recipe.stappen || []).map((s: {stap_nummer: number; instructie: string}) =>
      `Stap ${s.stap_nummer}: ${s.instructie}`
    )
    const ingredienten = (recipe.ingredienten || []).map((i: {hoeveelheid: number; eenheid: string; naam: string}) =>
      `• ${i.hoeveelheid > 0 ? `${i.hoeveelheid} ${i.eenheid} ` : ''}${i.naam}`
    )
    const text = `👨‍🍳 ${recipe.naam}\n\n🛒 Ingrediënten:\n${ingredienten.join('\n')}\n\n📋 Bereiding:\n${stappen.join('\n')}`
    if (navigator.share) {
      navigator.share({ title: recipe.naam, text })
    } else {
      navigator.clipboard.writeText(text)
      setShareToast('📋 Recept gekopieerd!')
      setTimeout(() => setShareToast(''), 2500)
    }
    awardBadge('recept_deler')
  }

  function handleKlaar() {
    if (!recipe) return
    const step = recipe.stappen[currentStep]
    const isLastStep = currentStep >= recipe.stappen.length - 1

    if (step.heeft_timer) {
      const timerId = startTimer(step)
      if (isLastStep && timerId) {
        lastStepTimerIdRef.current = timerId
        setWaitingForLastStepTimer(true)
        return
      }
    }

    if (isLastStep) {
      const activeTimers = timers.filter(t => t.actief && !t.voltooid)
      if (activeTimers.length > 0 || alarmingTimers.size > 0) {
        setConfirmLastStepOpen(true)
        return
      }
      setRatingOpen(true)
    } else {
      goToStep(currentStep + 1)
    }
  }

  function handleFinishNow() {
    setWaitingForLastStepTimer(false)
    lastStepTimerIdRef.current = null
    clearSession()
    setRatingOpen(true)
  }

  function confirmFinishLastStep() {
    // Stop alle lopende timers en wekkers
    alarmIntervalsRef.current.forEach((iv) => clearInterval(iv))
    alarmIntervalsRef.current.clear()
    setAlarmingTimers(new Set())
    setTimers([])
    setWaitingForLastStepTimer(false)
    lastStepTimerIdRef.current = null
    setConfirmLastStepOpen(false)
    clearSession()
    setRatingOpen(true)
  }

  function startVoiceRecognition() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { setVoiceToast('Spraak niet ondersteund op dit apparaat'); setTimeout(() => setVoiceToast(''), 3000); return }
    const recognition = new SR()
    recognition.lang = 'nl-NL'
    recognition.continuous = true
    recognition.interimResults = false
    recognition.onresult = (event: { results: { [key: number]: { [key: number]: { transcript: string } }; length: number } }) => {
      const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim()
      // Als paniekkel open is: gebruik stem als dictaat voor het tekstveld
      if (panicOpenRef.current) {
        setPanicText(prev => prev ? prev + ' ' + transcript : transcript)
        setVoiceToast(`🎤 "${transcript}"`)
        setTimeout(() => setVoiceToast(''), 2000)
        return
      }
      setVoiceToast(`🎤 "${transcript}"`)
      setTimeout(() => setVoiceToast(''), 2000)
      const recipe = recipeRef.current as { stappen: unknown[]; naam: string } | null
      const step = currentStepRef.current
      const totalSteps = recipe?.stappen?.length ?? 0

      if (transcript.includes('volgende') || transcript.includes('verder')) {
        if (step < totalSteps - 1) goToStep(step + 1)
      } else if (transcript.includes('vorige') || transcript.includes('terug')) {
        if (step > 0) goToStep(step - 1)
      } else if (transcript.includes('herhaal') || transcript.includes('opnieuw') || transcript.includes('nogmaals')) {
        const currentRecipe = recipeRef.current as { stappen: { instructie: string; stap_nummer: number }[] } | null
        if (currentRecipe) speak(currentRecipe.stappen[step].instructie)
      } else if (transcript.includes('klaar') || transcript.includes('voltooid') || transcript.includes('gedaan')) {
        handleKlaar()
      } else if (transcript.includes('stop') || transcript.includes('uit') || transcript.includes('microf')) {
        stopVoiceRecognition()
      } else if (transcript.includes('paniek') || transcript.includes('help')) {
        setPanicOpen(true)
      }
    }
    recognition.onerror = () => { setVoiceActive(false); recognitionRef.current = null }
    recognition.onend = () => {
      // Herstart automatisch als nog actief
      if (recognitionRef.current) recognition.start()
    }
    recognition.start()
    recognitionRef.current = recognition
    setVoiceActive(true)
  }

  function stopVoiceRecognition() {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setVoiceActive(false)
  }

  function toggleVoice() {
    if (voiceActive) stopVoiceRecognition()
    else startVoiceRecognition()
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
      } catch { /* upload mislukt */ }
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
        localStorage.removeItem('kms-active-recipe')
        if (!data.newBadges?.length && !data.leveledUp) router.push('/dagboek')
      } else {
        setSaveError(res.status === 401
          ? 'Je bent niet ingelogd. Log in om je kookprestaties op te slaan.'
          : (data.error || 'Opslaan mislukt. Probeer opnieuw.'))
      }
    } catch {
      setSaving(false)
      setSaveError('Verbindingsfout. Controleer je internetverbinding en probeer opnieuw.')
    }
  }

  function formatTime(s: number) { return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}` }
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
  const isLastStep = currentStep >= recipe.stappen.length - 1
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
        <p style={{ fontSize: 12, opacity: 0.85, margin: '4px 0 0' }}>{cookingStarted ? `Stap ${currentStep + 1} van ${recipe.stappen.length}` : '🥗 Ingrediënten'}</p>
      </div>

      {/* Active Timers */}
      {timers.length > 0 && (
        <div style={{ padding: '12px 16px', background: '#FFF8F0', borderBottom: '1px solid #FFE4CC' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#888', marginBottom: 8 }}>⏱️ ACTIEVE TIMERS</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {timers.map((t, i) => {
              const color = TIMER_COLORS[i % TIMER_COLORS.length]
              const isExpiring = t.resterendSeconden <= 30 && !t.voltooid
              const isAlarming = alarmingTimers.has(t.id)
              return (
                <div key={t.id}
                  style={{ background: isAlarming ? '#FFF3CD' : t.voltooid ? '#E8F5E9' : 'white', borderRadius: 14, padding: '12px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', border: `2px solid ${isAlarming ? '#FFC107' : isExpiring ? 'var(--kms-red)' : color}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', border: `3px solid ${isAlarming ? '#FFC107' : color}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isAlarming ? 22 : 12, fontWeight: 800, color: isAlarming ? '#E65100' : t.voltooid ? '#2D6A4F' : color }}>
                      {isAlarming ? '🔔' : t.voltooid ? '✓' : formatTime(t.resterendSeconden)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: 13, color: '#333', margin: '0 0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.componentNaam}</p>
                      {!t.voltooid && (
                        <div style={{ background: '#F0F0F0', borderRadius: 4, height: 4 }}>
                          <div style={{ width: `${timerProgress(t)}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 1s linear' }} />
                        </div>
                      )}
                      {isAlarming && <p style={{ fontSize: 11, color: '#E65100', margin: 0, fontWeight: 700 }}>⏰ Klaar! Wat wil je doen?</p>}
                      {t.voltooid && !isAlarming && <p style={{ fontSize: 11, color: '#2D6A4F', margin: 0, fontWeight: 600 }}>Klaar! Tik om te sluiten</p>}
                    </div>
                    {isAlarming ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => dismissAlarm(t.id)}
                          style={{ background: '#2D6A4F', border: 'none', borderRadius: 10, padding: '8px 12px', fontWeight: 700, fontSize: 13, color: 'white', cursor: 'pointer' }}>
                          ✓ Klaar
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#FFF3EE', border: '1.5px solid var(--kms-orange)', borderRadius: 10, overflow: 'hidden' }}>
                          <button onClick={() => setExtendMinutes(t.id, -1)}
                            style={{ background: 'none', border: 'none', padding: '6px 8px', fontWeight: 800, fontSize: 15, color: 'var(--kms-orange)', cursor: 'pointer', lineHeight: 1 }}>−</button>
                          <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--kms-orange)', minWidth: 28, textAlign: 'center' }}>{getExtendMinutes(t.id)}m</span>
                          <button onClick={() => setExtendMinutes(t.id, 1)}
                            style={{ background: 'none', border: 'none', padding: '6px 8px', fontWeight: 800, fontSize: 15, color: 'var(--kms-orange)', cursor: 'pointer', lineHeight: 1 }}>+</button>
                        </div>
                        <button onClick={() => extendAlarm(t.id)}
                          style={{ background: '#FFF3EE', border: '1.5px solid var(--kms-orange)', borderRadius: 10, padding: '6px 10px', fontWeight: 700, fontSize: 12, color: 'var(--kms-orange)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          ⏱ Voeg toe
                        </button>
                      </div>
                    ) : !t.voltooid && t.actief ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                        <button onClick={() => adjustTimer(t.id, 60)}
                          style={{ background: '#E8F5E9', border: 'none', borderRadius: 8, padding: '4px 8px', fontWeight: 700, fontSize: 12, color: '#2D6A4F', cursor: 'pointer' }}>
                          +1 min
                        </button>
                        <button onClick={() => adjustTimer(t.id, -60)}
                          style={{ background: '#FFF3EE', border: 'none', borderRadius: 8, padding: '4px 8px', fontWeight: 700, fontSize: 12, color: 'var(--kms-orange)', cursor: 'pointer' }}>
                          -1 min
                        </button>
                        <button onClick={() => stopTimer(t.id)}
                          style={{ background: '#FFEBEE', border: 'none', borderRadius: 8, padding: '4px 8px', fontWeight: 700, fontSize: 12, color: 'var(--kms-red)', cursor: 'pointer' }}>
                          Stop
                        </button>
                      </div>
                    ) : t.voltooid ? (
                      <button onClick={() => dismissTimer(t.id)}
                        style={{ background: '#F3F3F3', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        ✕
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Wachten op laatste-stap-timer banner */}
      {waitingForLastStepTimer && (
        <div style={{ margin: '12px 16px 0', padding: '14px 16px', background: 'linear-gradient(135deg, #FFF8DC, #FFFBE6)', border: '2px solid #FFD700', borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontWeight: 700, fontSize: 15, color: '#7B6000', margin: 0 }}>⏳ Wekker loopt nog — wacht even...</p>
          <p style={{ fontSize: 13, color: '#9A7D0A', margin: 0 }}>Je gaat automatisch verder als de wekker klaar is, of als je hem stopt.</p>
          <button onClick={handleFinishNow}
            style={{ alignSelf: 'flex-start', background: '#7B6000', color: 'white', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            Toch nu doorgaan →
          </button>
        </div>
      )}

      {/* Ingrediënten-overzicht: scherm voor stap 1 */}
      {!cookingStarted && (
        <div style={{ padding: 16 }}>
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontWeight: 800, fontSize: 18, color: 'var(--kms-dark)', marginBottom: 4 }}>🥗 Ingrediënten</h2>
            <p style={{ fontSize: 13, color: '#888', margin: '0 0 14px' }}>Leg alles klaar voordat je begint.</p>
            {recipe.ingredienten?.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginBottom: 16 }}>
                {recipe.ingredienten.map((ing: {naam: string; hoeveelheid: number; eenheid: string; is_substituut?: boolean}) => (
                  <div key={ing.naam} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 8, background: ing.is_substituut ? '#FFF3E0' : '#F8F8F8' }}>
                    <span style={{ fontSize: 14 }}>{ing.is_substituut ? '↩' : '🥘'}</span>
                    <span style={{ fontSize: 13, color: 'var(--kms-dark)', fontWeight: 500 }}>
                      {ing.hoeveelheid > 0 ? <strong>{ing.hoeveelheid} {ing.eenheid}</strong> : null} {ing.naam}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginBottom: 0 }}>
              <button onClick={shareIngredients}
                style={{ flex: 1, padding: '10px', borderRadius: 10, background: '#E8F5E9', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#2D6A4F' }}>
                🛒 Deel boodschappenlijst
              </button>
              <button onClick={shareRecipe}
                style={{ flex: 1, padding: '10px', borderRadius: 10, background: '#F0F4FF', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#4361EE' }}>
                📖 Deel recept
              </button>
            </div>
          </div>
          <button className="btn-primary" onClick={() => { setCookingStarted(true); setTimeout(() => speak(recipe!.stappen[0].instructie), 400) }}
            style={{ fontSize: 18, padding: '16px', width: '100%' }}>
            👨‍🍳 Aan de slag! →
          </button>
        </div>
      )}

      {/* Step */}
      {cookingStarted && <div style={{ padding: '16px' }}>
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

          {currentStep === 0 && recipe.ingredienten?.length > 0 ? (
            <div style={{ marginTop: 4 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ingredientenlijst</p>
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

        {!waitingForLastStepTimer && (
          <button className="btn-primary" onClick={handleKlaar} style={{ fontSize: 18, padding: '16px', marginBottom: 12 }}>
            {isLastStep ? '🎉 Klaar! Beoordeel gerecht' : '✅ Klaar! Volgende stap →'}
          </button>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          {currentStep > 0 && <button className="btn-secondary" style={{ flex: 1 }} onClick={() => goToStep(currentStep - 1)}>← Vorige</button>}
          <button style={{ flex: 1, padding: '12px', borderRadius: 12, background: '#F3F3F3', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#666' }}
            onClick={() => speak(step.instructie)}>
            🔊 Herhaal
          </button>
          <button onClick={toggleVoice}
            style={{ padding: '12px 14px', borderRadius: 12, background: voiceActive ? '#E8F5E9' : '#F3F3F3', border: voiceActive ? '2px solid #2D6A4F' : '2px solid transparent', cursor: 'pointer', fontSize: 18, position: 'relative' }}
            title={voiceActive ? 'Spraak uitschakelen' : 'Spraakbediening inschakelen'}>
            {voiceActive ? '🎙️' : '🎤'}
            {voiceActive && <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, background: '#2D6A4F', borderRadius: '50%' }} />}
          </button>
        </div>
      </div>}

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
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <textarea value={panicText} onChange={e => setPanicText(e.target.value)} rows={3}
                    placeholder="bijv. Mijn saus is te zout en te dik geworden"
                    style={{ width: '100%', padding: '12px', paddingRight: 48, borderRadius: 10, border: '1.5px solid #E0E0E0', fontSize: 15, resize: 'none', boxSizing: 'border-box' }} />
                  <button
                    onClick={() => {
                      if (voiceActive) {
                        // Spraakbediening actief: gesproken tekst gaat al naar dit veld
                        setVoiceToast('🎤 Spreek je probleem in...')
                        setTimeout(() => setVoiceToast(''), 3000)
                        return
                      }
                      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
                      if (!SR) { setVoiceToast('Spraak niet ondersteund'); setTimeout(() => setVoiceToast(''), 2500); return }
                      const r = new SR(); r.lang = 'nl-NL'; r.interimResults = false; r.continuous = false
                      r.onresult = (e: any) => {
                        const t = e.results[0][0].transcript
                        setPanicText(prev => prev ? prev + ' ' + t : t)
                      }
                      r.onerror = () => { setVoiceToast('Kon niet luisteren, probeer opnieuw'); setTimeout(() => setVoiceToast(''), 2500) }
                      r.start()
                      setVoiceToast('🎤 Luisteren...')
                      setTimeout(() => setVoiceToast(''), 4000)
                    }}
                    title={voiceActive ? 'Spraak actief: spreek gewoon' : 'Spreek je probleem in'}
                    style={{ position: 'absolute', top: 8, right: 8, background: voiceActive ? '#E8F5E9' : '#F3F3F3', border: voiceActive ? '2px solid #2D6A4F' : 'none', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    🎤
                  </button>
                </div>
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
      {confirmLastStepOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'white', borderRadius: 20, padding: 28, maxWidth: 360, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <p style={{ fontSize: 22, textAlign: 'center', margin: '0 0 8px' }}>⏱️</p>
            <h2 style={{ fontWeight: 800, fontSize: 18, textAlign: 'center', margin: '0 0 12px', color: 'var(--kms-dark)' }}>Wekker loopt nog!</h2>
            <p style={{ fontSize: 14, color: '#555', textAlign: 'center', margin: '0 0 24px', lineHeight: 1.5 }}>
              Er {timers.filter(t => t.actief && !t.voltooid).length + alarmingTimers.size === 1 ? 'loopt nog een wekker' : `lopen nog ${timers.filter(t => t.actief && !t.voltooid).length + alarmingTimers.size} wekkers`}. Weet je zeker dat je klaar bent? De wekkers worden gestopt.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmLastStepOpen(false)}
                style={{ flex: 1, padding: '12px', borderRadius: 12, background: '#F3F3F3', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15, color: '#555' }}>
                Nee, wacht
              </button>
              <button onClick={confirmFinishLastStep}
                style={{ flex: 1, padding: '12px', borderRadius: 12, background: 'var(--kms-orange)', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15, color: 'white' }}>
                Ja, ik ben klaar
              </button>
            </div>
          </div>
        </div>
      )}

      {ratingOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: 'white', width: '100%', borderRadius: '20px 20px 0 0', padding: '24px 20px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <button onClick={() => { setRatingOpen(false); localStorage.removeItem('kms-active-recipe'); router.push('/vandaag') }}
                style={{ background: '#F3F3F3', border: 'none', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ✕
              </button>
            </div>
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
          <div style={{ background: 'white', borderRadius: 24, padding: '32px 24px', maxWidth: 360, width: '100%', textAlign: 'center', position: 'relative' }}>
            <button onClick={() => setSavedBadges([])}
              style={{ position: 'absolute', top: 16, right: 16, background: '#F3F3F3', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 18, lineHeight: '32px' }}>✕</button>
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
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setSavedBadges([])}>
                Later bekijken
              </button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={() => router.push('/dagboek')}>
                Naar dagboek →
              </button>
            </div>
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

      {shareToast && (
        <div style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: '#2D6A4F', color: 'white', padding: '12px 20px', borderRadius: 24, fontWeight: 700, fontSize: 14, zIndex: 300, whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
          {shareToast}
        </div>
      )}

      {voiceToast && (
        <div style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: '#1a1a2e', color: 'white', padding: '10px 18px', borderRadius: 24, fontWeight: 600, fontSize: 13, zIndex: 300, whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
          {voiceToast}
        </div>
      )}

      <NavBar />
    </div>
  )
}
