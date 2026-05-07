'use client'
import { useState, useEffect } from 'react'
import NavBar from '@/components/NavBar'
import { useRouter } from 'next/navigation'

const CUISINE_EMOJI: Record<string, string> = {
  'Italiaans': '🍝', 'Aziatisch': '🍜', 'Mexicaans': '🌮', 'Nederlands': '🧀',
  'Frans': '🥐', 'Indiaas': '🍛', 'Japans': '🍱', 'Grieks': '🫒',
  'Overig': '🍽️', 'Mediterraan': '🫐',
}

const MOOD_OPTIONS = ['Geen voorkeur', 'Lekker simpel', 'Iets nieuws proberen', 'Indruk maken', 'Comfortfood', 'Licht & gezond', 'Seizoensgerecht']
const TIME_OPTIONS = ['< 20 min', '20-45 min', '45-90 min', '> 90 min']
const CUISINE_OPTIONS = ['Geen voorkeur', 'Italiaans', 'Aziatisch', 'Mexicaans', 'Nederlands', 'Indiaas', 'Mediterraan', 'Japans']

interface Suggestion {
  naam: string; moeilijkheid: number; bereidingstijd: number
  waarom_dit_past: string; top_ingredienten: string[]
  avontuursscore: number; keuken_type: string; niveau_vereist: number
}

interface RecipeIngredient {
  naam: string; hoeveelheid: number; eenheid: string
  winkel_sectie: string; is_substituut: boolean
}

interface Recipe {
  naam: string; beschrijving: string; bereidingstijd: number
  moeilijkheid: number; porties: number; keuken_type: string
  ingredienten: RecipeIngredient[]
  stappen: unknown[]
  chef_tip: string
}

export default function VandaagPage() {
  const router = useRouter()
  const [step, setStep] = useState<'checkin' | 'suggestions' | 'loading-recipe' | 'ingredients' | 'loading-subs' | 'substitutes' | 'loading-adjusted'>('checkin')
  const [mood, setMood] = useState('')
  const [tijd, setTijd] = useState('')
  const [personen, setPersonen] = useState('2')
  const [keuken, setKeuken] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Suggestion | null>(null)
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [missingIngredients, setMissingIngredients] = useState<string[]>([])
  const [extraInput, setExtraInput] = useState('')
  const [substitutionOptions, setSubstitutionOptions] = useState<Record<string, string[]>>({})
  const [chosenSubstitutes, setChosenSubstitutes] = useState<Record<string, string>>({})
  const [alternativeDish, setAlternativeDish] = useState<{alternative_dish: string, reason: string} | null>(null)
  const [savedRecipeId, setSavedRecipeId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [extraIngredients, setExtraIngredients] = useState<string[]>([])
  const [error, setError] = useState('')
  const [myRecipes, setMyRecipes] = useState<{id: string; name: string; recipe: Recipe}[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const STORAGE_KEY = 'kms-saved-recipes'

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setMyRecipes(JSON.parse(raw))
    } catch { /* localStorage niet beschikbaar */ }
  }, [])

  const servings = Math.max(1, Math.min(20, parseInt(personen) || 2))

  async function fetchSuggestions() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/ai/suggest-recipes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_level: 1, available_time: tijd, cooking_for: personen, mood, cuisine_preference: keuken, recent_dishes: [], current_month: new Date().toLocaleString('nl-NL', { month: 'long' }) })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Fout bij suggesties ophalen'); return }
      setSuggestions(data.suggestions || [])
      setStep('suggestions')
    } catch { setError('Verbindingsfout. Probeer opnieuw.') }
    finally { setLoading(false) }
  }

  // Stap: suggestie kiezen → meteen volledig recept genereren → ingrediëntencheck tonen
  async function selectSuggestion(s: Suggestion) {
    setSelected(s)
    setMissingIngredients([])
    setExtraIngredients([])
    setRecipe(null)
    setError('')
    setSavedRecipeId(null)
    setSaveMessage('')
    setStep('loading-recipe')
    try {
      const res = await fetch('/api/ai/generate-recipe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dish_name: s.naam, servings, user_level: 1, missing_ingredients: [] })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Recept genereren mislukt'); setStep('suggestions'); return }
      setRecipe(data.recipe)
      setStep('ingredients')
    } catch { setError('Verbindingsfout.'); setStep('suggestions') }
  }

  // Stap: ingrediëntencheck → ophalen van substituutopties per ontbrekend ingredient
  async function fetchSubstitutions() {
    if (!selected || !recipe) return

    if (missingIngredients.length === 0 && extraIngredients.length === 0) {
      // Geen wijzigingen — direct koken
      sessionStorage.setItem('kms-active-recipe', JSON.stringify(recipe))
      router.push('/koken')
      return
    }

    if (missingIngredients.length === 0 && extraIngredients.length > 0) {
      // Alleen extra ingrediënten — recept aanpassen met extras
      setStep('loading-adjusted')
      setError('')
      try {
        const res = await fetch('/api/ai/generate-recipe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dish_name: selected.naam, servings, user_level: 1,
            missing_ingredients: [],
            extra_ingredients: extraIngredients,
          })
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error || 'Recept aanpassen mislukt'); setStep('ingredients'); return }
        sessionStorage.setItem('kms-active-recipe', JSON.stringify(data.recipe))
        router.push('/koken')
      } catch { setError('Verbindingsfout.'); setStep('ingredients') }
      return
    }

    setStep('loading-subs')
    setError('')
    try {
      const total = recipe.ingredienten.length
      const pct = Math.round((missingIngredients.length / total) * 100)
      const res = await fetch('/api/ai/substitutions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missing: missingIngredients, dish: selected.naam, missing_percentage: pct })
      })
      const data = await res.json()
      if (!res.ok) { setError('Kon geen alternatieven ophalen'); setStep('ingredients'); return }
      if (data.too_many_missing) {
        setAlternativeDish(data.suggestion)
        setSubstitutionOptions({})
      } else {
        setSubstitutionOptions(data.substitutions || {})
        setAlternativeDish(null)
        // Stel standaard de eerste optie voor elk ingredient in
        const defaults: Record<string, string> = {}
        for (const ing of missingIngredients) {
          const opts = data.substitutions?.[ing]
          defaults[ing] = opts?.length ? opts[0] : '__weglaten__'
        }
        setChosenSubstitutes(defaults)
      }
      setStep('substitutes')
    } catch { setError('Verbindingsfout.'); setStep('ingredients') }
  }

  // Stap: aan de slag met de gekozen substituten
  async function startCooking() {
    if (!selected) return
    setError('')
    setStep('loading-adjusted')
    try {
      const res = await fetch('/api/ai/generate-recipe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dish_name: selected.naam, servings, user_level: 1,
          missing_ingredients: missingIngredients,
          chosen_substitutes: chosenSubstitutes,
          extra_ingredients: extraIngredients,
        })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Recept aanpassen mislukt')
        setStep('substitutes')
        return
      }
      sessionStorage.setItem('kms-active-recipe', JSON.stringify(data.recipe))
      router.push('/koken')
    } catch (e) {
      console.error('startCooking fout:', e)
      setError('Verbindingsfout — probeer opnieuw.')
      setStep('substitutes')
    }
  }

  function loadSavedRecipe(entry: {id: string; name: string; recipe: Recipe}) {
    const syntheticSuggestion = {
      naam: entry.recipe.naam, moeilijkheid: entry.recipe.moeilijkheid,
      bereidingstijd: entry.recipe.bereidingstijd, waarom_dit_past: 'Eerder opgeslagen recept',
      top_ingredienten: entry.recipe.ingredienten.slice(0, 3).map(i => i.naam),
      avontuursscore: 3, keuken_type: entry.recipe.keuken_type, niveau_vereist: 1,
    }
    setSelected(syntheticSuggestion)
    setRecipe(entry.recipe)
    setMissingIngredients([])
    setExtraIngredients([])
    setError('')
    setSavedRecipeId(entry.id)
    setSaveMessage('')
    setStep('ingredients')
  }

  function handleSavedRecipeStart(entry: {id: string; name: string; recipe: Recipe}) {
    sessionStorage.setItem('kms-active-recipe', JSON.stringify(entry.recipe))
    router.push('/koken')
  }

  function saveToStorage(recipes: {id: string; name: string; recipe: Recipe}[]) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes)) } catch { /* stil */ }
  }

  function deleteSavedRecipe(id: string) {
    setDeletingId(id)
    const updated = myRecipes.filter(r => r.id !== id)
    setMyRecipes(updated)
    saveToStorage(updated)
    if (savedRecipeId === id) setSavedRecipeId(null)
    setDeletingId(null)
  }

  function toggleSaveRecipe() {
    if (!recipe) return
    setSaving(true)
    setSaveMessage('')

    if (savedRecipeId) {
      // Verwijder opgeslagen recept
      const updated = myRecipes.filter(r => r.id !== savedRecipeId)
      setMyRecipes(updated)
      saveToStorage(updated)
      setSavedRecipeId(null)
      setSaveMessage('🗑️ Recept verwijderd uit opgeslagen')
    } else {
      // Sla recept op
      const id = `recipe-${Date.now()}`
      const newEntry = { id, name: recipe.naam, recipe }
      // Vervang als naam al bestaat
      const existing = myRecipes.find(r => r.name === recipe.naam)
      const updated = existing
        ? myRecipes.map(r => r.name === recipe.naam ? { ...r, recipe } : r)
        : [newEntry, ...myRecipes]
      const finalId = existing ? existing.id : id
      setMyRecipes(updated)
      saveToStorage(updated)
      setSavedRecipeId(finalId)
      setSaveMessage('✅ Recept opgeslagen! Terug te vinden onder "Mijn recepten".')
    }

    setSaving(false)
  }

  function addExtra() {
    const val = extraInput.trim()
    if (val && !extraIngredients.includes(val)) {
      setExtraIngredients([...extraIngredients, val])
      setExtraInput('')
    }
  }

  function removeExtra(val: string) {
    setExtraIngredients(prev => prev.filter(i => i !== val))
  }

  function toggleMissing(naam: string) {
    setMissingIngredients(prev =>
      prev.includes(naam) ? prev.filter(i => i !== naam) : [...prev, naam]
    )
  }

  const stars = (n: number) => '⭐'.repeat(n) + '☆'.repeat(5 - n)

  // Ingrediënten gesorteerd: eerst ontbrekende, dan aanwezige
  const sortedIngredients = recipe
    ? [...recipe.ingredienten].sort((a, b) => {
        const aMissing = missingIngredients.includes(a.naam) ? 1 : 0
        const bMissing = missingIngredients.includes(b.naam) ? 1 : 0
        return aMissing - bMissing
      })
    : []

  return (
    <div style={{ minHeight: '100vh', background: 'var(--kms-cream)', paddingBottom: 80 }}>
      <div style={{ background: 'linear-gradient(135deg, #FF6B35, #FF9F5A)', padding: '24px 20px 20px', color: 'white' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>🌅 Vandaag</h1>
        <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: 15 }}>Wat gaan we koken?</p>
      </div>

      <div style={{ padding: '20px 16px' }}>

        {/* ── CHECK-IN ── */}
        {step === 'checkin' && (
          <>
            {/* Mijn opgeslagen recepten */}
            {myRecipes.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--kms-dark)', marginBottom: 12 }}>
                  🔖 Mijn recepten
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {myRecipes.map(entry => (
                    <div key={entry.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'white', borderRadius: 12, padding: '12px 14px',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.07)', border: '1.5px solid #F0F0F0',
                    }}>
                      <button onClick={() => loadSavedRecipe(entry)} style={{
                        flex: 1, background: 'none', border: 'none', textAlign: 'left',
                        cursor: 'pointer', padding: 0,
                      }}>
                        <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--kms-dark)', margin: '0 0 2px' }}>{entry.name}</p>
                        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
                          {entry.recipe.bereidingstijd} min · {'⭐'.repeat(entry.recipe.moeilijkheid)}
                        </p>
                      </button>
                      <button onClick={() => handleSavedRecipeStart(entry)}
                        style={{ background: 'var(--kms-orange)', color: 'white', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        Kook dit →
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mood */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--kms-dark)', marginBottom: 10 }}>Wat heb je zin in?</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {MOOD_OPTIONS.map(m => (
                  <button key={m} onClick={() => setMood(m === mood ? '' : m)}
                    style={{ padding: '8px 14px', borderRadius: 20, border: '2px solid', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      borderColor: mood === m ? 'var(--kms-orange)' : '#E0E0E0',
                      background: mood === m ? 'var(--kms-orange)' : 'white',
                      color: mood === m ? 'white' : 'var(--kms-dark)' }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Tijd */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--kms-dark)', marginBottom: 10 }}>Hoeveel tijd heb je?</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {TIME_OPTIONS.map(t => (
                  <button key={t} onClick={() => setTijd(t === tijd ? '' : t)}
                    style={{ padding: '8px 14px', borderRadius: 20, border: '2px solid', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      borderColor: tijd === t ? 'var(--kms-orange)' : '#E0E0E0',
                      background: tijd === t ? 'var(--kms-orange)' : 'white',
                      color: tijd === t ? 'white' : 'var(--kms-dark)' }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Personen */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--kms-dark)', marginBottom: 10 }}>Voor hoeveel personen?</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => setPersonen(p => String(Math.max(1, (parseInt(p) || 2) - 1)))}
                  style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid var(--kms-orange)', background: 'white', color: 'var(--kms-orange)', fontSize: 22, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>−</button>
                <div style={{ textAlign: 'center', minWidth: 80 }}>
                  <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--kms-dark)' }}>{personen}</span>
                  <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>{parseInt(personen) === 1 ? 'persoon' : 'personen'}</p>
                </div>
                <button onClick={() => setPersonen(p => String(Math.min(20, (parseInt(p) || 2) + 1)))}
                  style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid var(--kms-orange)', background: 'var(--kms-orange)', color: 'white', fontSize: 22, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>+</button>
              </div>
            </div>

            {/* Keuken */}
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--kms-dark)', marginBottom: 10 }}>Keuken voorkeur?</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {CUISINE_OPTIONS.map(c => (
                  <button key={c} onClick={() => setKeuken(c === keuken ? '' : c)}
                    style={{ padding: '8px 14px', borderRadius: 20, border: '2px solid', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      borderColor: keuken === c ? 'var(--kms-orange)' : '#E0E0E0',
                      background: keuken === c ? 'var(--kms-orange)' : 'white',
                      color: keuken === c ? 'white' : 'var(--kms-dark)' }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {error && <p style={{ color: 'red', marginBottom: 12, fontSize: 14 }}>{error}</p>}

            <button onClick={fetchSuggestions} disabled={loading || (!mood && !tijd && !keuken)}
              style={{ width: '100%', padding: '16px', background: 'var(--kms-orange)', color: 'white', border: 'none',
                borderRadius: 14, fontSize: 16, fontWeight: 800, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
              {loading ? '⏳ Recepten ophalen...' : '✨ Geef me receptideeën!'}
            </button>
          </>
        )}

        {/* ── SUGGESTIES ── */}
        {step === 'suggestions' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <button onClick={() => setStep('checkin')} style={{ background: 'none', border: 'none', color: 'var(--kms-orange)', fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>
                ← Terug
              </button>
              <button onClick={fetchSuggestions} disabled={loading} style={{ background: '#FFF3EE', border: '2px solid var(--kms-orange)', color: 'var(--kms-orange)', fontWeight: 700, cursor: 'pointer', fontSize: 14, borderRadius: 20, padding: '6px 14px' }}>
                {loading ? '⏳' : '🔄 Andere ideeën'}
              </button>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--kms-dark)', marginBottom: 16 }}>🍽️ Jouw receptideeën</h2>
            {error && <p style={{ color: 'red', marginBottom: 12 }}>{error}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => selectSuggestion(s)}
                  style={{ background: 'white', border: '2px solid #F0F0F0', borderRadius: 16, padding: '16px', textAlign: 'left', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--kms-dark)' }}>{CUISINE_EMOJI[s.keuken_type] || '🍽️'} {s.naam}</span>
                    <span style={{ fontSize: 12, color: '#888' }}>{s.bereidingstijd} min</span>
                  </div>
                  <p style={{ margin: '0 0 8px', fontSize: 13, color: '#666' }}>{s.waarom_dit_past}</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, background: '#FFF3EE', color: 'var(--kms-orange)', padding: '3px 8px', borderRadius: 10, fontWeight: 600 }}>{stars(s.moeilijkheid)}</span>
                    {s.top_ingredienten.slice(0, 3).map(ing => (
                      <span key={ing} style={{ fontSize: 12, background: '#F5F5F5', color: '#555', padding: '3px 8px', borderRadius: 10 }}>{ing}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── LOADING RECEPT ── */}
        {(step === 'loading-recipe' || step === 'loading-subs' || step === 'loading-adjusted') && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
            <p style={{ fontSize: 16, color: '#666', fontWeight: 600 }}>
              {step === 'loading-recipe' ? 'Recept genereren...' : step === 'loading-subs' ? 'Alternatieven zoeken...' : 'Recept aanpassen...'}
            </p>
          </div>
        )}

        {/* ── INGREDIËNTEN ── */}
        {step === 'ingredients' && recipe && (
          <>
            <button onClick={() => setStep(selected ? 'suggestions' : 'checkin')} style={{ background: 'none', border: 'none', color: 'var(--kms-orange)', fontWeight: 700, cursor: 'pointer', marginBottom: 16, fontSize: 15 }}>
              ← Terug
            </button>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--kms-dark)', marginBottom: 4 }}>{recipe.naam}</h2>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>{recipe.bereidingstijd} min · {stars(recipe.moeilijkheid)} · {recipe.porties} personen</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--kms-dark)', marginBottom: 10 }}>Kruis aan wat je <strong>niet</strong> in huis hebt:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {sortedIngredients.map(ing => {
                const missing = missingIngredients.includes(ing.naam)
                return (
                  <button key={ing.naam} onClick={() => toggleMissing(ing.naam)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: 12, border: '2px solid',
                      borderColor: missing ? '#FF4444' : '#E0E0E0', background: missing ? '#FFF0F0' : 'white', cursor: 'pointer' }}>
                    <span style={{ fontSize: 14, fontWeight: missing ? 700 : 400, color: missing ? '#CC0000' : 'var(--kms-dark)', textDecoration: missing ? 'line-through' : 'none' }}>
                      {missing ? '✗ ' : ''}{ing.naam}
                    </span>
                    <span style={{ fontSize: 13, color: '#888' }}>{ing.hoeveelheid} {ing.eenheid}</span>
                  </button>
                )
              })}
            </div>

            {/* Extra ingrediënten */}
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--kms-dark)', marginBottom: 8 }}>Extra ingrediënten toevoegen?</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input value={extraInput} onChange={e => setExtraInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addExtra()}
                placeholder="bijv. champignons" style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1.5px solid #E0E0E0', fontSize: 14 }} />
              <button onClick={addExtra} style={{ padding: '10px 16px', background: 'var(--kms-orange)', color: 'white', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>+</button>
            </div>
            {extraIngredients.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {extraIngredients.map(e => (
                  <span key={e} style={{ background: '#E8F5E9', color: '#2E7D32', padding: '4px 10px', borderRadius: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {e} <button onClick={() => removeExtra(e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2E7D32', fontWeight: 700, padding: 0 }}>×</button>
                  </span>
                ))}
              </div>
            )}

            {saveMessage && <p style={{ color: 'green', fontSize: 13, marginBottom: 8 }}>{saveMessage}</p>}
            {error && <p style={{ color: 'red', marginBottom: 12, fontSize: 14 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={toggleSaveRecipe} disabled={saving}
                style={{ flex: 1, padding: '14px', border: '2px solid var(--kms-orange)', background: 'white', color: 'var(--kms-orange)', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                {savedRecipeId ? '🗑️ Verwijder' : '🔖 Opslaan'}
              </button>
              <button onClick={fetchSubstitutions}
                style={{ flex: 2, padding: '14px', background: 'var(--kms-orange)', color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
                {missingIngredients.length > 0 ? '🔄 Vind alternatieven' : '👨‍🍳 Aan de slag!'}
              </button>
            </div>
          </>
        )}

        {/* ── SUBSTITUTEN ── */}
        {step === 'substitutes' && (
          <>
            <button onClick={() => setStep('ingredients')} style={{ background: 'none', border: 'none', color: 'var(--kms-orange)', fontWeight: 700, cursor: 'pointer', marginBottom: 16, fontSize: 15 }}>
              ← Terug
            </button>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--kms-dark)', marginBottom: 16 }}>🔄 Kies je alternatieven</h2>
            {alternativeDish ? (
              <div style={{ background: '#FFF3EE', borderRadius: 14, padding: 20, marginBottom: 20 }}>
                <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--kms-dark)', marginBottom: 8 }}>Te veel ingrediënten missen — alternatief gerecht:</p>
                <p style={{ fontWeight: 800, fontSize: 18, color: 'var(--kms-orange)', marginBottom: 4 }}>{alternativeDish.alternative_dish}</p>
                <p style={{ fontSize: 14, color: '#666' }}>{alternativeDish.reason}</p>
                <button onClick={() => { setSelected({ naam: alternativeDish.alternative_dish, moeilijkheid: 2, bereidingstijd: 30, waarom_dit_past: '', top_ingredienten: [], avontuursscore: 3, keuken_type: 'Overig', niveau_vereist: 1 }); setStep('loading-recipe') }}
                  style={{ marginTop: 14, padding: '12px 20px', background: 'var(--kms-orange)', color: 'white', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>
                  Maak {alternativeDish.alternative_dish} →
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 20 }}>
                {missingIngredients.map(ing => (
                  <div key={ing}>
                    <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--kms-dark)', marginBottom: 8 }}>Vervang <em>{ing}</em> door:</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(substitutionOptions[ing] || []).concat(['__weglaten__']).map(opt => (
                        <button key={opt} onClick={() => setChosenSubstitutes(prev => ({ ...prev, [ing]: opt }))}
                          style={{ padding: '10px 14px', borderRadius: 10, border: '2px solid',
                            borderColor: chosenSubstitutes[ing] === opt ? 'var(--kms-orange)' : '#E0E0E0',
                            background: chosenSubstitutes[ing] === opt ? '#FFF3EE' : 'white',
                            textAlign: 'left', cursor: 'pointer', fontSize: 14,
                            color: opt === '__weglaten__' ? '#888' : 'var(--kms-dark)', fontWeight: chosenSubstitutes[ing] === opt ? 700 : 400 }}>
                          {opt === '__weglaten__' ? '🚫 Weglaten' : opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {error && <p style={{ color: 'red', marginBottom: 12, fontSize: 14 }}>{error}</p>}
            {!alternativeDish && (
              <button onClick={startCooking}
                style={{ width: '100%', padding: '16px', background: 'var(--kms-orange)', color: 'white', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
                👨‍🍳 Kook met alternatieven!
              </button>
            )}
          </>
        )}

      </div>

      <NavBar />
    </div>
  )
}
