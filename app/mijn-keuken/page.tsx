'use client'
import { useState, useEffect } from 'react'
import NavBar from '@/components/NavBar'

const SECTIONS = ['Groente & Fruit','Vlees & Vis','Zuivel & Eieren','Droog & Conserven','Diepvries','Overig']
const SECTION_EMOJI: Record<string,string> = { 'Groente & Fruit':'🥦','Vlees & Vis':'🥩','Zuivel & Eieren':'🥛','Droog & Conserven':'🥫','Diepvries':'🧊','Overig':'🛒' }

interface ShoppingItem { id: string; naam: string; hoeveelheid: number; eenheid: string; winkel_sectie: string; gecheckt: boolean }

export default function MijnKeukenPage() {
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [listName, setListName] = useState('Boodschappenlijst')
  const [listId, setListId] = useState<string | null>(null)
  const [newItem, setNewItem] = useState('')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Load from session (recipe ingredients) or saved list
    const recipeData = sessionStorage.getItem('kms-active-recipe')
    if (recipeData) {
      try {
        const recipe = JSON.parse(recipeData)
        const recipeItems: ShoppingItem[] = recipe.ingredienten?.map((ing: {naam:string;hoeveelheid:number;eenheid:string;winkel_sectie:string}, i: number) => ({
          id: `recipe-${i}`, naam: ing.naam, hoeveelheid: ing.hoeveelheid, eenheid: ing.eenheid,
          winkel_sectie: ing.winkel_sectie || 'Overig', gecheckt: false
        })) || []
        setItems(recipeItems)
        setListName(`Boodschappen voor ${recipe.naam}`)
        return
      } catch {}
    }
    fetchSaved()
  }, [])

  async function fetchSaved() {
    const res = await fetch('/api/shopping-list')
    if (res.ok) {
      const data = await res.json()
      if (data.lists?.[0]) { setItems(data.lists[0].items); setListName(data.lists[0].name); setListId(data.lists[0].id) }
    }
  }

  async function saveList() {
    setSaving(true)
    if (listId) {
      await fetch('/api/shopping-list', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: listId, items }) })
    } else {
      const res = await fetch('/api/shopping-list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: listName, items }) })
      if (res.ok) { const data = await res.json(); setListId(data.list.id) }
    }
    setSaving(false)
  }

  function toggleItem(id: string) { setItems(prev => prev.map(i => i.id === id ? { ...i, gecheckt: !i.gecheckt } : i)) }

  function addItem() {
    if (!newItem.trim()) return
    setItems(prev => [...prev, { id: `manual-${Date.now()}`, naam: newItem.trim(), hoeveelheid: 1, eenheid: 'stuk', winkel_sectie: 'Overig', gecheckt: false }])
    setNewItem('')
  }

  function removeItem(id: string) { setItems(prev => prev.filter(i => i.id !== id)) }

  function exportText() {
    const lines = SECTIONS.flatMap(section => {
      const sectionItems = items.filter(i => i.winkel_sectie === section && !i.gecheckt)
      if (!sectionItems.length) return []
      return [`\n${SECTION_EMOJI[section]} ${section}:`, ...sectionItems.map(i => `  - ${i.hoeveelheid} ${i.eenheid} ${i.naam}`)]
    })
    const text = `🛒 ${listName}\n${lines.join('\n')}`
    if (navigator.share) { navigator.share({ text, title: listName }) }
    else { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  }

  const checkedCount = items.filter(i => i.gecheckt).length

  return (
    <div style={{ minHeight: '100vh', background: 'var(--kms-cream)', paddingBottom: 80 }}>
      <div style={{ background: 'linear-gradient(135deg, #4361EE, #7B2FBE)', padding: '24px 16px 20px', color: 'white' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>🛒 Mijn Keuken</h1>
        <p style={{ margin: '4px 0 0', opacity: 0.9 }}>{checkedCount}/{items.length} items</p>
      </div>

      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button className="btn-primary" style={{ flex: 1, padding: '12px' }} onClick={saveList} disabled={saving}>
            {saving ? '⏳' : '💾'} Opslaan
          </button>
          <button onClick={exportText}
            style={{ flex: 1, padding: '12px', borderRadius: 12, background: '#25D366', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
            {copied ? '✅ Gekopieerd!' : '📤 Delen'}
          </button>
        </div>

        {/* Add item */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input value={newItem} onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
            placeholder="Voeg ingredient toe..."
            style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1.5px solid #E0E0E0', fontSize: 15 }} />
          <button onClick={addItem}
            style={{ padding: '11px 18px', borderRadius: 10, background: 'var(--kms-orange)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700 }}>+</button>
        </div>

        {items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#888' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🛒</div>
            <p>Nog geen boodschappen. Kies een recept via Vandaag!</p>
          </div>
        )}

        {SECTIONS.map(section => {
          const sectionItems = items.filter(i => i.winkel_sectie === section)
          if (!sectionItems.length) return null
          return (
            <div key={section} style={{ marginBottom: 16 }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: '#888', marginBottom: 8 }}>{SECTION_EMOJI[section]} {section.toUpperCase()}</p>
              <div className="card" style={{ padding: '4px 0' }}>
                {sectionItems.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #F5F5F5' }}>
                    <button onClick={() => toggleItem(item.id)}
                      style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${item.gecheckt ? 'var(--kms-green)' : '#DDD'}`, background: item.gecheckt ? 'var(--kms-green)' : 'white', cursor: 'pointer', marginRight: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {item.gecheckt && <span style={{ color: 'white', fontSize: 14 }}>✓</span>}
                    </button>
                    <span style={{ flex: 1, fontSize: 15, textDecoration: item.gecheckt ? 'line-through' : 'none', color: item.gecheckt ? '#AAA' : 'var(--kms-dark)' }}>
                      {item.hoeveelheid} {item.eenheid} {item.naam}
                    </span>
                    <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CCC', fontSize: 18, padding: '0 4px' }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {checkedCount > 0 && (
          <button onClick={() => setItems(prev => prev.filter(i => !i.gecheckt))}
            style={{ width: '100%', padding: '12px', borderRadius: 12, background: '#FFF', border: '1.5px solid #E0E0E0', cursor: 'pointer', color: '#888', fontWeight: 600, fontSize: 14 }}>
            🗑️ Verwijder afgevinkte items ({checkedCount})
          </button>
        )}
      </div>
      <NavBar />
    </div>
  )
}
