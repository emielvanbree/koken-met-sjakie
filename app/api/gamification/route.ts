import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/auth'
import { BADGES, LEVELS, getLevelProgress } from '@/lib/gamification'

export async function GET(req: NextRequest) {
  const user = await getSessionFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  let progress = await prisma.gamificationProgress.findUnique({ where: { userId: user.id } })
  if (!progress) {
    progress = await prisma.gamificationProgress.create({ data: { userId: user.id, level: 1, xp: 0, streak: 0, badges: '[]' } })
  }
  const earnedIds: string[] = JSON.parse(progress.badges)
  const allBadges = BADGES.map(b => ({ ...b, earned: earnedIds.includes(b.id) }))
  const currentLevel = LEVELS.find(l => l.level === progress!.level) || LEVELS[0]
  const nextLevel = LEVELS.find(l => l.level === progress!.level + 1)
  return NextResponse.json({
    progress: {
      ...progress,
      badges: earnedIds,
      allBadges,
      levelName: currentLevel.name,
      levelProgress: getLevelProgress(progress.xp),
      nextLevelName: nextLevel?.name || null,
      xpToNextLevel: nextLevel ? nextLevel.minXp - progress.xp : 0,
    }
  })
}

export async function POST(req: NextRequest) {
  // Increment technique count
  const user = await getSessionFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  try {
    const body = await req.json()
    if (body.action === 'technique_viewed') {
      const progress = await prisma.gamificationProgress.upsert({
        where: { userId: user.id },
        create: { userId: user.id, level: 1, xp: 0, streak: 0, badges: '[]', techniqueCount: 1 },
        update: { techniqueCount: { increment: 1 } }
      })
      return NextResponse.json({ techniqueCount: progress.techniqueCount })
    }
    return NextResponse.json({ ok: true })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Update mislukt' }, { status: 500 }) }
}
