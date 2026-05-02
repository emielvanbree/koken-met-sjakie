// TTS utility — prioriteert hoge kwaliteit Nederlandse stemmen
// Volgorde: Microsoft Neural (Windows) > Google (Chrome) > Apple (macOS) > fallback

export const TTS_STORAGE_KEY = 'kms-preferred-voice'

/** Geeft alle beschikbare stemmen terug, gesorteerd op kwaliteit */
export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return []
  return window.speechSynthesis.getVoices().sort((a, b) => {
    return voiceScore(b) - voiceScore(a)
  })
}

/** Kwaliteitsscore voor een stem (hoger = beter) */
function voiceScore(v: SpeechSynthesisVoice): number {
  let score = 0
  const name = v.name.toLowerCase()

  // Microsoft Neural / Online = beste kwaliteit
  if (name.includes('microsoft') && name.includes('online')) score += 100
  if (name.includes('neural')) score += 80
  if (name.includes('natural')) score += 80
  if (name.includes('microsoft')) score += 40
  // Google voices zijn goed
  if (name.includes('google')) score += 30
  // Geef voorkeur aan Nederlandse stemmen
  if (v.lang.startsWith('nl')) score += 50
  // Lokale stemmen zijn betrouwbaarder dan remote
  if (!v.localService) score -= 5

  return score
}

/** Kiest de beste beschikbare stem — respecteert gebruikersinstellingen */
export function getBestVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined') return null
  const voices = getAvailableVoices()
  if (!voices.length) return null

  // Gebruik opgeslagen voorkeur als die nog beschikbaar is
  try {
    const saved = localStorage.getItem(TTS_STORAGE_KEY)
    if (saved) {
      const found = voices.find(v => v.name === saved)
      if (found) return found
    }
  } catch {}

  // Probeer een Nederlandse stem te vinden
  const dutch = voices.find(v => v.lang.startsWith('nl'))
  if (dutch) return dutch

  // Geen Nederlandse stem gevonden: geef null terug zodat utt.lang het stuurt
  // (beter dan een Engelstalige stem forceren)
  return null
}

/** Spreekt tekst uit met de beste of opgeslagen stem */
export function speak(text: string, onEnd?: () => void): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()

  const utt = new SpeechSynthesisUtterance(text)
  utt.lang = 'nl-NL'
  utt.rate = 0.95
  utt.pitch = 1.0

  const voice = getBestVoice()
  if (voice) utt.voice = voice

  if (onEnd) utt.onend = onEnd
  window.speechSynthesis.speak(utt)
}

/** Stopt huidige spraak */
export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}
