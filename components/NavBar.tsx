'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/vandaag',     emoji: '🌅', label: 'Vandaag'    },
  { href: '/koken',       emoji: '🍳', label: 'Koken'      },
  { href: '/mijn-keuken', emoji: '🛒', label: 'Keuken'     },
  { href: '/dagboek',     emoji: '📖', label: 'Dagboek'    },
  { href: '/mijn-reis',   emoji: '🏆', label: 'Mijn Reis'  },
]

export default function NavBar() {
  const path = usePathname()
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'white', borderTop: '1px solid #F0F0F0',
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      padding: '8px 0', paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
      zIndex: 100, boxShadow: '0 -4px 20px rgba(0,0,0,0.06)',
    }}>
      {TABS.map(tab => {
        const active = path.startsWith(tab.href)
        return (
          <Link key={tab.href} href={tab.href} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            padding: '4px 12px', borderRadius: 12, textDecoration: 'none',
            color: active ? 'var(--kms-orange)' : '#AAA',
            fontWeight: active ? 700 : 400,
            transition: 'all 0.15s',
            background: active ? '#FFF3EE' : 'transparent',
          }}>
            <span style={{ fontSize: 22 }}>{tab.emoji}</span>
            <span style={{ fontSize: 11 }}>{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
