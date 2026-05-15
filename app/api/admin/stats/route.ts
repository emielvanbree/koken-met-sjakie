import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const secret = process.env.ADMIN_TOKEN || process.env.JWT_SECRET || ''
  if (!token || token !== secret) {
    return NextResponse.json({ error: 'Ongeautoriseerd' }, { status: 401 })
  }

  const [userCount, users, diaryCount, recentDiary] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
      select: { id: true, email: true, name: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.diaryEntry.count(),
    prisma.diaryEntry.findMany({
      select: { dishName: true, rating: true, createdAt: true, user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  return NextResponse.json({ userCount, users, diaryCount, recentDiary })
}
