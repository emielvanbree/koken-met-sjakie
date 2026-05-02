import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { sanitize } from '@/lib/sanitize'
import { rateLimit } from '@/lib/rate-limit'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'local'
  if (!rateLimit(`tech:${ip}`, 100, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Limiet bereikt' }, { status: 429 })
  }
  try {
    const body = await req.json()
    const term = sanitize(body.term, 100)
    const context = sanitize(body.context || '', 200)

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Leg de kooktechniek "<user_input>${term}</user_input>" uit in 2-3 eenvoudige zinnen voor een thuiskok. ${context ? `Context: ${context}` : ''} Geen vakjargon, direct en praktisch.`
      }]
    })
    const explanation = message.content[0].type === 'text' ? message.content[0].text : ''
    return NextResponse.json({ explanation })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'AI niet beschikbaar' }, { status: 500 }) }
}