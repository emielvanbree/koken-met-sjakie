import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/auth'
import { sanitize, sanitizeNumber } from '@/lib/sanitize'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  const { id } = await params
  const entry = await prisma.diaryEntry.findFirst({ where: { id, userId: user.id } })
  if (!entry) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  return NextResponse.json({ entry: { ...entry, badgesEarned: JSON.parse(entry.badgesEarned), recipeJson: JSON.parse(entry.recipeJson) } })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.diaryEntry.findFirst({ where: { id, userId: user.id } })
  if (!existing) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  const body = await req.json()
  const updated = await prisma.diaryEntry.update({
    where: { id },
    data: {
      notes: body.notes !== undefined ? sanitize(body.notes, 2000) : existing.notes,
      rating: body.rating !== undefined ? sanitizeNumber(body.rating, 1, 5) : existing.rating,
      emoji: body.emoji !== undefined ? sanitize(body.emoji, 10) : existing.emoji,
    }
  })
  return NextResponse.json({ entry: updated })
}
