import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
export async function GET(req: NextRequest) {
  const user = await getSessionFromRequest(req)
  return NextResponse.json({ user: user || null })
}
