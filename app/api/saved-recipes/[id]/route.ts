import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

type SavedRecipeRow = { id: string; userId: string }

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(req)
  if (session instanceof NextResponse) return session

  const { id } = await params

  const rows = await prisma.$queryRaw<SavedRecipeRow[]>`
    SELECT id, userId FROM SavedRecipe WHERE id = ${id} LIMIT 1
  `

  if (!rows.length || rows[0].userId !== session.id) {
    return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  }

  await prisma.$executeRaw`DELETE FROM SavedRecipe WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}
