import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { sanitize } from '@/lib/sanitize'
import { rateLimit } from '@/lib/rate-limit'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'local'
  if (!rateLimit(`panic:${ip}`, 20, 24 * 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Limiet bereikt' }, { status: 429 })
  }
  try {
    const body = await req.json()
    const problem = sanitize(body.problem, 500)
    const dish = sanitize(body.dish || 'onbekend gerecht', 150)
    const step = sanitize(body.current_step || '', 200)

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Je bent een rustige, ervaren chef-kok die iemand helpt die in paniek is in de keuken.
Gerecht: ${dish}${step ? `, huidige stap: ${step}` : ''}
Probleem: <user_input>${problem}</user_input>

Geef DIRECT praktisch reddingsadvies in 3-5 korte zinnen. Geen inleiding. Begin met de oplossing. Wees geruststellend maar concreet.`
      }]
    })
    const advice = message.content[0].type === 'text' ? message.content[0].text : ''
    return NextResponse.json({ advice })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'AI niet beschikbaar' }, { status: 500 }) }
}