import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { sanitize, sanitizeNumber } from '@/lib/sanitize'
import { getSessionFromRequest } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'local'
  const user = await getSessionFromRequest(req)
  const key = user ? `gen:${user.id}` : `gen:anon:${ip}`
  if (!rateLimit(key, 50, 24 * 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Daglimiet bereikt' }, { status: 429 })
  }
  try {
    const body = await req.json()
    const dishName = sanitize(body.dish_name, 150)
    const servings = sanitizeNumber(body.servings, 1, 10)
    const userLevel = sanitizeNumber(body.user_level, 1, 5)
    const missing = Array.isArray(body.missing_ingredients)
      ? body.missing_ingredients.slice(0,10).map((i: unknown) => sanitize(String(i), 100))
      : []
    const extras = Array.isArray(body.extra_ingredients)
      ? body.extra_ingredients.slice(0,10).map((i: unknown) => sanitize(String(i), 100))
      : []
    const chosenSubs: Record<string, string> = {}
    if (body.chosen_substitutes && typeof body.chosen_substitutes === 'object') {
      for (const [orig, sub] of Object.entries(body.chosen_substitutes)) {
        chosenSubs[sanitize(orig, 100)] = sanitize(String(sub), 100)
      }
    }

    const subsContext = Object.entries(chosenSubs)
      .filter(([, v]) => v !== '__weglaten__')
      .map(([k, v]) => `${k} → gebruik ${v}`)
      .join(', ')
    const skipContext = Object.entries(chosenSubs)
      .filter(([, v]) => v === '__weglaten__')
      .map(([k]) => k)
      .join(', ')

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Genereer een volledig recept voor "<user_input>${dishName}</user_input>" voor ${servings} personen (kokniveau ${userLevel}/5).
BELANGRIJK: Gebruik UITSLUITEND Nederlandse tekst en Latijnse letters. Geen Chinese, Japanse of andere niet-Latijnse tekens.
${subsContext ? `Gebruik deze substituten: <user_input>${subsContext}</user_input>.` : ''}
${skipContext ? `Laat deze ingrediënten volledig weg: <user_input>${skipContext}</user_input>.` : ''}
${missing.length > 0 && !subsContext && !skipContext ? `Ontbrekende ingrediënten: <user_input>${missing.join(', ')}</user_input> — pas het recept aan.` : ''}
${extras.length > 0 ? `De gebruiker wil ook deze extra ingrediënten verwerken in het recept: <user_input>${extras.join(', ')}</user_input> — verwerk ze op een logische manier in het gerecht.` : ''}

Geef ALLEEN een geldig JSON object terug, gee