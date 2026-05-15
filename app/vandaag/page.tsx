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
const PERSONS_OPTIONS = ['Voor mezelf', 'Voor twee', 'Voor een gezin', '4 of meer']
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
  const [personen, setPersonen] = useState(2)
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

  const [useCustomDish, setUseCustomDish] = useState(false)
  const [customDishName, setCustomDishName] = useState('')
  const [cameFromCustomDish, setCameFromCustomDish] = useState(false)

  const STORAGE_KEY = 'kms-saved-recipes'

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setMyRecipes(JSON.parse(raw))
    } catch { /* localStorage niet beschikbaar */ }
  }, [])

  const servings = personen

  async function fetchSuggestions() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/ai/suggest-recipes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_level: 1, available_time: tijd, cooking_for: `${personen} personen`, mood, cuisine_preference: keuken, recent_dishes: [], current_month: new Date().toLocaleString('nl-NL', { month: 'long' }) })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Fout bij suggesties ophalen'); return }
      setSuggestions(data.suggestions || [])
      setStep('suggestions')
    } catch { setError('Verbindingsfout. Probeer opnieuw.') }
    finally { setLoading(false) }
  }

  async function fetchCustomDish() {
    const dishName = customDishName.trim()
    if (!dishName) return
    setLoading(true); setError('')
    const syntheticSuggestion: Suggestion = {
      naam: dishName, moeilijkheid: 3, bereidingstijd: 30,
      waarom_dit_past: 'Eigen keuze', top_ingredienten: [],
      avontuursscore: 3, keuken_type: 'Overig', niveau_vereist: 1,
    }
    setSelected(syntheticSuggestion)
    setMissingIngredients([])
    setExtraIngredients([])
    setRecipe(null)
    setError('')
    setSavedRecipeId(null)
    setSaveMessage('')
    setCameFromCustomDish(true)
    setStep('loading-recipe')
    setLoading(false)
    try {
      const res = await fetch('/api/ai/generate-recipe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dish_name: dishName, servings, user_level: 1, missing_ingredients: [] })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Recept genereren mislukt'); setStep('checkin'); return }
      setRecipe(data.recipe)
      setStep('ingredients')
    } catch { setError('Verbindingsfout.'); setStep('checkin') }
  }

  async function selectSuggestion(s: Suggestion) {
    setSelected(s)
    setMissingIngredients([])
    setExtraIngredients([])
    setRecipe(null)
    setError('')
    setSavedRecipeId(null)
    setSaveMessage('')
    setCameFromCustomDish(false)
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

  async function fetchSubstitutions() {
    if (!selected || !recipe) return

    if (missingIngredients.length === 0 && extraIngredients.length === 0) {
      sessionStorage.setItem('kms-active-recipe', JSON.stringify(recipe))
      router.push('/koken')
      return
    }

    if (missingIngredients.length === 0 && extraIngredients.length > 0) {
      setStep('loading-adjusted')
      setError('')
      try {
        const res = await fetch('/api/ai/generate-recipe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dish_name: selected.naam, servings, user_level: 1, missing_ingredients: [], extra_ingredients: extraIngredients })
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
      if (!res.ok) { setError(data.error || 'Recept aanpassen mislukt'); setStep('substitutes'); return }
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
    setCameFromCustomDish(false)
    setStep('ingredients')
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
    setSaving(true); setSaveMessage('')
    if (savedRecipeId) {
      const updated = myRecipes.filter(r => r.id !== savedRecipeId)
      setMyRecipes(updated); saveToStorage(updated); setSavedRecipeId(null)
      setSaveMessage('🗑️ Recept verwijderd uit opgeslagen')
    } else {
      const id = `recipe-${Date.now()}`
      const newEntry = { id, name: recipe.naam, recipe }
      const existing = myRecipes.find(r => r.name === recipe.naam)
      const updated = existing ? myRecipes.map(r => r.name === recipe.naam ? { ...r, recipe } : r) : [newEntry, ...myRecipes]
      const finalId = existing ? existing.id : id
      setMyRecipes(updated); saveToStorage(updated); setSavedRecipeId(finalId)
      setSaveMessage('✅ Recept opgeslagen! Terug te vinden onder "Mijn recepten".')
    }
    setSaving(false)
  }

  function addExtra() {
    const val = extraInput.trim()
    if (val && !extraIngredients.includes(val)) { setExtraIngredients([...extraIngredients, val]); setExtraInput('') }
  }

  function removeExtra(val: string) { setExtraIngredients(prev => prev.filter(i => i !== val)) }

  function toggleMissing(naam: string) {
    setMissingIngredients(prev => prev.includes(naam) ? prev.filter(i => i !== naam) : [...prev, naam])
  }

  const stars = (n: number) => '⭐'.repeat(n) + '☆'.repeat(5 - n)

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

        {step === 'checkin' && (
          <>
            {myRecipes.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--kms-dark)', marginBottom: 12 }}>🔖 Mijn recepten</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {myRecipes.map(entry => (
                    <div key={entry.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', borderRadius: 12, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', border: '1.5px solid #F0F0F0' }}>
                      <button onClick={() => loadSavedRecipe(entry)} style={{ flex: 1, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--kms-dark)', margin: '0 0 2px' }}>{entry.name}</p>
                        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>{entry.recipe.bereidingstijd} min · {'⭐'.repeat(entry.recipe.moeilijkheid)}{'☆'.repeat(5 - entry.recipe.moeilijkheid)} · {entry.recipe.keuken_type}</p>
                      </button>
                      <button onClick={() => deleteSavedRecipe(entry.id)} disabled={deletingId === entry.id}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: '4px 8px', color: '#CCC', flexShrink: 0 }}>
                        {deletingId === entry.id ? '⏳' : '🗑️'}
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ height: 1, background: '#EEE', margin: '20px 0 4px' }} />
              </div>
            )}

            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: 'var(--kms-dark)' }}>
              Hoe zit je erbij? <span style={{ fontWeight: 400, color: '#888', fontSize: 14 }}>(optioneel)</span>
            </h2>

            <div className="card" style={{ marginBottom: 16 }}>
              <p style={{ fontWeight: 600, marginBottom: 10, color: 'var(--kms-dark)' }}>👥 Voor hoeveel personen?</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: '#F3F3F3', borderRadius: 14, overflow: 'hidden', width: 'fit-content' }}>
                <button onClick={() => setPersonen(p => Math.max(1, p - 1))}
                  style={{ background: 'none', border: 'none', padding: '10px 18px', fontWeight: 800, fontSize: 22, color: 'var(--kms-orange)', cursor: 'pointer', lineHeight: 1 }}>−</button>
                <span style={{ fontWeight: 700, fontSize: 20, color: 'var(--kms-dark)', minWidth: 36, textAlign: 'center' }}>{personen}</span>
                <button onClick={() => setPersonen(p => Math.min(20, p + 1))}
                  style={{ background: 'none', border: 'none', padding: '10px 18px', fontWeight: 800, fontSize: 22, color: 'var(--kms-orange)', cursor: 'pointer', lineHeight: 1 }}>+</button>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <p style={{ fontWeight: 600, marginBottom: 10, color: 'var(--kms-dark)' }}>⏰ Hoeveel tijd heb je?</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {TIME_OPTIONS.map(o => (
                  <button key={o} onClick={() => setTijd(tijd === o ? '' : o)}
                    style={{ padding: '8px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, background: tijd === o ? 'var(--kms-orange)' : '#F3F3F3', color: tijd === o ? 'white' : '#444' }}>
                    {o}
                  </button>
                ))}
              </div>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <p style={{ fontWeight: 600, marginBottom: 10, color: 'var(--kms-dark)' }}>🍽️ Waar heb je zin in?</p>
              {!useCustomDish && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  {MOOD_OPTIONS.map(o => (
                    <button key={o} onClick={() => setMood(mood === o ? '' : o)}
                      style={{ padding: '8px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, background: mood === o ? 'var(--kms-orange)' : '#F3F3F3', color: mood === o ? 'white' : '#444' }}>
                      {o}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ borderTop: useCustomDish ? 'none' : '1.5px solid #F0F0F0', paddingTop: useCustomDish ? 0 : 12 }}>
                <button onClick={() => { setUseCustomDish(!useCustomDish); setCustomDishName('') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 20, border: `2px solid ${useCustomDish ? 'var(--kms-orange)' : '#E0E0E0'}`, background: useCustomDish ? '#FFF3EE' : '#F8F8F8', color: useCustomDish ? 'var(--kms-orange)' : '#666', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                  ✏️ Zelf gerecht kiezen
                  {useCustomDish && <span style={{ fontSize: 12, opacity: 0.7 }}>✕</span>}
                </button>
                {useCustomDish && (
                  <div style={{ marginTop: 12 }}>
                    <p style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>Typ een gerecht en Claude maakt er een volledig recept van.</p>
                    <input type="text" value={customDishName} onChange={e => setCustomDishName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && customDishName.trim()) fetchCustomDish() }}
                      placeholder="bijv. Macaroni Bolognese, Thaise curry..."
                      autoFocus
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '2px solid var(--kms-orange)', fontSize: 15, boxSizing: 'border-box', outline: 'none' }} />
                  </div>
                )}
              </div>
            </div>

            {!useCustomDish && (
              <div className="card" style={{ marginBottom: 24 }}>
                <p style={{ fontWeight: 600, marginBottom: 10, color: 'var(--kms-dark)' }}>🌍 Keukenvoorkeur?</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {CUISINE_OPTIONS.map(c => (
                    <button key={c} onClick={() => setKeuken(keuken === c ? '' : c)}
                      style={{ padding: '8px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, background: keuken === c ? 'var(--kms-orange)' : '#F3F3F3', color: keuken === c ? 'white' : '#444' }}>
                      {CUISINE_EMOJI[c] || '🍽️'} {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {useCustomDish && <div style={{ marginBottom: 24 }} />}

            {error && <p style={{ color: 'var(--kms-red)', marginBottom: 12, textAlign: 'center' }}>{error}</p>}

            {useCustomDish ? (
              <button className="btn-primary" onClick={fetchCustomDish} disabled={loading || !customDishName.trim()} style={{ fontSize: 18, padding: '16px' }}>
                {loading ? '⏳ Recept laden...' : customDishName.trim() ? `🍳 Maak ${customDishName.trim()} →` : '🍳 Typ een gerecht hierboven'}
              </button>
            ) : (
              <button className="btn-primary" onClick={fetchSuggestions} disabled={loading} style={{ fontSize: 18, padding: '16px' }}>
                {loading ? '⏳ Suggesties laden...' : '✨ Verras me!'}
              </button>
            )}
          </>
        )}

        {step === 'suggestions' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--kms-dark)', margin: 0 }}>Hier zijn je opties:</h2>
              <button onClick={fetchSuggestions} disabled={loading}
                style={{ color: 'var(--kms-orange)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
                🔄 Nieuwe opties
              </button>
            </div>
            {suggestions.map((s, i) => (
              <div key={i} className="card" style={{ marginBottom: 16, cursor: 'pointer', border: '2px solid transparent', transition: 'border 0.2s' }}
                onClick={() => selectSuggestion(s)}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--kms-orange)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 24 }}>{CUISINE_EMOJI[s.keuken_type] || '🍽️'}</span>
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--kms-dark)', margin: '4px 0 2px' }}>{s.naam}</h3>
                    <p style={{ color: '#888', fontSize: 13, margin: 0 }}>{s.keuken_type} · {s.bereidingstijd} min</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>moeilijk</div>
                    <div style={{ fontSize: 14 }}>{stars(s.moeilijkheid)}</div>
                  </div>
                </div>
                <p style={{ color: '#555', fontSize: 14, margin: '0 0 10px' }}>{s.waarom_dit_past}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {s.top_ingredienten.map((ing, j) => (
                    <span key={j} className="chip" style={{ fontSize: 12 }}>🥘 {ing}</span>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#888' }}>Avontuur: {'🌟'.repeat(s.avontuursscore)}{'☆'.repeat(5 - s.avontuursscore)}</span>
                  <button className="btn-primary" style={{ width: 'auto', padding: '8px 20px', fontSize: 14 }}>Dit maak ik! →</button>
                </div>
              </div>
            ))}
            <button className="btn-secondary" onClick={() => setStep('checkin')}>← Terug naar check-in</button>
          </>
        )}

        {step === 'loading-recipe' && selected && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🍳</div>
            <h3 style={{ fontWeight: 700, color: 'var(--kms-dark)', marginBottom: 8 }}>Recept ophalen...</h3>
            <p style={{ color: '#888' }}>Claude bereidt {selected.naam} voor</p>
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center', gap: 6 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--kms-orange)', animation: `bounce 1.2s ${i * 0.2}s infinite ease-in-out` }} />
              ))}
            </div>
            <style>{`@keyframes bounce { 0%,80%,100%{transform:scale(0)} 40%{transform:scale(1)} }`}</style>
          </div>
        )}

        {step === 'ingredients' && selected && recipe && (
          <>
            <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(135deg, #FFF3EE, white)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--kms-dark)', marginBottom: 4 }}>{recipe.naam}</h2>
                  <p style={{ color: '#666', fontSize: 14, margin: '0 0 6px' }}>{recipe.beschrijving}</p>
                  <p style={{ color: '#888', fontSize: 13, margin: 0 }}>{recipe.bereidingstijd} min · {stars(recipe.moeilijkheid)} · {recipe.porties} personen</p>
                </div>
                <button onClick={toggleSaveRecipe} disabled={saving}
                  style={{ background: savedRecipeId ? '#E8F5E9' : '#FFF3EE', border: `2px solid ${savedRecipeId ? '#2D6A4F' : 'var(--kms-orange)'}`, borderRadius: 12, cursor: saving ? 'wait' : 'pointer', padding: '8px 12px', fontSize: 20, marginLeft: 10, flexShrink: 0 }}>
                  {saving ? '⏳' : '🔖'}
                </button>
              </div>
              {saveMessage && (
                <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: saveMessage.startsWith('✅') ? '#E8F5E9' : '#FFF3EE', color: saveMessage.startsWith('✅') ? '#2D6A4F' : '#E65100', fontSize: 13, fontWeight: 600 }}>
                  {saveMessage}
                </div>
              )}
            </div>

            <div className="card" style={{ marginBottom: 24 }}>
              <h3 style={{ fontWeight: 700, marginBottom: 4, color: 'var(--kms-dark)' }}>🛒 Check je ingredienten</h3>
              <p style={{ color: '#666', fontSize: 14, marginBottom: 14 }}>Tik op een ingredient dat je <strong>niet hebt</strong> — Claude zoekt dan een alternatief.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {sortedIngredients.map(ing => {
                  const missing = missingIngredients.includes(ing.naam)
                  return (
                    <button key={ing.naam} onClick={() => toggleMissing(ing.naam)} style={{ padding: '8px 14px', borderRadius: 20, border: `2px solid ${missing ? '#E53935' : ing.is_substituut ? '#FF9800' : '#E0E0E0'}`, cursor: 'pointer', fontWeight: 600, fontSize: 14, background: missing ? '#FFE8E8' : ing.is_substituut ? '#FFF3E0' : '#F8F8F8', color: missing ? '#C62828' : ing.is_substituut ? '#E65100' : '#444', textDecoration: missing ? 'line-through' : 'none' }}>
                      {missing ? '✕ ' : '✓ '}
                      {ing.hoeveelheid > 0 ? `${ing.hoeveelheid} ${ing.eenheid} ` : ''}
                      {ing.naam}
                      {ing.is_substituut && !missing && <span style={{ fontSize: 11, marginLeft: 4 }}>↩</span>}
                    </button>
                  )
                })}
              </div>
              <div style={{ marginTop: 16, borderTop: '1.5px solid #F0F0F0', paddingTop: 14 }}>
                <p style={{ color: 'var(--kms-dark)', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>➕ Wil je nog een extra ingredient toevoegen?</p>
                <p style={{ color: '#888', fontSize: 13, marginBottom: 10 }}>Claude verwerkt dit in het recept.</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" value={extraInput} placeholder="bijv. spekjes, basilicum..."
                    onChange={e => setExtraInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addExtra()}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1.5px solid #E0E0E0', fontSize: 15 }} />
                  <button onClick={addExtra} style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--kms-orange)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700 }}>+</button>
                </div>
                {extraIngredients.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    {extraIngredients.map(ing => (
                      <button key={ing} onClick={() => removeExtra(ing)}
                        style={{ padding: '8px 14px', borderRadius: 20, border: '2px solid #2D6A4F', background: '#E8F5E9', color: '#2D6A4F', cursor: 'pointer', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                        ✓ {ing} <span style={{ opacity: 0.6, fontSize: 12 }}>✕</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {missingIngredients.length > 0 && (
                <p style={{ marginTop: 12, fontSize: 13, color: '#888', background: '#FFF3EE', padding: '8px 12px', borderRadius: 8 }}>
                  ⚠️ {missingIngredients.length} ingredient{missingIngredients.length > 1 ? 'en ontbreken' : ' ontbreekt'} — Claude past het recept aan met alternatieven.
                </p>
              )}
              {extraIngredients.length > 0 && missingIngredients.length === 0 && (
                <p style={{ marginTop: 12, fontSize: 13, color: '#2D6A4F', background: '#E8F5E9', padding: '8px 12px', borderRadius: 8 }}>
                  🌿 {extraIngredients.length} extra ingredient{extraIngredients.length > 1 ? 'en worden' : ' wordt'} door Claude in het recept verwerkt.
                </p>
              )}
            </div>

            {error && <p style={{ color: 'var(--kms-red)', marginBottom: 12, textAlign: 'center' }}>{error}</p>}
            <button className="btn-primary" onClick={fetchSubstitutions} style={{ fontSize: 18, padding: '16px', marginBottom: 10 }}>
              {missingIngredients.length > 0 ? '🔄 Bekijk alternatieven →' : extraIngredients.length > 0 ? '🌿 Verwerk extra ingredienten & aan de slag!' : '🍳 Aan de slag!'}
            </button>
            <button className="btn-secondary" onClick={() => setStep(cameFromCustomDish ? 'checkin' : 'suggestions')}>
              ← Terug naar {cameFromCustomDish ? 'check-in' : 'suggesties'}
            </button>
          </>
        )}

        {step === 'loading-subs' && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
            <h3 style={{ fontWeight: 700, color: 'var(--kms-dark)', marginBottom: 8 }}>Alternatieven zoeken...</h3>
            <p style={{ color: '#888' }}>Claude zoekt slimme vervangingen voor jouw ontbrekende ingredienten</p>
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center', gap: 6 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--kms-orange)', animation: `bounce 1.2s ${i * 0.2}s infinite ease-in-out` }} />
              ))}
            </div>
            <style>{`@keyframes bounce { 0%,80%,100%{transform:scale(0)} 40%{transform:scale(1)} }`}</style>
          </div>
        )}

        {step === 'loading-adjusted' && selected && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔄</div>
            <h3 style={{ fontWeight: 700, color: 'var(--kms-dark)', marginBottom: 8 }}>Recept aanpassen...</h3>
            <p style={{ color: '#888', marginBottom: 4 }}>Claude verwerkt jouw{extraIngredients.length > 0 && missingIngredients.length === 0 ? ' extra ingredienten in' : ' alternatieven in'} {selected.naam}</p>
            <p style={{ color: '#aaa', fontSize: 13 }}>Dit duurt 10-15 seconden</p>
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center', gap: 6 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--kms-orange)', animation: `bounce 1.2s ${i * 0.2}s infinite ease-in-out` }} />
              ))}
            </div>
            <style>{`@keyframes bounce { 0%,80%,100%{transform:scale(0)} 40%{transform:scale(1)} }`}</style>
            {error && (
              <div style={{ marginTop: 24, background: '#FFE8E8', border: '2px solid var(--kms-red)', borderRadius: 12, padding: '14px 20px' }}>
                <p style={{ color: 'var(--kms-red)', fontWeight: 600, margin: '0 0 10px' }}>❌ {error}</p>
                <button className="btn-secondary" onClick={() => { setError(''); setStep('substitutes') }}>← Terug naar alternatieven</button>
              </div>
            )}
          </div>
        )}

        {step === 'substitutes' && selected && (
          <>
            <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(135deg, #FFF3EE, white)' }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--kms-dark)', marginBottom: 4 }}>{selected.naam}</h2>
              <p style={{ color: '#888', fontSize: 14, margin: 0 }}>Kies een alternatief voor elk ontbrekend ingredient</p>
            </div>

            {alternativeDish ? (
              <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--kms-orange)' }}>
                <p style={{ fontWeight: 700, color: 'var(--kms-orange)', marginBottom: 6 }}>⚠️ Te veel ingredienten ontbreken</p>
                <p style={{ color: '#555', marginBottom: 12 }}>Er mist te veel om dit gerecht goed te maken. Claude stelt voor:</p>
                <div style={{ background: '#FFF3EE', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                  <p style={{ fontWeight: 700, fontSize: 17, color: 'var(--kms-dark)', margin: '0 0 4px' }}>{alternativeDish.alternative_dish}</p>
                  <p style={{ color: '#666', fontSize: 14, margin: 0 }}>{alternativeDish.reason}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button className="btn-primary" onClick={() => {
                    if (!selected) return
                    setSelected({ ...selected, naam: alternativeDish.alternative_dish })
                    setMissingIngredients([])
                    setChosenSubstitutes({})
                    setStep('loading-recipe')
                    fetch('/api/ai/generate-recipe', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ dish_name: alternativeDish.alternative_dish, servings, user_level: 1, missing_ingredients: [] })
                    }).then(r => r.json()).then(d => {
                      if (d.recipe) { setRecipe(d.recipe); setStep('ingredients') }
                      else { setError('Recept genereren mislukt'); setStep('suggestions') }
                    }).catch(() => { setError('Verbindingsfout.'); setStep('suggestions') })
                  }}>
                    ✅ Maak in plaats daarvan: {alternativeDish.alternative_dish}
                  </button>
                  <button className="btn-secondary" onClick={() => setStep('ingredients')}>← Andere ingredienten kiezen</button>
                </div>
              </div>
            ) : (
              <>
                {missingIngredients.map(ing => {
                  const options = substitutionOptions[ing] || []
                  const chosen = chosenSubstitutes[ing]
                  return (
                    <div key={ing} className="card" style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <span style={{ fontSize: 16 }}>❌</span>
                        <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--kms-dark)', margin: 0, textDecoration: 'line-through', opacity: 0.6 }}>{ing}</p>
                        <span style={{ fontSize: 13, color: '#888' }}>ontbreekt</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {options.map(opt => (
                          <button key={opt} onClick={() => setChosenSubstitutes(prev => ({ ...prev, [ing]: opt }))}
                            style={{ padding: '11px 14px', borderRadius: 12, textAlign: 'left', cursor: 'pointer', border: `2px solid ${chosen === opt ? 'var(--kms-orange)' : '#E0E0E0'}`, background: chosen === opt ? '#FFF3EE' : 'white', fontWeight: chosen === opt ? 700 : 500, fontSize: 15, color: chosen === opt ? 'var(--kms-orange)' : 'var(--kms-dark)' }}>
                            {chosen === opt ? '✓ ' : ''}{opt}
                          </button>
                        ))}
                        {options.length === 0 && <p style={{ color: '#888', fontSize: 14, fontStyle: 'italic' }}>Geen directe vervanging beschikbaar</p>}
                        <button onClick={() => setChosenSubstitutes(prev => ({ ...prev, [ing]: '__weglaten__' }))}
                          style={{ padding: '11px 14px', borderRadius: 12, textAlign: 'left', cursor: 'pointer', border: `2px solid ${chosen === '__weglaten__' ? '#E53935' : '#E0E0E0'}`, background: chosen === '__weglaten__' ? '#FFE8E8' : '#F8F8F8', fontWeight: chosen === '__weglaten__' ? 700 : 500, fontSize: 14, color: chosen === '__weglaten__' ? '#C62828' : '#888' }}>
                          {chosen === '__weglaten__' ? '✓ ' : ''}Weglaten uit het recept
                        </button>
                      </div>
                    </div>
                  )
                })}
                {error && <p style={{ color: 'var(--kms-red)', marginBottom: 12, textAlign: 'center' }}>{error}</p>}
                <button className="btn-primary" onClick={startCooking} disabled={loading} style={{ fontSize: 18, padding: '16px', marginBottom: 12 }}>
                  {loading ? '⏳ Recept aanpassen...' : '🍳 Pas aan & aan de slag!'}
                </button>
                <button className="btn-secondary" onClick={() => setStep('ingredients')}>← Terug naar ingredienten</button>
              </>
            )}
          </>
        )}

      </div>
      <NavBar />
    </div>
  )
}
