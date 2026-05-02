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
  const [personen, setPersonen] = useState('')
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

  const servings = personen === 'Voor mezelf' ? 1 : personen === 'Voor een gezin' ? 4 : personen === '4 of meer' ? 5 : 2

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
                        <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--kms-dark)', margin: '0 0 2px' }}>
                          {entry.name}
                        </p>
                        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
                          {entry.recipe.bereidingstijd} min · {'⭐'.repeat(entry.recipe.moeilijkheid)}
                        </p>
                      </div>
                      <button onClick={() => handleSavedRecipeStart(entry)}
                        style={{ background: 'var(--kms-orange)', color: 'white', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        Kook dit →
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <NavBar />
    </div>
  )
}
