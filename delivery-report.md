# Koken met Sjakie — Delivery Report
**Opgeleverd door Autonomous Dev | 2026-05-02**

---

## ✅ Status: Gereed voor gebruik

De app is volledig gebouwd en klaar om te starten met `start.bat`.

---

## Wat er gebouwd is

### 5 Kamers (volledig functioneel)

| Kamer | Features |
|-------|----------|
| 🌅 **Vandaag** | Mood check-in (tijd/personen/stemming/keuken) → 3 AI-suggesties → ingrediëntencheck → recept genereren |
| 🍳 **Koken** | Stap-voor-stap, 6 simultane timers met countdown-ringen, paniekknop met AI-rescue, techniek-uitleg, proactieve tips, voice TTS, foto-upload + beoordeling |
| 🛒 **Mijn Keuken** | Auto boodschappenlijst (gesorteerd op supermarktafdeling), afvinken, delen via WhatsApp/clipboard, handmatig toevoegen/verwijderen |
| 📖 **Dagboek** | Chronologische kaarten met foto's, moeilijkheidsgrafiek (SVG), statistieken (totaal, kooktijd, gem. score) |
| 🏆 **Mijn Reis** | 5 niveaus, 15 badges, streak-teller, XP-voortgangsbalk, vergrendelde badges als motivatie |

### AI-functionaliteit (5 Claude endpoints)

| Endpoint | Functie |
|----------|---------|
| `/api/ai/suggest-recipes` | 3 gepersonaliseerde receptsuggesties op basis van mood check-in |
| `/api/ai/generate-recipe` | Volledig recept met stappen, timers, technieken, tips |
| `/api/ai/panic` | Directe redding bij kooknoodgevallen |
| `/api/ai/technique` | Jargonvrije uitleg van kooktechnieken |
| `/api/ai/substitutions` | Vervangingen voor ontbrekende ingrediënten |

### Gamification (15 badges)

| # | Badge | Trigger |
|---|-------|---------|
| 1 | 🍽️ Eerste Gerecht | 1e gerecht afgemaakt |
| 2 | 🌍 Smaakavonturier | 5 verschillende keukens |
| 3 | 🔥 Vuurdoper | Eerste moeilijkheid 3+ gerecht |
| 4 | 😎 Paniekvrij | 10 gerechten zonder paniekknop |
| 5 | ⚡ Snelle Kok | Gerecht in <30 minuten |
| 6 | 📅 Weekstrijder | 7 dagen streak |
| 7 | 🏆 Marathonkok | 30 gerechten totaal |
| 8 | 📚 Techniekmeester | 20x techniek-uitleg bekeken |
| 9 | 👨‍👩‍👧‍👦 Gezinskok | Gerecht voor 4+ personen |
| 10 | 🌙 Nachtkok | Gerecht na 20:00 |
| 11 | 🧭 Ontdekkingsreiziger | 10 AI-recepten geprobeerd |
| 12 | ⭐ Perfectionist | 5x 5-sterren beoordeling |
| 13 | 📸 Sterrenkok in beeld | Eerste foto geüpload |
| 14 | 🎞️ Food Paparazzi | 5 foto's geüpload |
| 15 | 🌟 Masterchef Geheugen | 10 entries met foto + beoordeling |

### Technische specificaties

| Onderdeel | Keuze | Reden |
|-----------|-------|-------|
| Framework | Next.js 16 (App Router) | FD-spec, mobile-first PWA |
| Database | SQLite via Prisma | Geen externe service nodig voor localhost |
| Auth | Custom JWT (jose + bcryptjs) | Volledig lokaal, geen externe OAuth service |
| AI | Anthropic Claude (claude-sonnet-4-20250514) | FD-spec |
| Styling | Tailwind CSS + inline styles | Snelle, consistente mobile-first UI |
| Charts | Inline SVG | Geen externe library nodig |
| Opslag | Lokale bestanden `/public/uploads/` | Eenvoudig, vervangbaar door cloud |

### Security

- ✅ CSP headers (XSS preventie)
- ✅ X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- ✅ Input sanitisatie op alle user inputs
- ✅ Prompt injection preventie (XML-tagged user input)
- ✅ Rate limiting (in-memory) op alle AI-endpoints
- ✅ Server-side JWT verificatie op alle auth-vereiste routes
- ✅ bcrypt wachtwoord hashing (cost factor 12)
- ✅ HttpOnly, SameSite=Strict session cookies
- ✅ API keys uitsluitend server-side

---

## Starten

```
start.bat
```

Of handmatig:
```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Open: **http://localhost:3000**

---

## Naar productie (later)

| Stap | Actie |
|------|-------|
| Database | Vervang SQLite door Supabase (verander `DATABASE_URL` in `.env.local`) |
| Auth | Voeg Google OAuth toe via Supabase Auth of NextAuth |
| Opslag | Vervang `/public/uploads` door Supabase Storage of Vercel Blob |
| Deployment | `vercel deploy` |
| Secrets | Zet `ANTHROPIC_API_KEY` in Vercel environment variables |

---

## Projectstructuur

```
kms-app/
├── app/               # Next.js App Router pagina's
│   ├── api/           # 10 API routes (auth + AI + data)
│   ├── vandaag/       # Mood check-in & suggesties
│   ├── koken/         # Kookbegeleiding + timers
│   ├── mijn-keuken/   # Boodschappenlijst
│   ├── dagboek/       # Kookhistorie
│   └── mijn-reis/     # Gamification
├── components/        # NavBar + herbruikbare UI
├── lib/               # prisma, auth, claude, gamification, sanitize, rate-limit
├── prisma/            # Schema (SQLite)
├── types/             # TypeScript interfaces
├── public/uploads/    # Gebruikersfotos
├── .env.local         # API key + secrets (nooit committen)
├── start.bat          # Windows start script
└── start.ps1          # PowerShell start script
```

---

*53 bestanden · 2551 regels code · 1 git commit*
*Gebouwd door Autonomous Dev voor Emiel van Bree*
