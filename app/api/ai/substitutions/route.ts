import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { sanitize } from '@/lib/sanitize'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const missing = Array.isArray(body.missing)
      ? body.missing.slice(0,10).map((i: unknown) => sanitize(String(i), 100))
      : []
    const dish = sanitize(body.dish || '', 150)
    const pct = Number(body.missing_percentage) || 0

    if (pct > 40) {
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: `Meer dan 40% van de ingrediënten voor "<user_input>${dish}</user_input>" ontbreekt. Stel een alternatief gerecht voor dat WEL gemaakt kan worden met de beschikbare ingrediënten. Geef naam + 1 zin uitleg. Antwoord als JSON: {"alternative_dish": "naam", "reason": "uitleg"}`
        }]
      })
      const text = message.content[0].type === 'text' ? message.content[0].text : ''
      const cb1 = text.match(/```(?:json)?\s*([\s\S]*?)```/)
      const src1 = cb1 ? cb1[1] : text
      const jsonMatch = src1.match(/\{[\s\S]*\}/)
      return NextResponse.json({ too_many_missing: true, suggestion: jsonMatch ? JSON.parse(jsonMatch[0]) : null })
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Stel substituten voor de volgende ontbrekende ingrediënten voor het gerecht "<user_input>${dish}</user_input>": <user_input>${missing.join(', ')}</user_input>.
Geef precies 2 opties per ingrediënt. Geef ALLEEN dit JSON object terug, geen tekst eromheen:
{"substitutions": {"INGREDIENTNAAM": ["optie1", "optie2"]}}`
      }]
    })
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const cb2 = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    const src2 = cb2 ? cb2[1] : text
    const jsonMatch2 = src2.match(/\{[\s\S]*\}/)
    if (!jsonMatch2) return NextResponse.json({ substitutions: {} })
    const parsed = JSON.parse(jsonMatch2[0])
    return NextResponse.json(parsed)
  } catch (e) {
    console.error('substitutions error:', e)
    return NextResponse.json({ error: 'Substituten ophalen mislukt' }, { status: 500 })
  }
}
