import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BADGES } from '@/lib/gamification'

export async function POST(req: NextRequest) {
  const user = await requireAuth(req)
  if (user instanceof NextResponse) return user

  const { badgeId } = await req.json()
  const badge = BADGES.find(b => b.id === badgeId)
  if (!badge) return NextResponse.json({ error: 'Onbekende badge' }, { status: 400 })

  let gamification = await prisma.gamificationProgress.findUnique({ where: { userId: user.id } })
  if (!gamification) {
    gamification = await prisma.gamificationProgress.create({ data: { userId: user.id, level: 1, xp: 0, streak: 0, badges: '[]' } })
  }

  const earned: string[] = JSON.parse(gamification.badges)
  if (earned.includes(badgeId)) {
    return NextResponse.json({ alreadyEarned: true })
  }

  const updated = [...earned, badgeId]
  await prisma.gamificationProgress.update({
    where: { userId: user.id },
    data: { badges: JSON.stringify(updated) },
  })

  return NextResponse.json({ newBadge: { name: badge.name, emoji: badge.emoji } })
}
