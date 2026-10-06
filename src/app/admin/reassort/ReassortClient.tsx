'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  etat, aCommander, coutReassort, bilan, parCategorie, parFournisseur,
  parEtablissement, lignesCommandables, economieEstimee, sansComptagePerime,
  comptagePerime, stockAReconstituer, PEREMPTION_COMPTAGE_JOURS,
  type LigneReassort, type EtatReassort,
} from '@/lib/reassort'
import { prixReprenable } from '@/lib/catalogue-achats'
import { fmtPrix, fmtPrix4, fmtEcart } from '@/lib/foodCost'
import { enregistrerParametres, creerBonsDepuisReassort, basculerFournisseur } from './actions'

type Vue = 'categories' | 'fournisseurs' | 'etablissements'

const ETAT: Record<EtatReassort, { texte: string; classe: string }> = {
  a_commander:   { texte: 'à commander',   classe: 'bg-red-600 text-white' },
  suffisant:     { texte: 'suffisant',     classe: 'bg-amber-50 text-amber-700' },
  complet:       { texte: 'complet',       classe: 'bg-emerald-50 text-emerald-700' },
  non_parametre: { texte: 'à paramétrer',  classe: 'bg-zinc-100 text-zinc-500' },
}

export default function ReassortClient(
  { lignes, pour }: { lignes: LigneReassort[]; pour: string },
) {
  const [vue, setVue] = useState<Vue>('categories')
  const [requete, setRequete] = useState('')
  const [aParametrer, setAParametrer] = useState(false)
  const [brouillon, setBrouillon] = useState<Record<string, { seuil: string; cible: string }>>({})
  const [enCours, demarrer] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [bons, setBons] = useState<string | null>(null)
  // ⚠️ RÈGLE DU GÉRANT : on commande AU MOINS CHER. C'est le défaut, pas
  // une option qu'on découvre. L'interrupteur existe pour le cas inverse
  // — rester chez l'habituel quand on ne veut pas ouvrir un compte.
  const [auMoinsCher, setAuMoinsCher] = useState(true)
  const [creation, creer] = useTransition()

  // Combien de cibles viennent réellement de l'ardoise : c'est ce qui dit
  // si la date choisie sert à quelque chose.
  const surArdoise = lignes.filter(l => l.cible_origine === 'ardoise').length

  // Les saisies en cours priment sur ce qui vient du serveur.
  // ⚠️ Un comptage périmé est ramené à « inconnu » pour le CALCUL : sinon
  // l'écran proposerait un complément sur un stock qui n'existe plus.
  // La date reste affichée — on signale, on ne masque pas.
  // ⚠️ La péremption est appliquée par `sansComptagePerime()`, la même
  // fonction que l'agent Stock : en la gardant ici en une ligne, l'agent
  // lisait des comptages d'août comme du stock.
  const avecBrouillon = useMemo(() => sansComptagePerime(lignes).map(l0 => {
    const l = l0
    const b = brouillon[l.cle]
    if (!b) return l
    const n = (v: string) => v.trim() === '' ? null : Number(v.replace(',', '.'))
    return { ...l, seuil: n(b.seuil) ?? l.seuil, cible: n(b.cible) ?? l.cible }
  }), [lignes, brouillon])

  const filtrees = useMemo(() => {
    const q = requete.trim().toLowerCase()
    return avecBrouillon.filter(l => {
      if (aParametrer && l.cible != null) return false
      if (!q) return true
      return l.nom.toLowerCase().includes(q) || (l.categorie ?? '').toLowerCase().includes(q)
    })
  }, [avecBrouillon, requete, aParametrer])

  const b = useMemo(() => bilan(avecBrouillon), [avecBrouillon])
  const cats = useMemo(() => parCategorie(filtrees), [filtrees])
  const fours = useMemo(() => parFournisseur(filtrees), [filtrees])
  const etabs = useMemo(() => parEtablissement(filtrees), [filtrees])

  // ⚠️ La commande se construit sur TOUTES les lignes, jamais sur les
  // lignes FILTRÉES : une recherche en cours ne doit pas amputer un bon de
  // commande en silence — on partirait avec la moitié du réassort.
  const commandables = useMemo(() => lignesCommandables(avecBrouillon, auMoinsCher), [avecBrouillon, auMoinsCher])
  const economie = useMemo(() => economieEstimee(commandables.prets), [commandables])
  const nbFournisseurs = useMemo(
    () => new Set(commandables.prets.map(l => l.retenu.id)).size, [commandables])

  function creerLesBons() {
    creer(async () => {
      try {
        const r = await creerBonsDepuisReassort({
          lignes: commandables.prets.map(l => ({
            fournisseur_id: l.retenu.id,
            // La clé porte le préfixe `ing:` pour une matière (0133).
            recette_id: l.cle.startsWith('ing:') ? null : l.cle,
            ingredient_id: l.cle.startsWith('ing:') ? l.cle.slice(4) : null,
            libelle: l.nom,
            quantite: l.quantite,
            unite: l.unite ?? 'unité',
            prix_unitaire_ht: l.prix,
          })),
        })
        const n = r.crees.length
        const sansPrix = r.crees.reduce((a, c) => a + c.sansPrix, 0)
        const dejaLa = r.dejaEnCours.length
          ? ` · ${r.dejaEnCours.length} ignoré(s), un brouillon récent existe déjà (${r.dejaEnCours.join(', ')})`
          : ''
        setBons(`✓ ${n} bon(s) créé(s) en brouillon${sansPrix ? ` · ${sansPrix} ligne(s) sans prix connu` : ''}${dejaLa}.`)
      } catch (e) {
        setBons(e instanceof Error ? e.message : 'Création impossible.')
      }
    })
  }

  const saisir = (cle: string, champ: 'seuil' | 'cible', v: string) =>
    setBrouillon(x => ({ ...x, [cle]: { ...{ seuil: '', cible: '' }, ...(x[cle] ?? {}), [champ]: v } }))

  const enregistrer = () => demarrer(async () => {
    const maj = Object.entries(brouillon).map(([cle, v]) => ({
      cle,
      seuil: v.seuil.trim() === '' ? null : Number(v.seuil.replace(',', '.')),
      cible: v.cible.trim() === '' ? null : Number(v.cible.replace(',', '.')),
    })).filter(m => m.seuil !== null || m.cible !== null)
    if (!maj.length) { setMessage('Rien à enregistrer.'); return }
    const r = await enregistrerParametres(maj)
    setMessage(r.message)
    if (r.ok) setBrouillon({})
  })

  const stockVide = useMemo(() => stockAReconstituer(avecBrouillon), [avecBrouillon])

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-zinc-900">Réassort</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Ce qu&apos;on a, ce qu&apos;il faut avoir, ce qu&apos;il faut commander —
          et chez qui. <Link href="/admin/achats" className="underline">Plateforme d&apos;achat</Link>
          {' · '}<Link href="/inventaire" className="underline">Compter le stock</Link>
        </p>
      </header>

      {/* ⚠️⚠️ ON COMMANDE POUR LA SEMAINE QU'ON VA SERVIR, PAS POUR
          AUJOURD'HUI. C'est cette date qui choisit l'ardoise, donc les
          quantités de la restauration. Au 05/10/2026, à sept jours de
          l'ouverture, l'ardoise du 12 était saisie et l'écran dimensionnait
          quand même sur la carte ENTIÈRE — le scénario le plus coûteux en
          reliquat — sans que rien ne le dise. */}
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
        <label htmlFor="pour" className="font-medium text-zinc-900">Commander pour la semaine du</label>
        <input id="pour" name="pour" type="date" defaultValue={pour}
          className="h-9 rounded-lg border border-zinc-300 px-2 tabular-nums" />
        <button type="submit" className="h-9 rounded-lg bg-zinc-900 px-3 font-medium text-white">
          Recalculer
        </button>
        <span className="text-zinc-600">
          {surArdoise > 0
            ? <>✓ {surArdoise} référence{surArdoise > 1 ? 's' : ''} dimensionnée{surArdoise > 1 ? 's' : ''} sur l&apos;ardoise de cette semaine</>
            : <span className="text-amber-800">
                ⚠️ aucune ardoise ne couvre cette date — repli sur la carte entière,
                c&apos;est le scénario le plus coûteux en reliquat
              </span>}
        </span>
      </form>

      {/* ⚠️ Un stock à zéro partout n'est pas un réassort, c'est une
          ouverture. Le dire change la lecture de tout l'écran : il n'y a
          rien à « compléter », il y a tout à constituer. */}
      {stockVide && (
        <div className="mb-4 rounded-xl border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
          <strong>Aucun comptage récent : c&apos;est une commande d&apos;ouverture.</strong>{' '}
          Tout ce qui a une cible est à commander en entier. Les quantités ci-dessous
          valent donc la cible, pas un complément. Les comptages de plus de{' '}
          {PEREMPTION_COMPTAGE_JOURS} jours sont signalés : ils ne décrivent plus le stock réel.
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Chiffre n={b.lignes} libelle="références" />
        <Chiffre n={b.aCommander} libelle="à commander" accent="text-red-700" />
        {/* Ce qui est déjà parti : la moitié de la question « où j'en suis ». */}
        <Chiffre n={lignes.filter(l => l.enCommande > 0).length} libelle="déjà commandé" accent="text-blue-700" />
        <Chiffre n={b.nonParametres} libelle="sans cible" accent="text-amber-700" />
        <Chiffre n={b.jamaisComptes} libelle="jamais comptées" accent="text-zinc-500" />
        <Chiffre texte={fmtPrix(b.coutTotal)} libelle={b.sansPrix ? `dont ${b.sansPrix} sans prix` : 'coût estimé'} />
      </div>

      {b.nonParametres > 0 && (
        <p className="mb-3 text-[12px] text-amber-700">
          ⚠️ {b.nonParametres} référence(s) n&apos;ont pas de cible : l&apos;outil ne propose
          aucune quantité pour elles plutôt que d&apos;en inventer une.
        </p>
      )}

      <div className="sticky top-0 z-10 -mx-4 mb-4 flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur">
        <input value={requete} onChange={e => setRequete(e.target.value)}
          placeholder="Rechercher…" type="search"
          className="h-11 flex-1 min-w-[200px] rounded-lg border border-zinc-300 px-3 outline-none focus:border-zinc-900" />
        <Bascule actif={vue === 'categories'} onClick={() => setVue('categories')}>Par catégorie</Bascule>
        <Bascule actif={vue === 'fournisseurs'} onClick={() => setVue('fournisseurs')}>Par fournisseur</Bascule>
        <Bascule actif={vue === 'etablissements'} onClick={() => setVue('etablissements')}>Par établissement</Bascule>
        <Bascule actif={aParametrer} onClick={() => setAParametrer(!aParametrer)}>Sans cible ({b.nonParametres})</Bascule>
        <button onClick={enregistrer} disabled={enCours || !Object.keys(brouillon).length}
          className="ml-auto h-11 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-40">
          {enCours ? 'Enregistrement…' : `Enregistrer (${Object.keys(brouillon).length})`}
        </button>
      </div>

      {message && <p className="mb-3 text-sm text-emerald-700">{message}</p>}

      {/* ─── Passer commande ────────────────────────────────────────
          ⚠️ LE CHAÎNON QUI MANQUAIT. L'écran calculait ce qu'il faut
          commander, et il fallait tout retaper ailleurs — entre deux
          saisies on se trompe de quantité, et ça se découvre à la
          livraison. Créer NE PART PAS : le bon naît en brouillon. */}
      {commandables.prets.length > 0 && (
        <div className="mb-4 rounded-lg border border-zinc-900 bg-zinc-50 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[240px]">
              <p className="text-sm font-semibold text-zinc-900">
                {commandables.prets.length} ligne(s) prêtes à commander chez {nbFournisseurs} fournisseur(s)
              </p>
              <p className="mt-0.5 text-xs text-zinc-600">
                Un bon de commande <strong>en brouillon</strong> par fournisseur. Rien ne part :
                l&apos;envoi reste un second geste, dans Fournisseurs.
              </p>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={auMoinsCher}
                  onChange={e => setAuMoinsCher(e.target.checked)}
                  className="h-4 w-4 accent-violet-700" />
                <span className="font-medium text-violet-800">Commander au moins cher</span>
                {commandables.bascules.length > 0 && (
                  <span className="text-xs text-violet-700">
                    · {commandables.bascules.length} ligne(s) changent de fournisseur
                    {economie > 0 && <> · <strong>≈ {fmtPrix(economie)} économisés</strong></>}
                  </span>
                )}
              </label>
              {/* ⚠️ Un tarif comparé n'est pas un prix négocié : le total du
                  bon ne peut pas être annoncé comme ferme sur une ligne qui
                  change de fournisseur. */}
              {commandables.bascules.length > 0 && (
                <p className="mt-1 text-xs text-amber-800">
                  ⚠️ Ces lignes partent <strong>sans prix</strong> : notre coût est celui de NOTRE
                  conditionnement, pas du leur. C&apos;est au fournisseur de confirmer son tarif.
                  L&apos;économie ci-dessus est une estimation d&apos;après les tarifs comparés.
                </p>
              )}
            </div>
            <button onClick={creerLesBons} disabled={creation}
              className="min-h-[48px] rounded-lg bg-zinc-900 px-5 text-sm font-bold text-white disabled:opacity-40">
              {creation ? 'Création…' : '🧾 Créer les bons de commande'}
            </button>
          </div>
          {/* ⚠️ Ce qu'on NE PEUT PAS commander se dit ici, pas nulle part :
              sinon on croit la commande complète. */}
          {commandables.sansFournisseur.length > 0 && (
            <p className="mt-2 text-xs text-amber-800">
              ⚠️ {commandables.sansFournisseur.length} ligne(s) resteront dehors — aucun fournisseur connu.
              Elles sont en bas de la vue « Par fournisseur ».
            </p>
          )}
          {bons && <p className="mt-2 text-sm font-medium text-emerald-700">{bons}{' '}
            <Link href="/admin/fournisseurs" className="underline">Relire et envoyer →</Link></p>}
        </div>
      )}

      {vue === 'etablissements'
        ? etabs.map(e => (
            <Bloc key={e.etablissement ?? '—'}
              titre={e.etablissement ?? '⚠️ Non rattaché à un point de vente'}
              sous={`${e.lignes.length} référence(s)${e.aCommander ? ` · ${e.aCommander} à commander` : ''}`}
              cout={e.cout}>
              {e.lignes.map(l => <Ligne key={l.cle} l={l} brouillon={brouillon[l.cle]} saisir={saisir} auMoinsCher={auMoinsCher} />)}
            </Bloc>
          ))
        : vue === 'categories'
        ? cats.map(c => (
            <Bloc key={c.categorie} titre={c.categorie}
              sous={`${c.lignes.length} référence(s)${c.aCommander ? ` · ${c.aCommander} à commander` : ''}`}
              cout={c.cout}>
              {c.lignes.map(l => <Ligne key={l.cle} l={l} brouillon={brouillon[l.cle]} saisir={saisir} auMoinsCher={auMoinsCher} />)}
            </Bloc>
          ))
        : fours.map(f => (
            <Bloc key={f.fournisseur ?? '—'}
              titre={f.fournisseur ?? '⚠️ Sans fournisseur connu'}
              sous={`${f.lignes.length} ligne(s) à commander${f.sansPrix ? ` · ${f.sansPrix} sans prix` : ''}`}
              cout={f.cout}>
              {f.lignes.map(l => <Ligne key={l.cle} l={l} brouillon={brouillon[l.cle]} saisir={saisir} auMoinsCher={auMoinsCher} />)}
            </Bloc>
          ))}

      {(vue === 'categories' ? cats : vue === 'etablissements' ? etabs : fours).length === 0 && (
        <p className="py-12 text-center text-sm text-zinc-500">
          {vue === 'fournisseurs' ? 'Rien à commander — ou aucune cible définie.' : 'Aucune référence.'}
        </p>
      )}
    </div>
  )
}

function Ligne({
  l, brouillon, saisir, auMoinsCher,
}: {
  l: LigneReassort
  brouillon?: { seuil: string; cible: string }
  saisir: (cle: string, champ: 'seuil' | 'cible', v: string) => void
  auMoinsCher: boolean
}) {
  const e = etat(l)
  const q = aCommander(l)
  const c = coutReassort(l)
  const [ouvert, setOuvert] = useState(false)
  return (
   <div className="border-t border-zinc-100">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
      <div className="min-w-[180px] flex-1">
        <p className="font-medium text-zinc-900">{l.nom}</p>
        <p className="text-[11px] text-zinc-400">
          {l.etablissement && <>{l.etablissement} · </>}
          {l.unite}
          {l.fournisseur && <> · {l.fournisseur}</>}
          {/* ⚠️ D'OÙ VIENT CE NOM. Une facture est une preuve d'achat ; une
              fiche saisie à la main peut être périmée. Un bon parti chez le
              mauvais interlocuteur se découvre à la livraison. */}
          {l.source_fournisseur === 'facture' && <span className="ml-1 text-emerald-700">(déjà acheté ici)</span>}
          {l.source_fournisseur === 'reference' && <span className="ml-1 text-blue-700">(par référence)</span>}
          {/* ⚠️ Un prix ESTIMÉ n'est pas un prix relevé. Le montant affiché
              en face a l'air d'un devis ; il faut qu'on voie qu'il n'en est
              pas un AVANT d'engager la trésorerie d'une ouverture. */}
          {l.estime && <span className="ml-1 text-amber-700">prix estimé</span>}
          {/* ⚠️ On SIGNALE, on ne bascule pas : changer de fournisseur engage
              un délai, un minimum de commande et une relation — ce n'est pas
              l'effet de bord d'un écran. Mais se taire ferait recommander au
              prix fort avec l'écart sous les yeux. */}
          {/* ⚠️ Quand la commande bascule, la ligne doit dire OÙ ELLE PART.
              Afficher encore le fournisseur habituel ferait croire que le
              bon va chez lui, et l'écart se découvrirait à la livraison. */}
          {l.ailleurs && (
            <span className="ml-1 font-medium text-violet-700">
              {auMoinsCher && l.ailleurs.fournisseur_id !== l.fournisseur_id
                ? <>→ part chez {l.ailleurs.fournisseur} (−{fmtEcart(l.ailleurs.ecartPct)})</>
                : <>💡 −{fmtEcart(l.ailleurs.ecartPct)} chez {l.ailleurs.fournisseur}</>}
            </span>
          )}
          {/* ⚠️ Le signal était affiché ici depuis la 0163, mais agir
              demandait de partir sur `/admin/achats` — donc on ne le
              faisait pas. Le sélecteur vient à la ligne. */}
          {(l.offres?.length ?? 0) > 0 && (
            <button onClick={() => setOuvert(v => !v)}
              className="ml-1.5 rounded border border-violet-300 bg-violet-50 px-1.5 py-px align-middle text-[11px] font-bold text-violet-800 hover:bg-violet-100">
              {ouvert ? '▴ masquer' : `▾ ${l.offres!.length} offre(s)`}
            </button>
          )}
          {/* ⚠️ « jamais compté » ≠ « zéro » : le premier dit que personne
              n'a regardé. */}
          {l.tenu === null
            ? <span className="ml-1 text-amber-700">jamais compté</span>
            : comptagePerime(l)
              ? <span className="ml-1 text-red-700">compté le {l.compte_le} — périmé</span>
              : <> · compté le {l.compte_le ?? '—'}</>}
        </p>
      </div>

      <span className="w-20 text-right tabular-nums">
        {l.tenu === null ? <span className="text-zinc-400">—</span> : l.tenu}
        <span className="block text-[10px] text-zinc-400">en stock</span>
      </span>

      {/* ⚠️⚠️ CE QUI EST DÉJÀ EN ROUTE. Sans cette colonne l'écran redemande
          ce qu'on vient de commander : mesuré le 05/10/2026, 150 pâtons
          commandés le matin et 280 réclamés l'après-midi. Deux livraisons
          pour un besoin, et on ne s'en aperçoit qu'au déchargement. */}
      <span className="w-20 text-right tabular-nums">
        {l.enCommande > 0
          ? <span className="font-medium text-blue-700">{l.enCommande}</span>
          : <span className="text-zinc-300">—</span>}
        <span className="block text-[10px] text-zinc-400">commandé</span>
      </span>

      <label className="w-20">
        <input inputMode="decimal" defaultValue={l.seuil ?? ''}
          onChange={ev => saisir(l.cle, 'seuil', ev.target.value)}
          className="h-9 w-full rounded border border-zinc-300 px-2 text-right tabular-nums" />
        <span className="block text-[10px] text-zinc-400">seuil</span>
      </label>

      <label className="w-20">
        <input inputMode="decimal" defaultValue={l.cible ?? ''}
          onChange={ev => saisir(l.cle, 'cible', ev.target.value)}
          className={`h-9 w-full rounded border px-2 text-right tabular-nums ${
            l.cible == null ? 'border-amber-400 bg-amber-50' : 'border-zinc-300'}`} />
        <span className="block text-[10px] text-zinc-400">cible</span>
      </label>

      <span className="w-24 text-right tabular-nums font-semibold">
        {q > 0 ? q : <span className="text-zinc-300">—</span>}
        <span className="block text-[10px] font-normal text-zinc-400">à commander</span>
      </span>

      <span className="w-24 text-right tabular-nums text-zinc-600">
        {c == null
          ? (q > 0 ? <span className="text-amber-700">prix inconnu</span> : '')
          : fmtPrix(c)}
      </span>

      <span className={`w-28 rounded px-1.5 py-0.5 text-center text-[11px] font-medium ${ETAT[e].classe}`}>
        {ETAT[e].texte}
      </span>
    </div>
    {ouvert && <Offres l={l} />}
   </div>
  )
}

/**
 * ⚠️ LE SÉLECTEUR DE FOURNISSEUR, SUR LA LIGNE DE COMMANDE.
 *
 * C'est le même mécanisme que l'onglet 🧺 de `/admin/achats`, et il
 * appelle la même action — pas une seconde implémentation. Ce qui change
 * est l'ENDROIT : on décide au moment où on regarde ce qu'il faut
 * commander, pas en changeant d'écran et en perdant la ligne.
 *
 * ⚠️⚠️ ET C'EST CE QUI REND LE BON CHIFFRABLE. Une ligne simplement
 * RÉAIGUILLÉE par `auMoinsCher` part sans prix, et le bon sans montant :
 * notre coût est celui de NOTRE conditionnement, le leur celui du sien.
 * Basculer pour de bon reprend le prix du fournisseur, donc le bon porte
 * un total au lieu d'un « tarif à confirmer ».
 */
function Offres({ l }: { l: LigneReassort }) {
  const [enCours, demarrer] = useTransition()
  const [mot, setMot] = useState<string | null>(null)
  const offres = l.offres ?? []

  const prendre = (o: NonNullable<LigneReassort['offres']>[number]) => {
    // ⚠️ LE PRIX SUIT LE FOURNISSEUR. Garder l'ancien après avoir changé
    // affirmerait qu'on paie un tarif qui ne s'applique plus — c'est plus
    // faux que de reprendre le nouveau. Ce qui protège n'est pas le refus,
    // c'est le DRAPEAU : un prix qui ne vient pas d'une facture arrive
    // marqué « estimé » (0165).
    const p = prixReprenable(o, l.unite)
    const repris = p != null
    demarrer(async () => {
      const r = await basculerFournisseur({
        cle: l.cle,
        fournisseur_id: o.fournisseur_id,
        // ⚠️⚠️ LA RÉFÉRENCE DE L'ANCIEN FOURNISSEUR NE SURVIT PAS. Un code
        // Gineys cité à Félix Potin fait chiffrer autre chose, et l'écart
        // se découvre à la livraison : une référence fausse est pire
        // qu'une référence absente (0142).
        reference: o.reference ?? null,
        // ⚠️ Unité discordante : on reprend le fournisseur et PAS le prix.
        // L'ancien est réécrit tel quel — l'effacer perdrait le seul
        // chiffre qu'on ait, et un `null` se lit « prix inconnu » sur
        // l'écran qui déclenche la commande.
        prix: repris ? p.prix : l.cout_unitaire_ht,
        prix_releve: repris ? o.nature === 'facture' : !l.estime,
      })
      // ⚠️ UN PRIX CONVERTI MONTRE SON CALCUL. Un nombre dérivé qu'on ne
      // sait pas décomposer n'est pas vérifiable, et c'est la première
      // chose qu'on conteste quand il paraît faux.
      const calcul = p == null ? '' : p.converti
        ? ` Prix converti : ${fmtPrix(o.prix_ref)}/${o.unite_ref} × ${p.facteur} `
          + `${o.unite_ref} = ${fmtPrix4(p.prix)} par ${l.unite}.`
        : ` Prix repris : ${fmtPrix(p.prix)}/${o.unite_ref}.`
      setMot(r.ok
        ? r.message + (repris
            ? calcul + (o.nature === 'facture'
                ? ' (prix payé)'
                : ` ⚠️ Il vient d'un ${o.nature} : marqué ESTIMÉ jusqu'à leur première facture.`)
            : ` ⚠️ Le PRIX n'est pas repris : l'offre est en ${o.unite_ref} et notre unité `
              + `(« ${l.unite ?? 'inconnue'} ») ne dit pas combien elle en contient. `
              + `À saisir dans la fiche.`)
        : '⚠️ ' + r.message)
    })
  }

  return (
    <div className="border-t border-violet-100 bg-violet-50/60 px-3 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wider text-violet-900">
        {offres.length} offre(s) moins chère(s) — {l.nom}
      </p>
      <ul className="mt-1.5 space-y-1">
        {/* ⚠️ TOUTES les offres, pas seulement la meilleure : le deuxième
            livre peut-être le lendemain, ou sans minimum de commande. */}
        {offres.map(o => {
          // ⚠️⚠️ L'ÉCART DU CATALOGUE N'EST PAS L'EFFET SUR NOTRE PRIX, et
          // les deux peuvent diverger de signe. `ecartPct` compare l'offre
          // à la ligne de catalogue de NOTRE fournisseur ; ce qu'on paie
          // vraiment est `cout_unitaire_ht`, qui a pu être posé à la main,
          // relevé sur une facture ou basculé avant. Mesuré le 05/10/2026 :
          // la sauce moutarde est annoncée moins chère chez La Frite Belge
          // et coûterait +12,5 % de plus que ce qu'on paie. Afficher le
          // seul écart catalogue ferait basculer vers un prix PLUS CHER
          // avec un pourcentage négatif sous les yeux.
          const p = prixReprenable(o, l.unite)
          const nous = l.cout_unitaire_ht
          const effet = p != null && nous != null && nous > 0 ? p.prix / nous - 1 : null
          return (
          <li key={o.fournisseur_id + o.designation}
            className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="w-14 text-right font-bold tabular-nums text-violet-800">
              −{fmtEcart(o.ecartPct)}
            </span>
            <span className="font-medium text-zinc-900">{o.fournisseur}</span>
            <span className="tabular-nums text-zinc-700">{fmtPrix(o.prix_ref)}/{o.unite_ref}</span>
            {/* ⚠️ La NATURE change ce qu'on a le droit d'en conclure : un
                devis est une proposition, une facture une preuve. */}
            <NatureOffre nature={o.nature} />
            {/* CE QUE ÇA FAIT À NOTRE PRIX — le seul chiffre qui décide. */}
            {p == null
              ? <span className="rounded bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-800">
                  prix à saisir
                </span>
              : <span className="tabular-nums text-zinc-900">
                  → {fmtPrix4(p.prix)}/{l.unite}
                  {effet != null && (
                    <span className={`ml-1 rounded px-1.5 py-px text-[10px] font-bold ${
                      effet > 0.001 ? 'bg-red-100 text-red-800'
                      : effet < -0.001 ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-zinc-100 text-zinc-600'}`}>
                      {effet > 0.001 ? '⚠️ +' : effet < -0.001 ? '−' : '='}
                      {Math.abs(effet) > 0.001 ? fmtEcart(Math.abs(effet) * 100) : ''}
                    </span>
                  )}
                </span>}
            <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-500">
              {o.designation}{o.reference && <> · réf. {o.reference}</>}
            </span>
            <button onClick={() => prendre(o)} disabled={enCours}
              className="rounded border border-violet-400 bg-white px-2 py-1 text-[11px] font-bold text-violet-800 hover:bg-violet-100 disabled:opacity-40">
              {enCours ? '…' : 'Prendre celui-ci'}
            </button>
          </li>
          )
        })}
      </ul>
      {mot && <p className="mt-1.5 text-[12px] font-medium text-zinc-800">{mot}</p>}
      <p className="mt-1.5 text-[11px] text-violet-900">
        ⚠️ Le pourcentage violet à gauche compare les deux <strong>catalogues</strong> ;
        la pastille verte ou rouge dit ce que ça fait à <strong>ce que nous payons</strong> —
        les deux peuvent diverger de signe, et c&apos;est la seconde qui décide.
        {' '}Un écart ne décide de rien tant qu&apos;il n&apos;est pas multiplié par les quantités
        réelles : vérifiez le minimum de commande et le délai avant de basculer.
        {' '}Le prix est ramené à notre unité d&apos;achat quand elle dit sa contenance
        {prixReprenable(offres[0], l.unite) == null && (
          <> — ⚠️ ce n&apos;est pas le cas de « <strong>{l.unite ?? 'inconnue'}</strong> », qui ne dit
          pas combien de {offres[0].unite_ref} elle contient : seuls le fournisseur et sa
          référence seront repris</>
        )}.
      </p>
    </div>
  )
}

const NATURE_OFFRE: Record<string, { texte: string; classe: string }> = {
  facture:   { texte: 'prix payé', classe: 'bg-emerald-100 text-emerald-800' },
  devis:     { texte: 'devis',     classe: 'bg-blue-100 text-blue-800' },
  portail:   { texte: 'portail',   classe: 'bg-violet-100 text-violet-800' },
  catalogue: { texte: 'catalogue', classe: 'bg-zinc-100 text-zinc-700' },
}

function NatureOffre({ nature }: { nature: string }) {
  const n = NATURE_OFFRE[nature] ?? { texte: nature, classe: 'bg-zinc-100 text-zinc-700' }
  return <span className={`rounded px-1.5 py-px text-[10px] font-medium ${n.classe}`}>{n.texte}</span>
}

function Bloc({ titre, sous, cout, children }: {
  titre: string; sous: string; cout: number; children: React.ReactNode
}) {
  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-zinc-200">
      <header className="flex flex-wrap items-baseline justify-between gap-2 bg-zinc-50 px-3 py-2">
        <h2 className="font-semibold text-zinc-900">{titre}</h2>
        <span className="text-[12px] text-zinc-500">{sous}</span>
        {cout > 0 && <span className="tabular-nums text-sm font-medium">{fmtPrix(cout)}</span>}
      </header>
      {children}
    </section>
  )
}

function Chiffre({ n, texte, libelle, accent }: { n?: number; texte?: string; libelle: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
      <p className={`text-xl font-semibold tabular-nums ${accent ?? 'text-zinc-900'}`}>
        {texte ?? n?.toLocaleString('fr-FR')}
      </p>
      <p className="text-[11px] text-zinc-500">{libelle}</p>
    </div>
  )
}

function Bascule({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`h-11 rounded-lg border px-3 text-sm ${actif ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300'}`}>
      {children}
    </button>
  )
}
