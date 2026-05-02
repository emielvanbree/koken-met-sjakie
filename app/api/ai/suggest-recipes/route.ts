import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { sanitize } from '@/lib/sanitize'
import { rateLimit } from '@/lib/rate-limit'
import { getSessionFromRequest } from '@/lib/auth'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'local'
  const user = await getSessionFromRequest(req)
  const key = user ? `suggest:${user.id}` : `suggest:anon:${ip}`
  const limit = user ? 50 : 3
  if (!rateLimit(key, limit, 24 * 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Daglimiet bereikt voor receptsuggesties' }, { status: 429 })
  }
  try {
    const body = await req.json()
    const currentMonth = sanitize(body.current_month || '', 20)
    const context = {
      user_level: body.user_level || 1,
      available_time: sanitize(body.available_time || 'Geen voorkeur', 50),
      cooking_for: sanitize(body.cooking_for || 'Voor twee', 50),
      mood: sanitize(body.mood || 'Geen voorkeur', 100),
      cuisine_preference: sanitize(body.cuisine_preference || 'Geen voorkeur', 50),
      recent_dishes: Array.isArray(body.recent_dishes) ? body.recent_dishes.slice(0,5).map((d: unknown) => sanitize(String(d), 100)) : [],
      current_month: currentMonth,
    }
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Je bent een persoonlijke kookassistent voor "Koken met Sjakie". Genereer precies 3 receptsuggesties als JSON array.

BELANGRIJK: Gebruik UITSLUITEND Nederlandse woorden en Latijnse letters. Geen Chinese, Japanse, Arabische of andere tekens. Alle gerechtnamen, beschrijvingen en ingrediënten moeten in het Nederlands zijn.

Context: <user_input>${JSON.stringify(context)}</user_input>

${context.mood === 'Seizoensgerecht' && context.current_month ? `De gebruiker wil een seizoensgerecht. Het is nu ${context.current_month}. Gebruik uitsluitend ingrediënten die in ${context.current_month} in Nederland in het seizoen zijn. Vermeld in waarom_dit_past waarom het ingredient nu in het seizoen is.` : ''}

Elk recept bevat: naam (string, in het Nederlands), moeilijkheid (1-5), bereidingstijd (minuten, integer), waarom_dit_past (string, max 80 tekens, in het N