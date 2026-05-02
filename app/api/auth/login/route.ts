import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signToken, setSessionCookie } from '@/lib/auth'
import { sanitize } from '@/lib/sanitize'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'local'
  if (!rateLimit(`login:${ip}`, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Te veel pogingen. Probeer later opnieuw.' }, { status: 429 })
  }
  try {
    const body = await req.json()
    const email = sanitize(body.email, 200).toLowerCase()
    const password = sanitize(body.password, 200)
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return NextResponse.json({ error: 'Onjuist e-mailadres of wachtwoord' }, { status: 401 })
    }
    const token = await signToken({ id: user.id, email: user.email, name: user.name })
    const res = NextResponse.json({ success: true, user: { id: user.id, email: user.email, name: user.name } })
    res.headers.set('Set-Cookie', setSessionCookie(token)['Set-Cookie'])
    return res
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Er is een fout opgetreden' }, { status: 500 }) }
}
