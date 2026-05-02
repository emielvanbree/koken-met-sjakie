import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/auth'
import { sanitize, sanitizeNumber } from '@/lib/sanitize'
import { checkNewBadges, calculateXp, getLevel, BADGES } from '@/lib/gamification'

export async function GET(req: NextRequest) {
  const user = await getSessionFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  const entries = await prisma.diaryEntry.findMany({
    where: { userId: user.id },
    orderBy: { date: 'desc' },
  })
  return NextResponse.json({ entries: entries.map(e => ({
    ...e,
    badgesEarned: JSON.parse(e.badgesEarned),
    recipeJson: JSON.parse(e.recipeJson),
  })) })
}

export async function POST(req: NextRequest) {
  const user = await getSessionFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  try {
    const body = await req.json()
    const dishName = sanitize(body.dishName, 150)
    const cuisine = sanitize(body.cuisine || 'Overig', 100)
    const cookDuration = sanitizeNumber(body.cookDuration, 0, 480)
    const difficulty = sanitizeNumber(body.difficulty, 1, 5)
    const servings = sanitizeNumber(body.servings, 1, 20)
    const rating = body.rating ? sanitizeNumber(body.rating, 1, 5) : null
    const emoji = sanitize(body.emoji || '', 10)
    const notes = sanitize(body.notes || '', 2000)
    const imagePath = sanitize(body.imagePath || '', 500)
    const usedPanic = Boolean(body.usedPanic)

    const entry = await prisma.diaryEntry.create({
      data: {
        userId: user.id, dishName, cuisine, cookDuration, difficulty, servings,
        rating, emoji: emoji || null, notes: notes || null,
        imagePath: imagePath || null, usedPanic,
        recipeJson: JSON.stringify(body.recipeJson || {}),
        badgesEarned: '[]',
      }
    })

    // Gamification: calculate XP + check badges
    let gamification = await prisma.gamificationProgress.findUnique({ where: { userId: user.id } })
    if (!gamification) {
      gamification = await prisma.gamificationProgress.create({ data: { userId: user.id, level: 1, xp: 0, streak: 0, badges: '[]' } })
    }

    const allEntries = await prisma.diaryEntry.findMany({ where: { userId: user.id } })
    const earnedBadges: string[] = JSON.parse(gamification.badges)
    const cuisines = allEntries.map(e => e.cuisine)
    const maxDiff = Math.max(...allEntries.map(e => e.difficulty))
    const nopanicCount = allEntries.filter(e => !e.usedPanic).length
    const minDur = Math.min(...allEntries.filter(e => e.cookDuration > 0).map(e => e.cookDuration))
    const ratingFives = allEntries.filter(e => e.rating === 5).length
    const photoCount = allEntries.filter(e => e.imagePath).length
    const photoWithRating = allEntries.filter(e => e.imagePath && e.rating).length
    const now = new Date()
    const cookedHour = now.getHours()

    // Streak calculation
    let newStreak = gamification.streak
    if (gamification.lastCookedAt) {
      const last = new Date(gamification.lastCookedAt)
      const diffDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
      newStreak = diffDays <= 1 ? gamification.streak + 1 : 1
    } else {
      newStreak = 1
    }

    const newBadgeIds = checkNewBadges({
      totalDishes: allEntries.length,
      cuisines, maxDifficulty: maxDiff,
      panicFreeStreak: nopanicCount,
      minCookDuration: minDur,
      streak: newStreak,
      techniqueCount: gamification.techniqueCount,
      servings, cookedAtHour: cookedHour,
      photoCount, ratingFives,
      photoWithRatingCount: photoWithRating,
      earnedBadges,
    })

    const allBadges = [...earnedBadges, ...newBadgeIds]
    const xpGain = calculateXp(difficulty, !!imagePath, rating || 0)
    const newXp = gamification.xp + xpGain
    const newLevel = getLevel(newXp)

    await prisma.gamificationProgress.update({
      where: { userId: user.id },
      data: { xp: newXp, level: newLevel.level, streak: newStreak, lastCookedAt: now, badges: JSON.stringify(allBadges), photoCount }
    })
    await prisma.diaryEntry.update({ where: { id: entry.id }, data: { badgesEarned: JSON.stringify(newBadgeIds) } })

    const newBadgeDetails = BADGES.filter(b => newBadgeIds.includes(b.id))
    return NextResponse.json({ entry: { ...entry, badgesEarned: newBadgeIds }, newBadges: newBadgeDetails, xpGained: xpGain, leveledUp: newLevel.level > gamification.level, newLevel: newLevel })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Opslaan mislukt' }, { status: 500 }) }
}
