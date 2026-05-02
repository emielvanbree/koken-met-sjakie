# Koken met Sjakie — Setup Instructies

## Vereisten
- **Node.js 18 of hoger** → https://nodejs.org
- **Internet** (eerste keer, voor npm install)
- **Anthropic API key** (al ingesteld in .env.local)

## Starten (Windows)

### Optie A: Dubbelklik
Dubbelklik op **`start.bat`** in deze map.

### Optie B: PowerShell
```powershell
.\start.ps1
```

### Optie C: Handmatig
```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

## App openen
Ga naar **http://localhost:3000** in je browser.

## Wat de app doet
1. **Vandaag** — Mood check-in → AI geeft 3 receptsuggesties → jij kiest
2. **Koken** — Stap-voor-stap met automatische timers, paniekknop, techniek-uitleg
3. **Mijn Keuken** — Boodschappenlijst gesorteerd op supermarktafdeling
4. **Dagboek** — Al je gekookte gerechten met foto's en statistieken
5. **Mijn Reis** — 5 niveaus, 15 badges, streak-teller

## Eerste gebruik
1. Ga naar http://localhost:3000
2. Kies "Doorgaan zonder account" of maak een account aan
3. Beantwoord de mood check-in → druk op "Verras me!"
4. Kies een recept en begin met koken

## Problemen?
- **Poort 3000 bezet**: zet `"dev": "next dev -p 3001"` in package.json
- **Database fout**: verwijder `prisma/dev.db` en run `npx prisma db push` opnieuw
- **API fout**: controleer `.env.local` heeft de juiste `ANTHROPIC_API_KEY`
