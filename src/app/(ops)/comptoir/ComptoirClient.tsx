'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { fmtPrix } from '@/lib/service'
import { ACCENTS, CAT_EMOJI, type ComptoirDef } from '@/lib/comptoir/config'
import type { ProduitComptoir } from './[slug]/page'
import { creerCommandeComptoir } from './actions'

type LignePanier = { produit: ProduitComptoir; qte: number }

/** Coordonnées de livraison saisies pour une commande téléphonique. */
type FormLivraison = { nom: string; telephone: string; adresse: string; commune: string }

export default function ComptoirClient({
  config, produits, livraison,
}: {
  config: ComptoirDef
  produits: ProduitComptoir[]
  /** Config de livraison — absente si le module livraison est éteint,
   *  auquel cas le bloc « à livrer » n'apparaît pas du tout. */
  livraison?: { communes: string[]; heureLimite: string; heureTournee: string } | null
}) {
  const router = useRouter()
  const a = ACCENTS[config.accent]
  const [panier, setPanier] = useState<Map<string, LignePanier>>(new Map())
  const [cat, setCat] = useState<string>('Tous')
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; texte: string } | null>(null)

  const [aLivrer, setALivrer] = useState(false)
  const [form, setForm] = useState<FormLivraison>({
    nom: '', telephone: '', adresse: '', commune: livraison?.communes[0] ?? '',
  })
  const livraisonComplete =
    form.nom.trim().length > 0 && form.telephone.trim().length > 0 &&
    form.adresse.trim().length > 4 && form.commune.trim().length > 0

  const categories = useMemo(() => ['Tous', ...Array.from(new Set(produits.map(p => p.categorie)))], [produits])
  const affiches = cat === 'Tous' ? produits : produits.filter(p => p.categorie === cat)

  const lignes = Array.from(panier.values())
  const totalTtc = lignes.reduce((s, l) => s + l.produit.prix_ttc * l.qte, 0)
  const nbArticles = lignes.reduce((s, l) => s + l.qte, 0)

  function ajouter(p: ProduitComptoir) {
    setPanier(prev => {
      const m = new Map(prev)
      const cur = m.get(p.id)
      m.set(p.id, { produit: p, qte: (cur?.qte ?? 0) + 1 })
      return m
    })
  }
  function modifierQte(id: string, delta: number) {
    setPanier(prev => {
      const m = new Map(prev)
      const cur = m.get(id)
      if (!cur) return m
      const q = cur.qte + delta
      if (q <= 0) m.delete(id); else m.set(id, { ...cur, qte: q })
      return m
    })
  }

  function valider() {
    if (lignes.length === 0) return
    if (aLivrer && !livraisonComplete) {
      setMsg({ ok: false, texte: 'Complète les coordonnées de livraison.' })
      setTimeout(() => setMsg(null), 4000)
      return
    }
    start(async () => {
      const r = await creerCommandeComptoir({
        slug: config.slug,
        articles: lignes.map(l => ({
          recette_id: l.produit.id,
          quantite: l.qte,
          prix_unitaire_ht: l.produit.prix_unitaire_ht,
          tva: l.produit.tva,
        })),
        livraison: aLivrer ? {
          nom: form.nom.trim(),
          telephone: form.telephone.trim(),
          adresse: form.adresse.trim(),
          commune: form.commune.trim(),
        } : null,
      })
      if (r.ok) {
        setMsg({
          ok: true,
          texte: aLivrer
            ? `✓ ${r.numero} — ${fmtPrix(r.total)} · ajoutée à la tournée`
            : `✓ Commande ${r.numero} créée — ${fmtPrix(r.total)}`,
        })
        setPanier(new Map())
        setALivrer(false)
        setForm({ nom: '', telephone: '', adresse: '', commune: livraison?.communes[0] ?? '' })
        router.refresh()
      } else {
        setMsg({ ok: false, texte: `Erreur : ${r.error}` })
      }
      setTimeout(() => setMsg(null), 5000)
    })
  }

  return (
    <div className="min-h-screen pb-mobile-nav bg-[#0D0D0D] text-zinc-100" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Header */}
      <header className="sticky top-0 z-20 bg-gradient-to-b from-zinc-950 to-[#0D0D0D]/95 backdrop-blur border-b border-zinc-800 px-3 sm:px-5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={cn('inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br text-white text-xl shadow-md', a.headerIcon)}>{config.emoji}</span>
            <div>
              <p className={cn('text-[10px] font-black uppercase tracking-[0.2em] leading-none', a.kicker)}>Point de vente</p>
              <h1 className="font-display italic text-xl sm:text-2xl font-medium text-white leading-none mt-0.5">{config.label}</h1>
              <p className="text-[10px] text-zinc-500 mt-0.5">{config.sousTitre}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Link href={`/comptoir/${config.slug}/kds`} className="inline-flex items-center gap-1 px-3 h-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold text-sm active:scale-95" title="Préparation (KDS)">
              <span className="text-lg">🔥</span><span className="hidden sm:inline">Prépa</span>
            </Link>
            <Link href="/service" className="inline-flex items-center gap-1.5 px-3 h-12 rounded-xl bg-zinc-100 hover:bg-white text-zinc-900 font-black text-sm shadow-lg active:scale-95">
              <span className="text-lg">⊞</span><span className="hidden sm:inline">Service</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-3 sm:gap-4 p-3 sm:p-5">
        {/* Catalogue */}
        <div>
          {/* Filtres catégories */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-3 px-3 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categories.map(c => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3.5 h-11 rounded-full text-sm font-bold whitespace-nowrap shrink-0 transition',
                  cat === c ? a.pillActive : 'bg-zinc-900 text-zinc-300 ring-1 ring-zinc-800',
                )}
              >
                {c !== 'Tous' && <span>{CAT_EMOJI[c] ?? '•'}</span>}{c}
              </button>
            ))}
          </div>

          {/* Grille produits */}
          {produits.length === 0 ? (
            <p className="text-center text-zinc-500 py-16">Aucun produit pour ce comptoir. Crée la carte dans Recettes (tag {config.tag}).</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3 mt-1">
              {affiches.map(p => {
                const enPanier = panier.get(p.id)?.qte ?? 0
                return (
                  <button
                    key={p.id}
                    onClick={() => ajouter(p)}
                    className={cn(
                      'relative flex flex-col items-start text-left rounded-2xl bg-zinc-900 ring-1 p-3 min-h-[96px] active:scale-[0.97] transition',
                      enPanier > 0 ? a.cardRing : 'ring-zinc-800',
                    )}
                  >
                    {enPanier > 0 && (
                      <span className={cn('absolute top-2 right-2 inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full text-white text-xs font-black tabular-nums animate-pulse', a.badge)}>×{enPanier}</span>
                    )}
                    <span className="text-2xl leading-none">{CAT_EMOJI[p.categorie] ?? config.emoji}</span>
                    <p className="text-sm font-bold text-zinc-100 mt-2 leading-tight">{p.nom}</p>
                    <p className={cn('font-black tabular-nums mt-auto pt-1', a.price)}>{fmtPrix(p.prix_ttc)}</p>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Panier */}
        <aside className="rounded-2xl bg-zinc-900 ring-1 ring-zinc-800 p-3 sm:p-4 lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-110px)] flex flex-col">
          <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2">🛒 Panier {nbArticles > 0 && `· ${nbArticles}`}</p>
          {lignes.length === 0 ? (
            <p className="text-sm text-zinc-500 italic py-6 text-center">Touche un produit pour l&apos;ajouter.</p>
          ) : (
            <ul className="space-y-2 overflow-y-auto flex-1 -mr-1 pr-1">
              {lignes.map(l => (
                <li key={l.produit.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-100 truncate">{l.produit.nom}</p>
                    <p className="text-[11px] text-zinc-500 tabular-nums">{fmtPrix(l.produit.prix_ttc)} · TVA {l.produit.tva}%</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => modifierQte(l.produit.id, -1)} className="w-9 h-9 rounded-md bg-zinc-800 text-zinc-200 font-black active:scale-95">−</button>
                    <span className="w-6 text-center font-black tabular-nums">{l.qte}</span>
                    <button onClick={() => modifierQte(l.produit.id, 1)} className="w-9 h-9 rounded-md bg-zinc-800 text-zinc-200 font-black active:scale-95">+</button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Commande téléphonique à livrer — rejoint la tournée du jour */}
          {livraison && (
            <div className="border-t border-zinc-800 mt-3 pt-3">
              <button
                type="button"
                onClick={() => setALivrer(v => !v)}
                className={cn(
                  'w-full min-h-[48px] rounded-xl font-black uppercase tracking-wider text-sm transition active:scale-[0.98]',
                  aLivrer
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700',
                )}
              >
                🛵 {aLivrer ? 'À livrer — activé' : 'Commande par téléphone à livrer'}
              </button>

              {aLivrer && (
                <div className="mt-3 space-y-2">
                  <input
                    value={form.nom}
                    onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                    placeholder="Nom du client"
                    className="w-full h-12 px-3 rounded-lg bg-zinc-950 ring-1 ring-zinc-800 text-zinc-100 text-sm outline-none focus:ring-blue-500"
                  />
                  <input
                    value={form.telephone}
                    onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))}
                    placeholder="Téléphone"
                    type="tel"
                    inputMode="tel"
                    className="w-full h-12 px-3 rounded-lg bg-zinc-950 ring-1 ring-zinc-800 text-zinc-100 text-sm outline-none focus:ring-blue-500"
                  />
                  <input
                    value={form.adresse}
                    onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))}
                    placeholder="Adresse (rue, n°, complément)"
                    className="w-full h-12 px-3 rounded-lg bg-zinc-950 ring-1 ring-zinc-800 text-zinc-100 text-sm outline-none focus:ring-blue-500"
                  />
                  {/* Liste fermée : aucune commande hors zone possible. */}
                  <select
                    value={form.commune}
                    onChange={e => setForm(f => ({ ...f, commune: e.target.value }))}
                    className="w-full h-12 px-3 rounded-lg bg-zinc-950 ring-1 ring-zinc-800 text-zinc-100 text-sm outline-none focus:ring-blue-500"
                  >
                    {livraison.communes.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    Avant {livraison.heureLimite.replace(':', 'h')} → tournée du jour même,
                    départ {livraison.heureTournee.replace(':', 'h')}. Après, tournée du lendemain.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="border-t border-zinc-800 mt-3 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Total TTC</span>
              <span className={cn('text-2xl font-black tabular-nums', a.totalPrice)}>{fmtPrix(totalTtc)}</span>
            </div>
            <button
              onClick={valider}
              disabled={pending || lignes.length === 0}
              className={cn('w-full min-h-[56px] rounded-xl text-white font-black uppercase tracking-wider transition active:scale-[0.98] disabled:bg-zinc-800 disabled:text-zinc-500', a.validate)}
            >
              {pending ? 'Création…' : aLivrer ? 'Valider et mettre en tournée' : 'Valider la commande'}
            </button>
            <p className="text-[10px] text-zinc-500 mt-1.5 text-center">L&apos;encaissement se fait sur la caisse agréée.</p>
            {msg && (
              <p className={cn('text-sm font-bold mt-2 text-center', msg.ok ? 'text-emerald-400' : 'text-red-400')}>{msg.texte}</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
