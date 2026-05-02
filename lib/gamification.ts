export const BADGES = [
  { id: 'eerste_gerecht',   name: 'Eerste Gerecht',        emoji: '🍽️',  desc: 'Eerste gerecht afgemaakt!' },
  { id: 'smaakavonturier',  name: 'Smaakavonturier',       emoji: '🌍',  desc: '5 verschillende keukens geprobeerd' },
  { id: 'vuurdoper',        name: 'Vuurdoper',              emoji: '🔥',  desc: 'Eerste moeilijkheid 3+ gerecht gemaakt' },
  { id: 'paniekvrij',       name: 'Paniekvrij',             emoji: '😎',  desc: '10 gerechten zonder paniekknop' },
  { id: 'snelle_kok',       name: 'Snelle Kok',             emoji: '⚡',  desc: 'Gerecht in minder dan 30 minuten' },
  { id: 'weekstrijder',     name: 'Weekstrijder',           emoji: '📅',  desc: '7 dagen streak gehaald!' },
  { id: 'marathonkok',      name: 'Marathonkok',            emoji: '🏆',  desc: '30 gerechten gekookt' },
  { id: 'techniekmeester',  name: 'Techniekmeester',        emoji: '📚',  desc: '20x techniek-uitleg gelezen' },
  { id: 'gezinskok',        name: 'Gezinskok',              emoji: '👨‍👩‍👧‍👦', desc: 'Gerecht voor 4+ personen gemaakt' },
  { id: 'nachtkok',         name: 'Nachtkok',               emoji: '🌙',  desc: 'Gerecht na 20:00 gemaakt' },
  { id: 'ontdekkingsreiziger', name: 'Ontdekkingsreiziger', emoji: '🧭',  desc: '10 AI-recepten geprobeerd' },
  { id: 'perfectionist',    name: 'Perfectionist',          emoji: '⭐',  desc: '5x een 5-sterren beoordeling gegeven' },
  { id: 'sterrenkok_beeld', name: 'Sterrenkok in beeld',    emoji: '📸',  desc: 'Eerste foto geüpload van je gerecht' },
  { id: 'food_paparazzi',   name: 'Food Paparazzi',         emoji: '🎞️',  desc: '5 foto\'s geüpload' },
  { id: 'masterchef_geheugen', name: 'Masterchef Geheugen', emoji: '🌟',  desc: '10 dagboek-entries met foto én beoordeling' },
]

export const LEVELS = [
  { level: 1, name: 'Keukenhulp',   minXp: 0,    maxXp: 100  },
  { level: 2, name: 'Thuiskok',     minXp: 100,  maxXp: 300  },
  { level: 3, name: 'Smaakmaker',   minXp: 300,  maxXp: 600  },
  { level: 4, name: 'Souschef',     minXp: 600,  maxXp: 1000 },
  { level: 5, name: 'Sterrenniveau',minXp: 1000, maxXp: 9999 },
]

export function calculateXp(difficulty: number, hasPhoto: boolean, rating: number): number {
  return difficulty * 10 + (hasPhoto ? 15 : 0) + (rating === 5 ? 10 : 0)
}

export function getLevel(xp: number) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].minXp) return LEVELS[i]
  }
  return LEVELS[0]
}

export function getLevelProgress(xp: number): number {
  const lvl = getLevel(xp)
  const range = lvl.maxXp - lvl.minXp
  const progress = xp - lvl.minXp
  return Math.min(100, Math.round((progress / range) * 100))
}

export interface BadgeCheckInput {
  totalDishes: number
  cuisines: string[]
  maxDifficulty: number
  panicFreeStreak: number
  minCookDuration: number
  streak: number
  techniqueCount: number
  servings: number
  cookedAtHour: number
  photoCount: number
  ratingFives: number
  photoWithRatingCount: number
  earnedBadges: string[]
}

export function checkNewBadges(input: BadgeCheckInput): string[] {
  const newBadges: string[] = []
  const earned = new Set(input.earnedBadges)

  const check = (id: string, condition: boolean) => {
    if (condition && !earned.has(id)) newBadges.push(id)
  }

  check('eerste_gerecht',      input.totalDishes >= 1)
  check('smaakavonturier',     new Set(input.cuisines).size >= 5)
  check('vuurdoper',           input.maxDifficulty >= 3)
  check('paniekvrij',          input.panicFreeStreak >= 10)
  check('snelle_kok',          input.minCookDuration > 0 && input.minCookDuration <= 30)
  check('weekstrijder',        input.streak >= 7)
  check('marathonkok',         input.totalDishes >= 30)
  check('techniekmeester',     input.techniqueCount >= 20)
  check('gezinskok',           input.servings >= 4)
  check('nachtkok',            input.cookedAtHour >= 20)
  check('ontdekkingsreiziger', input.totalDishes >= 10)
  check('perfectionist',       input.ratingFives >= 5)
  check('sterrenkok_beeld',    input.photoCount >= 1)
  check('food_paparazzi',      input.photoCount >= 5)
  check('masterchef_geheugen', input.photoWithRatingCount >= 10)

  return newBadges
}
