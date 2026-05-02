import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signToken, setSessionCookie } from '@/lib/auth'
import { sanitize } from '@/lib/sanitize'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = sanitize(body.email, 200).toLowerCase()
    const password = sanitize(body.password, 200)
    const name = sanitize(body.name || '', 100)
    if (!email || !password) return NextResponse.json({ error: 'Email en wachtwoord zijn verplicht' }, { status: 400 })
    if (password.length < 8) return NextResponse.json({ error: 'Wachtwoord moet minimaal 8 tekens zijn' }, { status: 400 })
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return NextResponse.json({ error: 'Dit e-mailadres is al in gebruik' }, { status: 409 })
    const hashed = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({ data: { email, password: hashed, name: name || null } })
    await prisma.gamificationProgress.create({ data: { userId: user.id, level: 1, xp: 0, streak: 0, badges: '[]' } })
    const token = await signToken({ id: user.id, email: user.email, name: user.name })
    const res = NextResponse.json({ success: true, user: { id: user.id, email: user.email, name: user.name } })
    res.headers.set('Set-Cookie', setSessionCookie(token)['Set-Cookie'])
    return res
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Er is een fout opgetreden' }, { status: 500 }) }
}
