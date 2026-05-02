export interface RecipeSuggestion {
  naam: string
  moeilijkheid: number
  bereidingstijd: number
  waarom_dit_past: string
  top_ingredienten: string[]
  avontuursscore: number
  keuken_type: string
  niveau_vereist: number
}

export interface Timer {
  id: string
  componentNaam: string
  duurSeconden: number
  resterendSeconden: number
  type: 'koken' | 'bakken' | 'rijzen' | 'marineren' | 'wachten' | 'afkoelen'
  actief: boolean
  voltooid: boolean
}

export interface RecipeStep {
  stap_nummer: number
  instructie: string
  ingredienten_deze_stap: string[]
  heeft_timer: boolean
  timer?: {
    duur_seconden: number
    component_naam: string
    type: string
  }
  techniek_uitleg?: string | null
  proactieve_tip?: {
    type: string
    tekst: string
  } | null
}

export interface Ingredient {
  naam: string
  hoeveelheid: number
  eenheid: string
  winkel_sectie: string
  is_substituut: boolean
}

export interface Recipe {
  naam: string
  beschrijving: string
  bereidingstijd: number
  moeilijkheid: number
  porties: number
  keuken_type: string
  ingredienten: Ingredient[]
  stappen: RecipeStep[]
  chef_tip?: string
  badges_mogelijk?: string[]
}

export interface DiaryEntry {
  id: string
  dishName: string
  cuisine: string
  date: string
  cookDuration: number
  difficulty: number
  servings: number
  rating?: number
  emoji?: string
  notes?: string
  imagePath?: string
  badgesEarned: string[]
  recipeJson: Recipe
  usedPanic: boolean
}

export interface GamificationProgress {
  level: number
  xp: number
  streak: number
  lastCookedAt?: string
  badges: string[]
  techniqueCount: number
  photoCount: number
}

export interface ShoppingItem {
  id: string
  naam: string
  hoeveelheid: number
  eenheid: string
  winkel_sectie: string
  gecheckt: boolean
}

export interface MoodCheckIn {
  tijd?: string
  aantalPersonen?: string
  stemming?: string
  keuken?: string
}
