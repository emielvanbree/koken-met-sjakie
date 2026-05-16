import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'koken-met-sjakie-dev-secret-change-in-production'
)
const COOKIE_NAME = 'kms-session'

export interface SessionUser {
  id: string
  email: string
  name?: string | null
}

export async function signToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(JWT_SECRET)
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as SessionUser
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return null
    return verifyToken(token)
  } catch {
    return null
  }
}

export async function getSessionFromRequest(req: NextRequest): Promise<SessionUser | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifyToken(token)
}

export function setSessionCookie(token: string): Record<string, string> {
  return {
    'Set-Cookie': `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
  }
}

export function clearSessionCookie(): Record<string, string> {
  return {
    'Set-Cookie': `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
  }
}

export async function requireAuth(req: NextRequest): Promise<SessionUser | NextResponse> {
  const user = await getSessionFromRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }
  return user
}
