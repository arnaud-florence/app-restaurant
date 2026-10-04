'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import { PillTab, PillCount, PillDivider } from '@/components/ui/PillTab'

import {
  type Ingredient, type Mouvement,
  statutStock, STATUT_STOCK_STYLE, valeurStock, alertesDLC, listeCourses, bilanInvendusMois,
  TYPE_MOUVEMENT_LABEL, fmtPrix, fmtQte,
} from '@/lib/stock'
import { sortieManuelle } from './actions'
import type { ProduitEnStock, Origine } from './types'


import EntreeModal from './EntreeModal'
import PerteModal from './PerteModal'
import InventaireModal from './InventaireModal'
import ListeCoursesModal from './ListeCoursesModal'

type ActionKind = 'entree' | 'perte' | 'inventaire' | 'courses' | null

export default function StockClient({
  ingredients, produits = [], origines = {}, comptages = [], sansPrix = 0,
  mouvements, jamaisComptes = [], masques = 0, horsSuivi = 0,
}: {
  ingredients: Ingredient[]
  mouvements: Mouvement[]
  /** Ids dont le stock n'a JAMAIS été compté — différent d'un stock à zéro. */
  jamaisComptes?: string[]
  /** Combien de matières à zéro ne sont pas affichées. Dit, jamais tu. */
  masques?: number
  /** Matières qu'aucun inventaire ne suit (`stocke = false`) : rien ne peut
   *  leur donner un stock, donc elles ne figurent pas dans cette liste. */
  horsSuivi?: number
  /** ⚠️ Les PRODUITS REVENDUS en réserve (bouteilles, fûts, canettes). En
   *  achat-revente ils portent l'essentiel du stock et vivent dans
   *  `recettes` : sans eux cet écran montrait 9 références sur 45. Lecture
   *  seule — les trois gestes du module 7 visent `ingredient_id`. */
  produits?: ProduitEnStock[]
  /** D'où vient le chiffre de chaque ligne : comptage + livraisons depuis. */
  origines?: Record<string, Origine>
  /** Dernier comptage par poste — la carte retirée le 04/10/2026 les portait. */
  comptages?: Array<{ poste: string; le: string }>
  /** Références en réserve dont on ignore le prix : non chiffrées au total. */
  sansPrix?: number
}) {
  const jamais = useMemo(() => new Set(jamaisComptes), [jamaisComptes])
  const router = useRouter()
  const [tab, setTab] = useState<'stocks' | 'mouvements' | 'bilan'>('stocks')
  const [tri, setTri] = useState<'valeur' | 'nom'>('valeur')
  // ⚠️ UNE SEULE LISTE pour l'affichage, la recherche, les filtres et les
  // totaux : deux listes côte à côte finiraient par donner deux chiffres,
  // et c'est exactement ce que la carte du haut et ce tableau faisaient.
  const tout = useMemo(
    () => [...produits, ...ingredients].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    [produits, ingredients],
  )
  const estProduit = (x: Ingredient) => 'produit' in x
  const [search, setSearch] = useState('')
  const [filtreCat, setFiltreCat] = useState('')
  const [filtreStock, setFiltreStock] = useState<'tous' | 'rouge' | 'orange' | 'vert'>('tous')
  const [actionOpen, setActionOpen] = useState<ActionKind>(null)
  const [ingredientCourant, setIngredientCourant] = useState<Ingredient | null>(null)
  const [erreur, setErreur] = useState('')
  const [success, setSuccess] = useState('')
  const [, startTransition] = useTransition()

  const categories = useMemo(() => {
    const set = new Set<string>()
    tout.forEach(i => set.add(i.categorie))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [tout])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tout
      .filter(i => i.actif)
      .filter(i => {
        if (filtreCat && i.categorie !== filtreCat) return false
        if (filtreStock !== 'tous' && statutStock(i.stock_actuel, i.stock_minimum) !== filtreStock) return false
        if (q && !i.nom.toLowerCase().includes(q) && !i.categorie.toLowerCase().includes(q)) return false
        return true
      })
  }, [tout, search, filtreCat, filtreStock])

  /**
   * ⚠️ TRIÉ PAR VALEUR PAR DÉFAUT, et c'est un choix. L'ordre alphabétique
   * enterrait le fût d'Affligem à 237 € entre une bière à 1,51 € et un
   * Bailey's : on ouvre cet écran pour savoir OÙ EST L'ARGENT, et c'est la
   * première chose qui doit se voir.
   * ⚠️ Mais l'alphabétique reste à un clic : quand on tient une bouteille et
   * qu'on cherche sa ligne, c'est lui qu'il faut. Deux ordres, pas quatre.
   */
  const affichees = useMemo(() => {
    const v = (x: Ingredient) => Number(x.stock_actuel) * Number(x.prix_achat_ht ?? 0)
    return [...filtered].sort((a, b) =>
      tri === 'nom' ? a.nom.localeCompare(b.nom, 'fr') : v(b) - v(a))
  }, [filtered, tri])

  // Base des compteurs de pastilles catégorie : mêmes filtres que la liste (actifs
  // only + stock + recherche) SAUF la catégorie — sinon le compteur ne correspond
  // pas à la liste (qui n'affiche jamais les ingrédients inactifs).
  const baseForCounts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tout.filter(i => i.actif).filter(i => {
      if (filtreStock !== 'tous' && statutStock(i.stock_actuel, i.stock_minimum) !== filtreStock) return false
      if (q && !i.nom.toLowerCase().includes(q) && !i.categorie.toLowerCase().includes(q)) return false
      return true
    })
  }, [tout, search, filtreStock])

  // KPIs
  const valeur = useMemo(() => valeurStock(tout.filter(i => i.actif)), [tout])
  /**
   * LA VENTILATION PAR ÉTAGE — la seule qui porte du sens ET qui varie.
   *
   * ⚠️⚠️ Les trois indicateurs « Stock OK / faible / épuisés » ont été
   * RETIRÉS : mesurés le 04/10/2026, ils donnaient 46 verts, 0 orange,
   * 0 rouge — et ils resteront ainsi tant que les seuils valent zéro, ce qui
   * est le cas sur 46 références sur 46. Trois cases sur cinq qui
   * n'apprendront jamais rien : un indicateur qui ne varie pas n'est pas lu,
   * et il fait douter des deux qui restent.
   */
  const parPoste = useMemo(() => {
    const m = new Map<string, { n: number; v: number }>()
    for (const i of tout) {
      if (!i.actif) continue
      const k = origines[i.id]?.poste ?? 'Autres'
      const e = m.get(k) ?? { n: 0, v: 0 }
      e.n += 1
      e.v += Number(i.stock_actuel) * Number(i.prix_achat_ht ?? 0)
      m.set(k, e)
    }
    return [...m].map(([poste, x]) => ({ poste, ...x })).sort((a, b) => b.v - a.v)
  }, [tout, origines])
  /** La plus grosse valeur de ligne, pour mettre les barres à l'échelle. */
  const valeurMax = useMemo(
    () => Math.max(1, ...tout.map(i => Number(i.stock_actuel) * Number(i.prix_achat_ht ?? 0))),
    [tout],
  )
  /** ⚠️ Une alerte ne s'affiche QUE s'il y a quelque chose à dire. */
  const sousSeuil = useMemo(
    () => tout.filter(i => i.actif && Number(i.stock_minimum) > 0
      && Number(i.stock_actuel) <= Number(i.stock_minimum)).length,
    [tout],
  )
  const dlcAlerts = useMemo(() => alertesDLC(mouvements, 3), [mouvements])
  const courses = useMemo(() => listeCourses(ingredients), [ingredients])
  const invendus = useMemo(() => bilanInvendusMois(mouvements), [mouvements])

  const stats = useMemo(() => {
    const actifs = tout.filter(i => i.actif)
    const rouge = actifs.filter(i => statutStock(i.stock_actuel, i.stock_minimum) === 'rouge').length
    const orange = actifs.filter(i => statutStock(i.stock_actuel, i.stock_minimum) === 'orange').length
    return { totalActifs: actifs.length, rouge, orange }
  }, [tout])

  function flashOk(m: string) { setSuccess(m); setErreur(''); setTimeout(() => setSuccess(''), 1800) }
  function flashKo(e: unknown) { setErreur(e instanceof Error ? e.message : 'Erreur'); setSuccess('') }

  function deduire1Portion(i: Ingredient) {
    startTransition(async () => {
      try {
        const qte = i.unite === 'pièce' || i.unite === 'botte' ? 1 : 0.1
        await sortieManuelle({ ingredient_id: i.id, quantite: qte, motif: 'Bouton -1 portion (cuisine)' })
        flashOk(`-${qte} ${i.unite} sur ${i.nom}`)
        router.refresh()
      } catch (e) { flashKo(e) }
    })
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Dot pattern subtle premium */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
        aria-hidden
      />

      <main className="relative max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6">
        <AdminPageHeader
          accent="blue"
          subtitle="Cuisine & stock"
          title="Stocks"
          description="Niveaux temps réel, mouvements, ruptures, liste de courses automatique."
          actions={
            <>
              <Button onClick={() => { setIngredientCourant(null); setActionOpen('entree') }} variant="default" size="sm">
                <span className="text-base">+</span> Livraison
              </Button>
              <Button onClick={() => { setIngredientCourant(null); setActionOpen('perte') }} variant="destructive" size="sm">
                <span className="text-base">−</span> Perte/casse
              </Button>
              <Button onClick={() => setActionOpen('inventaire')} variant="outline" size="sm">📊 Inventaire</Button>
              <Button onClick={() => setActionOpen('courses')} variant="outline" size="sm">
                🛒 Liste courses {courses.length > 0 && <Badge variant="destructive" className="ml-1">{courses.length}</Badge>}
              </Button>
            </>
          }
        />

        {/* ── SYNTHÈSE ────────────────────────────────────────────────
            Un seul chiffre en gros — ce que la réserve VAUT — puis sa
            ventilation par étage, qui est la seule découpe du stock à la fois
            parlante et variable. Les cinq KPI d'avant mettaient sur le même
            plan un total utile et trois compteurs constants. */}
        <section className="rounded-xl border bg-background overflow-hidden">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-4 sm:px-5 pt-4 pb-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Valeur du stock
              </p>
              <p className="text-3xl sm:text-4xl font-black tabular-nums leading-none mt-1">
                {fmtPrix(valeur)}
              </p>
            </div>
            <div className="text-xs text-muted-foreground text-right leading-relaxed">
              <p>
                <b className="text-foreground font-bold tabular-nums">{stats.totalActifs}</b> référence
                {stats.totalActifs > 1 ? 's' : ''} en réserve
              </p>
              {/* ⚠️ Un total DIT ce qu'il ignore : présenté comme ferme alors
                  qu'il saute des lignes, il devient une contestation (0160). */}
              {sansPrix > 0 && <p>dont {sansPrix} sans prix connu, non chiffrée{sansPrix > 1 ? 's' : ''}</p>}
              {sousSeuil > 0 && (
                <p className="text-amber-700 font-semibold">⚠ {sousSeuil} sous le seuil</p>
              )}
            </div>
          </div>

          {/* La barre : une seule lecture, la part de chaque étage. */}
          {valeur > 0 && parPoste.length > 1 && (
            <div className="flex h-1.5 px-4 sm:px-5">
              {parPoste.map((p, n) => (
                <div
                  key={p.poste}
                  className={cn('h-full first:rounded-l-full last:rounded-r-full', TEINTE_POSTE[n % TEINTE_POSTE.length].barre)}
                  style={{ width: `${Math.max(1.5, (p.v / valeur) * 100)}%` }}
                />
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-1.5 px-4 sm:px-5 py-3 text-xs">
            {parPoste.map((p, n) => (
              <span key={p.poste} className="inline-flex items-baseline gap-1.5">
                <span className={cn('size-2 rounded-full translate-y-[-1px]', TEINTE_POSTE[n % TEINTE_POSTE.length].point)} />
                <b className="font-semibold">{p.poste}</b>
                <span className="text-muted-foreground tabular-nums">
                  {p.n} réf. · {fmtPrix(p.v)}
                </span>
              </span>
            ))}
          </div>

          {/* ⚠️⚠️ SUR QUOI CE CHIFFRE REPOSE — et sa place est ICI, collée au
              chiffre, pas en tête de la liste. Le tenu est un CALCUL (comptage
              + livraisons depuis), et un comptage de plus de 30 jours est
              ÉCARTÉ : la ligne devient « jamais compté » (0163). Afficher la
              valeur sans dire de quand date son comptage la fait passer pour
              une mesure du jour.
              ⚠️ Une ligne, en pied de carte : un avertissement qu'il faut
              traverser pour atteindre son stock n'est plus lu au bout de
              trois jours. */}
          {comptages.length > 0 && (
            <p className="border-t px-4 sm:px-5 py-2 text-[11px] text-muted-foreground bg-muted/30">
              Dernier comptage + livraisons enregistrées depuis —{' '}
              {comptages.map((c, n) => {
                const j = Math.round((Date.now() - Date.parse(c.le)) / 864e5)
                return (
                  <span key={c.poste}>
                    {n > 0 && ' · '}
                    <b className="font-semibold text-zinc-700">{c.poste}</b>{' '}
                    <span className={j > 30 ? 'text-red-600 font-semibold' : ''}>
                      {j === 0 ? 'aujourd’hui' : j === 1 ? 'hier' : `il y a ${j} j`}
                      {j > 30 && ' — périmé, écarté du calcul'}
                    </span>
                  </span>
                )
              })}
            </p>
          )}
        </section>

        {/* Sélecteur d'onglets sticky */}
        <div className="sticky top-0 z-20 -mx-3 sm:-mx-6 px-3 sm:px-6 py-2 bg-zinc-50/90 backdrop-blur flex gap-1.5 overflow-x-auto">
          <PillTab active={tab === 'stocks'} onClick={() => setTab('stocks')}>📦 Stocks</PillTab>
          <PillTab active={tab === 'mouvements'} onClick={() => setTab('mouvements')}>🔄 Mouvements</PillTab>
          <PillTab active={tab === 'bilan'} onClick={() => setTab('bilan')}>📉 Bilan mois</PillTab>
        </div>

        {tab === 'stocks' && (
        <>
        {/* ⚠️ CE QU'ON NE MONTRE PAS SE DIT — sinon une liste courte se lit
            « la base est vide » et on ressaisit ce qui existe déjà.
            ⚠️ Mais en UNE ligne : c'était un pavé de quatre lignes au-dessus
            de la liste, et un avertissement qu'on doit franchir pour atteindre
            ses données cesse d'être lu. Le détail tient dans l'infobulle. */}
        {(masques > 0 || horsSuivi > 0) && (
          <p className="text-[11px] text-muted-foreground px-1">
            {masques > 0 && (
              <span title="Rien n’a été supprimé : elles gardent fournisseur, prix et cible, et réapparaissent dès qu’une livraison enregistrée les fait entrer.">
                <b className="font-semibold text-zinc-700 tabular-nums">{masques}</b> référence
                {masques > 1 ? 's' : ''} à zéro masquée{masques > 1 ? 's' : ''} — seul ce qu’on a en
                réserve apparaît ici.
              </span>
            )}
            {horsSuivi > 0 && (
              <span title="Marquer la matière comme suivie dans sa fiche pour la compter.">
                {masques > 0 && ' '}
                <b className="font-semibold text-zinc-700 tabular-nums">{horsSuivi}</b> autre
                {horsSuivi > 1 ? 's' : ''} {horsSuivi > 1 ? 'ne sont suivies' : 'n’est suivie'} par aucun
                inventaire.
              </span>
            )}
          </p>
        )}

        {/* Bandeau alertes DLC */}
        {dlcAlerts.length > 0 && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-bold text-amber-900">⏰ {dlcAlerts.length} alerte{dlcAlerts.length > 1 ? 's' : ''} DLC dans les 3 jours</p>
                  <ul className="mt-1 text-xs text-amber-800 space-y-0.5">
                    {dlcAlerts.slice(0, 3).map(m => (
                      <li key={m.id}>
                        • <b>{m.ingredient_nom ?? '—'}</b> ({fmtQte(m.quantite)} {m.ingredient_unite ?? ''}) — DLC le {format(parseISO(m.date_peremption!), 'd MMM', { locale: fr })}
                      </li>
                    ))}
                    {dlcAlerts.length > 3 && <li className="italic">… et {dlcAlerts.length - 3} autre{dlcAlerts.length - 3 > 1 ? 's' : ''}.</li>}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Toolbar premium tactile */}
        <div className="sticky top-[60px] z-10 -mx-3 sm:-mx-6 px-3 sm:px-6 py-3 bg-zinc-50/95 backdrop-blur-md border-b border-zinc-200 space-y-2">
          <Input
            type="search"
            placeholder="🔍 Rechercher une référence…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-11 text-base"
          />
          {/* Catégories */}
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
            <PillTab active={filtreCat === ''} onClick={() => setFiltreCat('')}>
              ✦ Toutes <PillCount n={baseForCounts.length} active={filtreCat === ''} />
            </PillTab>
            {categories.map(c => {
              const n = baseForCounts.filter(i => i.categorie === c).length
              if (n === 0) return null
              return (
                <PillTab key={c} active={filtreCat === c} onClick={() => setFiltreCat(c)}>
                  {c} <PillCount n={n} active={filtreCat === c} />
                </PillTab>
              )
            })}
          </div>
          {/* Stock status */}
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
            <PillTab small active={filtreStock === 'tous'}   onClick={() => setFiltreStock('tous')}>📦 Tout</PillTab>
            <PillTab small active={filtreStock === 'rouge'}  onClick={() => setFiltreStock('rouge')}>🔴 Épuisés</PillTab>
            <PillTab small active={filtreStock === 'orange'} onClick={() => setFiltreStock('orange')}>⚠ Faibles</PillTab>
            <PillTab small active={filtreStock === 'vert'}   onClick={() => setFiltreStock('vert')}>✓ OK</PillTab>
          </div>
        </div>

        {/* Table ingrédients (mobile cards / desktop table) */}
        {affichees.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground italic">
              Aucun ingrédient — relâche tes filtres.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="grid grid-cols-1 gap-2 md:hidden">
              {affichees.map(i => (
                <IngredientStockCard
                  key={i.id}
                  i={i}
                  produit={estProduit(i) ? (i as ProduitEnStock).poste : null}
                  origine={origines[i.id]}
                  inconnu={jamais.has(i.id)}
                  onEntree={() => { setIngredientCourant(i); setActionOpen('entree') }}
                  onPerte={() => { setIngredientCourant(i); setActionOpen('perte') }}
                  onMoinsUn={() => deduire1Portion(i)}
                />
              ))}
            </div>

            {/* Desktop table */}
            <Card className="hidden md:block">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {/* ⚠️⚠️ « MIN / MAX » A ÉTÉ RETIRÉE. Mesuré le
                            04/10/2026 : le seuil vaut zéro sur 46 références
                            sur 46, et la cible est absente sur 20. Une colonne
                            qui affiche « 0 / 0 » partout n'informe pas, elle
                            occupe la largeur dont la valeur a besoin — et elle
                            laisse croire que les seuils sont réglés.
                            Les seuils et les cibles se posent sur
                            `/admin/reassort`, qui est l'écran qui en décide. */}
                        <th className="text-left  py-2.5 px-4">
                          <button type="button" onClick={() => setTri('nom')}
                                  className={cn('uppercase tracking-wider hover:text-foreground',
                                    tri === 'nom' && 'text-foreground')}>
                            Référence {tri === 'nom' && '↓'}
                          </button>
                        </th>
                        <th className="text-left  py-2.5 px-2">Catégorie</th>
                        <th className="text-right py-2.5 px-2">En réserve</th>
                        <th className="text-right py-2.5 px-2">Prix unitaire</th>
                        <th className="text-right py-2.5 px-2">
                          <button type="button" onClick={() => setTri('valeur')}
                                  className={cn('uppercase tracking-wider hover:text-foreground',
                                    tri === 'valeur' && 'text-foreground')}>
                            {tri === 'valeur' && '↓ '}Valeur
                          </button>
                        </th>
                        <th className="text-right py-2.5 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {affichees.map(i => (
                        <IngredientStockRow
                          key={i.id}
                          i={i}
                          produit={estProduit(i) ? (i as ProduitEnStock).poste : null}
                          origine={origines[i.id]}
                          echelle={valeurMax}
                          inconnu={jamais.has(i.id)}
                          onEntree={() => { setIngredientCourant(i); setActionOpen('entree') }}
                          onPerte={() => { setIngredientCourant(i); setActionOpen('perte') }}
                          onMoinsUn={() => deduire1Portion(i)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
        {/* ⚠️⚠️ POURQUOI DEUX JEUX DE GESTES — et il faut le dire, parce que
            la colonne « Actions » change d'une ligne à l'autre sans raison
            visible. Les trois gestes du module 7 écrivent dans
            `mouvements_stock.ingredient_id` : ils ne peuvent viser qu'une
            MATIÈRE. Un produit vendu se compte à l'inventaire du poste, où la
            caisse donne aussi ses sorties produit par produit.
            ⚠️ Affichée seulement quand les DEUX familles sont présentes :
            expliquer une différence qu'on ne voit pas est du bruit. */}
        {produits.length > 0 && ingredients.length > 0 && (
          <p className="text-[11px] text-muted-foreground px-1">
            Une <b className="font-semibold text-zinc-700">matière première</b> s’ajuste ici
            (<span className="whitespace-nowrap">📥 livraison, ⚠ perte, −1</span>).
            Un <b className="font-semibold text-zinc-700">produit vendu</b> se compte
            à l’inventaire du poste — c’est là que la caisse donne ses sorties.
          </p>
        )}
        </>
        )}

        {tab === 'bilan' && (
        <>
        {/* Bilan invendus du mois */}
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <h2 className="font-bold">🗑 Invendus du mois</h2>
              <span className="text-sm font-bold text-red-700 tabular-nums">
                {invendus.par_ingredient.length} ingrédient{invendus.par_ingredient.length > 1 ? 's' : ''} · {fmtPrix(invendus.total_cout)}
              </span>
            </div>
            {invendus.par_ingredient.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Aucune perte ce mois — bravo 👏</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {invendus.par_ingredient.map(p => (
                  <li key={p.ingredient_id} className="flex items-center justify-between gap-2 bg-red-50/50 border border-red-100 rounded px-2 py-1.5">
                    <span className="min-w-0 truncate max-w-[60%]">{p.nom}</span>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {fmtQte(p.qte)} unités · <b className="text-red-700">{fmtPrix(p.cout)}</b>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        </>
        )}

        {tab === 'mouvements' && (
        <>
        {/* Historique récent */}
        <Card>
          <CardContent className="p-3 sm:p-4">
            <h2 className="font-bold mb-2">📜 Historique des mouvements ({mouvements.length})</h2>
            {mouvements.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Aucun mouvement enregistré.</p>
            ) : (
              <>
              {/* Mobile : liste cards (6 colonnes illisibles à 375px) */}
              <ul className="md:hidden space-y-1.5">
                {mouvements.slice(0, 30).map(m => {
                  const cfg = TYPE_MOUVEMENT_LABEL[m.type]
                  const valeur = m.quantite * m.prix_unitaire_ht
                  return (
                    <li key={m.id} className="rounded-md border bg-card p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <Badge className={cn('border shrink-0', cfg.cls)}>{cfg.emoji} {cfg.label}</Badge>
                        <span className="text-muted-foreground tabular-nums whitespace-nowrap">{format(parseISO(m.created_at), 'd MMM HH:mm', { locale: fr })}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="truncate flex-1">{m.ingredient_nom ?? '—'}</span>
                        <span className={cn('tabular-nums shrink-0', cfg.signe === '-' ? 'text-red-700' : cfg.signe === '+' ? 'text-emerald-700' : '')}>
                          {cfg.signe} {fmtQte(m.quantite)} {m.ingredient_unite ?? ''}
                        </span>
                      </div>
                      {(m.motif || valeur > 0) && (
                        <div className="mt-1 flex items-center justify-between gap-2 text-muted-foreground">
                          <span className="line-clamp-1 flex-1">{m.motif ?? ''}{m.fournisseur ? ` · ${m.fournisseur}` : ''}</span>
                          {valeur > 0 && <span className="tabular-nums shrink-0">{fmtPrix(valeur)}</span>}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>

              {/* Desktop/tablette : table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm min-w-[760px]">
                  <thead>
                    <tr className="border-b text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="text-left py-2 px-2">Date</th>
                      <th className="text-left py-2 px-2">Type</th>
                      <th className="text-left py-2 px-2">Ingrédient</th>
                      <th className="text-right py-2 px-2">Qté</th>
                      <th className="text-right py-2 px-2">Valeur</th>
                      <th className="text-left py-2 px-2">Motif / Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mouvements.slice(0, 30).map(m => {
                      const cfg = TYPE_MOUVEMENT_LABEL[m.type]
                      const valeur = m.quantite * m.prix_unitaire_ht
                      return (
                        <tr key={m.id} className="border-t hover:bg-muted/30">
                          <td className="py-2 px-2 text-xs whitespace-nowrap">
                            {format(parseISO(m.created_at), 'd MMM HH:mm', { locale: fr })}
                          </td>
                          <td className="py-2 px-2">
                            <Badge className={cn('border', cfg.cls)}>{cfg.emoji} {cfg.label}</Badge>
                          </td>
                          <td className="py-2 px-2 truncate max-w-48">{m.ingredient_nom ?? '—'}</td>
                          <td className="py-2 px-2 text-right tabular-nums">
                            <span className={cfg.signe === '-' ? 'text-red-700' : cfg.signe === '+' ? 'text-emerald-700' : ''}>
                              {cfg.signe} {fmtQte(m.quantite)} {m.ingredient_unite ?? ''}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums text-xs text-muted-foreground">
                            {valeur > 0 ? fmtPrix(valeur) : '—'}
                          </td>
                          <td className="py-2 px-2 text-xs text-muted-foreground hidden sm:table-cell">
                            <span className="line-clamp-1">{m.motif ?? '—'}{m.fournisseur ? ` · ${m.fournisseur}` : ''}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {mouvements.length > 30 && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Affichage des 30 plus récents sur {mouvements.length}.
                </p>
              )}
              </>
            )}
          </CardContent>
        </Card>
        </>
        )}
      </main>

      {/* Toasts */}
      {erreur && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30 max-w-[90vw] text-center cursor-pointer" onClick={() => setErreur('')}>
          ⚠️ {erreur}
        </div>
      )}
      {success && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl z-30">
          ✓ {success}
        </div>
      )}

      {/* Modaux */}
      {actionOpen === 'entree' && (
        <EntreeModal
          ingredients={ingredients}
          ingredientPreselectionne={ingredientCourant}
          onClose={() => { setActionOpen(null); setIngredientCourant(null) }}
          onSaved={() => { setActionOpen(null); setIngredientCourant(null); router.refresh() }}
        />
      )}
      {actionOpen === 'perte' && (
        <PerteModal
          ingredients={ingredients}
          ingredientPreselectionne={ingredientCourant}
          onClose={() => { setActionOpen(null); setIngredientCourant(null) }}
          onSaved={() => { setActionOpen(null); setIngredientCourant(null); router.refresh() }}
        />
      )}
      {actionOpen === 'inventaire' && (
        <InventaireModal
          ingredients={ingredients}
          onClose={() => setActionOpen(null)}
          onSaved={() => { setActionOpen(null); router.refresh() }}
        />
      )}
      {actionOpen === 'courses' && (
        <ListeCoursesModal items={courses} onClose={() => setActionOpen(null)} />
      )}
    </div>
  )
}

// ─── KPI ─────────────────────────────────────────────────────────────
/**
 * LES TEINTES DES ÉTAGES.
 *
 * ⚠️ Reprises du design system du projet (§6) : le bar est `violet`, la
 * cuisine `amber`, l'info `blue`. On n'invente pas une palette pour un écran
 * — deux écrans qui colorent le même étage différemment obligent à relire la
 * légende à chaque fois.
 */
const TEINTE_POSTE = [
  { barre: 'bg-violet-500', point: 'bg-violet-500' },
  { barre: 'bg-amber-500',  point: 'bg-amber-500' },
  { barre: 'bg-blue-500',   point: 'bg-blue-500' },
  { barre: 'bg-emerald-500',point: 'bg-emerald-500' },
  { barre: 'bg-zinc-400',   point: 'bg-zinc-400' },
]

function KPI({ label, value, tone = 'default', icon, pulse, note }: {
  label: string
  value: string
  tone?: 'default' | 'green' | 'orange' | 'red'
  icon: string
  pulse?: boolean
  /** ⚠️ CE QUE LE TOTAL IGNORE. Un total présenté comme ferme alors qu'il
   *  saute des lignes devient une contestation de facture (0160). */
  note?: string
}) {
  const cls = {
    default: 'bg-background',
    green:   'bg-emerald-50 border-emerald-200',
    orange:  'bg-amber-50 border-amber-200',
    red:     'bg-red-50 border-red-200',
  }[tone]
  return (
    <Card className={cn('overflow-hidden', cls)}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground truncate">{label}</p>
          <span className={cn('text-lg', pulse && 'animate-pulse')}>{icon}</span>
        </div>
        <p className="text-lg sm:text-2xl font-bold mt-1 tabular-nums">{value}</p>
        {note && <p className="text-[10px] text-muted-foreground mt-0.5">{note}</p>}
      </CardContent>
    </Card>
  )
}

// ─── Mobile : carte d'ingrédient ─────────────────────────────────────
function IngredientStockCard({
  i, inconnu, produit = null, origine, onEntree, onPerte, onMoinsUn,
}: {
  i: Ingredient
  inconnu?: boolean
  /** ⚠️ D'où vient le chiffre : « 0 + 32 ». Un stock qu'on ne sait pas
   *  décomposer n'est pas vérifiable, et c'est la première chose qu'on
   *  conteste quand il paraît faux (0163). */
  origine?: Origine
  /** Poste où ce PRODUIT REVENDU se compte, ou `null` pour une matière. */
  produit?: 'bar' | 'fournil' | null
  onEntree: () => void
  onPerte: () => void
  onMoinsUn: () => void
}) {
  const stat = statutStock(i.stock_actuel, i.stock_minimum)
  const sty = STATUT_STOCK_STYLE[stat]
  const valeur = i.stock_actuel * i.prix_achat_ht
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm truncate">{i.nom}</p>
            <p className="text-[11px] text-muted-foreground">
              {i.categorie} · {i.unite} · {produit ? 'produit vendu' : 'matière première'}
            </p>
          </div>
          <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border', sty.bg, sty.text, sty.border)}>
            {sty.label}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <Stat label="Stock"  value={inconnu ? '— jamais compté' : `${fmtQte(i.stock_actuel)} ${i.unite}`}
                sous={origine && origine.entrees !== 0
                  ? `${fmtQte(origine.compte ?? 0)} + ${fmtQte(origine.entrees)} livré`
                  : undefined} />
          {/* ⚠️ « Min » est retiré ici aussi : zéro sur 46 références sur 46.
              Le prix unitaire, lui, explique la valeur de la ligne. */}
          <Stat label="Prix"   value={fmtPrix(i.prix_achat_ht)} />
          <Stat label="Valeur" value={fmtPrix(valeur)} />
        </div>
        {/* ⚠️ Un PRODUIT REVENDU n'a pas les gestes du module 7 : ils
            écrivent dans `mouvements_stock.ingredient_id` et ne peuvent pas
            le viser. Afficher les boutons mènerait à un message d'erreur —
            on renvoie là où il se compte vraiment. */}
        {produit ? (
          <a href={`/inventaire?poste=${produit}`}
             className="block text-center text-xs font-semibold rounded-md border px-2 py-2 hover:bg-muted">
            📊 Se compte à l’inventaire
          </a>
        ) : (
          <div className="flex gap-1.5">
            <Button size="sm" variant="default"    onClick={onEntree}  className="flex-1">📥 +</Button>
            <Button size="sm" variant="destructive" onClick={onPerte}  className="flex-1">⚠ Perte</Button>
            <Button size="sm" variant="outline"    onClick={onMoinsUn}>−1</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, sous }: { label: string; value: string; sous?: string }) {
  return (
    <div className="rounded bg-muted/40 px-1.5 py-1 text-center">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-bold tabular-nums truncate">{value}</p>
      {sous && <p className="text-[9px] text-muted-foreground tabular-nums truncate">{sous}</p>}
    </div>
  )
}

// ─── Desktop : ligne de table ────────────────────────────────────────
function IngredientStockRow({
  i, inconnu, produit = null, origine, echelle = 0, onEntree, onPerte, onMoinsUn,
}: {
  i: Ingredient
  /** La plus grosse valeur de ligne — met toutes les barres à la même échelle. */
  echelle?: number
  inconnu?: boolean
  /** ⚠️ D'où vient le chiffre : « 0 + 32 ». Un stock qu'on ne sait pas
   *  décomposer n'est pas vérifiable, et c'est la première chose qu'on
   *  conteste quand il paraît faux (0163). */
  origine?: Origine
  /** Poste où ce PRODUIT REVENDU se compte, ou `null` pour une matière. */
  produit?: 'bar' | 'fournil' | null
  onEntree: () => void
  onPerte: () => void
  onMoinsUn: () => void
}) {
  const stat = statutStock(i.stock_actuel, i.stock_minimum)
  const sty = STATUT_STOCK_STYLE[stat]
  const valeur = i.stock_actuel * i.prix_achat_ht
  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
      <td className="py-2.5 px-4">
        <p className="font-semibold">{i.nom}</p>
      </td>
      {/* ⚠️⚠️ LA NATURE DE LA LIGNE DÉCIDE DES GESTES DISPONIBLES, donc elle
          doit se LIRE. Le gérant a demandé le 04/10/2026 « pourquoi des fois
          en face des produits il y a marqué inventaire et des fois −1 » : la
          réponse était dans la table d'origine, et rien à l'écran ne la
          donnait. Pire, la distinction est contre-intuitive — « Get 31
          70 cl » est une matière, « Digestif 4 cl » un produit vendu, et ce
          sont deux bouteilles sur la même étagère. */}
      <td className="py-2.5 px-2 text-muted-foreground text-xs">
        {i.categorie}
        <span className="block text-[10px] opacity-70">
          {produit ? 'produit vendu' : 'matière première'}
        </span>
      </td>
      <td className="py-2.5 px-2 text-right">
        {inconnu ? (
          <span className="inline-flex items-center text-xs font-semibold px-2 py-1 rounded-md border border-zinc-300 bg-zinc-50 text-zinc-500">
            — jamais compté
          </span>
        ) : (
          <span className={cn('inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md border tabular-nums', sty.bg, sty.text, sty.border)}>
            {fmtQte(i.stock_actuel)} {i.unite}
          </span>
        )}
        {origine && origine.entrees !== 0 && (
          <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
            {fmtQte(origine.compte ?? 0)} compté{origine.entrees > 0 ? ' + ' : ' − '}
            {fmtQte(Math.abs(origine.entrees))} livré
          </p>
        )}
      </td>
      <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground">{fmtPrix(i.prix_achat_ht)}</td>
      {/* ⚠️ LA BARRE N'EST PAS UN ORNEMENT : elle met les 46 lignes à la même
          échelle, donc l'œil trouve en une seconde où dort l'argent — le fût
          d'Affligem à 237 € ne se distinguait pas d'une bière à 1,51 € dans
          une colonne de chiffres alignés. */}
      <td className="py-2.5 px-2 text-right">
        <p className="tabular-nums font-bold">{fmtPrix(valeur)}</p>
        {echelle > 0 && valeur > 0 && (
          <span className="mt-1 block h-1 rounded-full bg-muted overflow-hidden">
            <span className="block h-full rounded-full bg-zinc-400"
                  style={{ width: `${Math.max(2, (valeur / echelle) * 100)}%` }} />
          </span>
        )}
      </td>
      <td className="py-2.5 px-4">
        {/* ⚠️ Voir la carte mobile : les trois gestes visent `ingredient_id`. */}
        {produit ? (
          <div className="flex justify-end">
            <a href={`/inventaire?poste=${produit}`}
               className="text-xs font-semibold rounded-md border px-2 py-1 hover:bg-muted whitespace-nowrap"
               title="Un produit revendu se compte à l’inventaire du poste">
              📊 Inventaire
            </a>
          </div>
        ) : (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={onEntree} title="Livraison">📥</Button>
            <Button size="sm" variant="ghost" onClick={onPerte} title="Perte/casse" className="text-destructive">⚠</Button>
            <Button size="sm" variant="ghost" onClick={onMoinsUn} title="−1 portion">−1</Button>
          </div>
        )}
      </td>
    </tr>
  )
}
