import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { sanitize } from '@/lib/sanitize'
import { randomUUID } from 'crypto'

type SavedRecipeRow = { id: string; userId: string; name: string; recipeJson: string; savedAt: string }

export async function GET(req: NextRequest) {
  const session = await requireAuth(req)
  if (session instanceof NextResponse) return session

  const recipes = await prisma.$queryRaw<SavedRecipeRow[]>`
    SELECT id, userId, name, recipeJson, savedAt FROM SavedRecipe
    WHERE userId = ${session.id}
    ORDER BY savedAt DESC
  `

  return NextResponse.json({
    recipes: recipes.map(r => ({
      id: r.id,
      name: r.name,
      savedAt: r.savedAt,
      recipe: JSON.parse(r.recipeJson),
    }))
  })
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(req)
  if (session instanceof NextResponse) return session

  const body = await req.json()
  const name = sanitize(body.name || '', 150)
  if (!name || !body.recipe) {
    return NextResponse.json({ error: 'Naam en recept zijn verplicht' }, { status: 400 })
  }

  const recipeJson = JSON.stringify(body.recipe)
  const now = new Date().toISOString()

  // Controleer of er al een recept met deze naam bestaat
  const existing = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM SavedRecipe WHERE userId = ${session.id} AND name = ${name} LIMIT 1
  `

  if (existing.length > 0) {
    await prisma.$executeRaw`
      UPDATE SavedRecipe SET recipeJson = ${recipeJson}, savedAt = ${now} WHERE id = ${existing[0].id}
    `
    return NextResponse.json({ id: existing[0].id, updated: true })
  }

  const id = randomUUID()
  await prisma.$executeRaw`
    INSERT INTO SavedRecipe (id, userId, name, recipeJson, savedAt) VALUES (${id}, ${session.id}, ${name}, ${recipeJson}, ${now})
  `

  return NextResponse.json({ id, updated: false })
}
