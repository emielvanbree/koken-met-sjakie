import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/auth'
import { sanitize } from '@/lib/sanitize'

export async function GET(req: NextRequest) {
  const user = await getSessionFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  const lists = await prisma.shoppingList.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ lists: lists.map(l => ({ ...l, items: JSON.parse(l.items) })) })
}

export async function POST(req: NextRequest) {
  const user = await getSessionFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  try {
    const body = await req.json()
    const name = sanitize(body.name || 'Boodschappenlijst', 150)
    const items = Array.isArray(body.items) ? body.items : []
    const list = await prisma.shoppingList.create({ data: { userId: user.id, name, items: JSON.stringify(items) } })
    return NextResponse.json({ list: { ...list, items } })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Opslaan mislukt' }, { status: 500 }) }
}

export async function PUT(req: NextRequest) {
  const user = await getSessionFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  try {
    const body = await req.json()
    const list = await prisma.shoppingList.findFirst({ where: { id: body.id, userId: user.id } })
    if (!list) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
    const updated = await prisma.shoppingList.update({ where: { id: body.id }, data: { items: JSON.stringify(body.items) } })
    return NextResponse.json({ list: { ...updated, items: body.items } })
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Update mislukt' }, { status: 500 }) }
}
