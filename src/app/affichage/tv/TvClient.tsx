'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { type MenuItem, type Promo, SECTION_INFO, fmtPrix } from '@/lib/affichage'

type Meteo = { date_meteo: string; conditions: string; temperature_min: number | null; temperature_max: number | null; est_prevision: boolean }
type Evenement = { id: string; titre: string; type: string | null; date_debut: string; description: string | null }

const METEO_EMOJI: Record<string, string> = {
  ensoleille: '☀️', nuageux: '⛅', pluie: '🌧️', pluie_forte: '🌧️',
  neige: '❄️', orage: '⛈️', brouillard: '🌫️', couvert: '☁️',
}

const ROTATION_MS = 10_000

export default function TvClient({
  menu, promos, meteo, evenements, nomResto,
}: {
  menu: MenuItem[]; promos: Promo[]; meteo: Meteo[]; evenements: Evenement[]; nomResto: string
}) {
  const router = useRouter()
  const [now, setNow] = useState(new Date())
  const [activeIdx, setActiveIdx] = useState(0)

  // Liste dynamique des écrans à afficher (skip écrans vides)
  const ecrans: Array<'menu' | 'meteo' | 'evenements' | 'promos'> = []
  if (menu.length)       ecrans.push('menu')
  if (meteo.length)      ecrans.push('meteo')
  if (evenements.length) ecrans.push('evenements')
  if (promos.length)     ecrans.push('promos')
  if (ecrans.length === 0) ecrans.push('menu') // toujours au moins un écran

  const ecranActif = ecrans[activeIdx % ecrans.length]

  // Horloge en haut à droite
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  // Rotation auto
  useEffect(() => {
    if (ecrans.length <= 1) return
    const iv = setInterval(() => setActiveIdx(i => (i + 1) % ecrans.length), ROTATION_MS)
    return () => clearInterval(iv)
  }, [ecrans.length])

  // Realtime : refresh sur menu/promos
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel('tv-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_du_jour' }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'affichage_promos' }, () => router.refresh())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [router])

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-stone-900 via-stone-800 to-emerald-900 text-white overflow-hidden">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 px-12 py-6 flex items-center justify-between z-10">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{nomResto}</h1>
          <p className="text-zinc-300 text-lg">{format(now, 'EEEE d MMMM yyyy', { locale: fr })}</p>
        </div>
        <div className="text-right">
          <div className="text-6xl font-bold tabular-nums">{format(now, 'HH:mm')}</div>
          <div className="text-sm text-zinc-400 mt-1">
            {ecrans.length > 1 && (
              <span>Écran {(activeIdx % ecrans.length) + 1} / {ecrans.length}</span>
            )}
          </div>
        </div>
      </header>

      {/* Contenu écran actif */}
      <main className="absolute inset-0 pt-32 pb-12 px-12 flex items-center justify-center">
        {ecranActif === 'menu' && <EcranMenu menu={menu} />}
        {ecranActif === 'meteo' && <EcranMeteo meteo={meteo} />}
        {ecranActif === 'evenements' && <EcranEvenements evenements={evenements} />}
        {ecranActif === 'promos' && <EcranPromos promos={promos} />}
      </main>

      {/* Indicateurs rotation */}
      {ecrans.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
          {ecrans.map((_, i) => (
            <div key={i} className={`h-2 w-12 rounded-full transition-all ${i === activeIdx % ecrans.length ? 'bg-emerald-400' : 'bg-white/30'}`} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Écran Menu ────────────────────────────────────────────────
function EcranMenu({ menu }: { menu: MenuItem[] }) {
  if (menu.length === 0) {
    return <div className="text-center text-zinc-300"><h2 className="text-6xl font-bold mb-4">🍽️</h2><p className="text-2xl">Menu en cours de préparation…</p></div>
  }
  const sections = (['entree', 'plat', 'dessert', 'boisson', 'autre'] as const)
    .map(s => ({ section: s, items: menu.filter(m => m.section === s) }))
    .filter(g => g.items.length > 0)

  return (
    <div className="w-full max-w-6xl">
      <h2 className="text-5xl font-bold mb-8 text-center">🍽️ Menu du jour</h2>
      <div className={`grid grid-cols-${Math.min(sections.length, 3)} gap-8`}>
        {sections.map(g => (
          <div key={g.section} className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
            <h3 className="text-2xl font-bold mb-4 text-emerald-300">
              {SECTION_INFO[g.section].emoji} {SECTION_INFO[g.section].label}
            </h3>
            <ul className="space-y-3">
              {g.items.map(it => (
                <li key={it.id} className="border-b border-white/10 pb-3 last:border-0">
                  <div className="flex justify-between items-baseline gap-3">
                    <span className="font-semibold text-lg">{it.titre}</span>
                    {it.prix != null && <span className="text-emerald-300 font-bold whitespace-nowrap">{fmtPrix(it.prix)}</span>}
                  </div>
                  {it.description && <p className="text-zinc-300 text-sm mt-1">{it.description}</p>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Écran Météo ────────────────────────────────────────────────
function EcranMeteo({ meteo }: { meteo: Meteo[] }) {
  return (
    <div className="w-full max-w-4xl text-center">
      <h2 className="text-5xl font-bold mb-12">🌤️ Météo</h2>
      <div className="grid grid-cols-3 gap-6">
        {meteo.map((m, i) => (
          <div key={m.date_meteo} className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
            <p className="text-zinc-300 mb-3 text-lg">
              {i === 0 ? "Aujourd'hui" : format(parseISO(m.date_meteo), 'EEEE', { locale: fr })}
            </p>
            <div className="text-8xl mb-3">{METEO_EMOJI[m.conditions] ?? '🌤️'}</div>
            <p className="capitalize text-xl mb-2">{m.conditions.replace('_', ' ')}</p>
            {m.temperature_min != null && m.temperature_max != null && (
              <p className="text-2xl font-bold">
                {Math.round(m.temperature_min)}° / {Math.round(m.temperature_max)}°
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Écran Événements ──────────────────────────────────────────
function EcranEvenements({ evenements }: { evenements: Evenement[] }) {
  return (
    <div className="w-full max-w-5xl">
      <h2 className="text-5xl font-bold mb-12 text-center">📅 Prochains événements</h2>
      <div className="space-y-6">
        {evenements.map(e => (
          <div key={e.id} className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 flex items-center gap-6">
            <div className="text-emerald-300 font-bold text-3xl text-center w-32 shrink-0">
              <div>{format(parseISO(e.date_debut), 'd', { locale: fr })}</div>
              <div className="text-base capitalize">{format(parseISO(e.date_debut), 'MMM', { locale: fr })}</div>
              <div className="text-sm text-zinc-300 mt-1">{format(parseISO(e.date_debut), 'HH:mm')}</div>
            </div>
            <div className="flex-1">
              <h3 className="text-2xl font-bold mb-1">{e.titre}</h3>
              {e.type && <p className="text-emerald-300 capitalize text-sm mb-1">{e.type}</p>}
              {e.description && <p className="text-zinc-300">{e.description}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Écran Promos ──────────────────────────────────────────────
function EcranPromos({ promos }: { promos: Promo[] }) {
  // Affiche la première promo actuelle en grand
  const p = promos[0]
  return (
    <div className="w-full max-w-5xl text-center">
      <h2 className="text-5xl font-bold mb-12">✨ À l'affiche</h2>
      <div className="bg-gradient-to-br from-emerald-600/40 to-amber-500/30 backdrop-blur-sm rounded-3xl p-12 border border-white/20">
        {p.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image_url} alt={p.titre} className="max-h-64 mx-auto mb-8 rounded-xl object-cover" />
        )}
        <h3 className="text-6xl font-bold mb-6">{p.titre}</h3>
        {p.description && <p className="text-2xl text-zinc-100">{p.description}</p>}
      </div>
      {promos.length > 1 && (
        <p className="text-sm text-zinc-400 mt-6">+ {promos.length - 1} autre{promos.length > 2 ? 's' : ''} promo{promos.length > 2 ? 's' : ''}</p>
      )}
    </div>
  )
}
