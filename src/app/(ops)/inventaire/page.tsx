// Inventaire hebdomadaire — comptage du stock produit par produit (0130).
//
// Fournit à la saisie le dernier inventaire (pré-remplissage des repères) et
// la valeur du stock précédent, pour afficher l'évolution.

import { createClient } from '@/lib/supabase/server'
import { extraireConditionnement } from '@/lib/commande-fournisseur'
import InventaireClient from './InventaireClient'

export const metadata = { title: 'Inventaire' }
export const dynamic = 'force-dynamic'

// Le bar et le Fournil ne se comptent ni au même moment, ni par la même
// personne, ni dans la même pièce. Mélanger leurs lignes dans un seul écran
// rendrait le comptage du matin plus long pour rien — et un inventaire qu'on
// abrège est un inventaire faux. D'où un écran par poste.
const POSTES = {
  fournil: { tag: 'FOURNIL' as const, libelle: 'Fournil', emoji: '🥖' },
  bar:     { tag: 'BAR'     as const, libelle: 'Bar',     emoji: '🍷' },
}
type ClePoste = keyof typeof POSTES

export default async function InventairePage({
  searchParams,
}: { searchParams?: { poste?: string } }) {
  const poste: ClePoste = searchParams?.poste === 'bar' ? 'bar' : 'fournil'
  const supabase = await createClient()
  const aujourdhui = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())

  // Tous les produits actifs, boissons comprises (le frigo à canettes se
  // compte aussi) — seules les formules, qui ne sont pas un stock, sortent.
  const [prodRes, jourRes, dernierRes, matRes, flRes] = await Promise.all([
    (() => {
      const q = supabase.from('recettes')
        .select('id, nom, categorie, cout_achat_ht, libelle_achat, unites_par_achat, nom_matiere')
        .eq('tag_destination', POSTES[poste].tag).eq('actif', true)
      // Un sandwich, un panini, une salade ou une formule ne se STOCKE pas :
      // ça s'assemble à la commande. Ce qui se compte, ce sont leurs
      // matières — chargées juste après depuis `ingredients`.
      if (poste === 'fournil') {
        return q.not('categorie', 'in', '("Formule","Formule petit-déjeuner","Sandwich","Panini","Salade")')
          .order('categorie').order('nom')
      }
      // Au bar, un Kir, un Spritz ou un panaché mélangent DEUX matières :
      // on ne les compte pas, on compte les bouteilles dont ils sortent.
      // Tout ce qui est comptable porte donc un `nom_matiere` explicite
      // (scripts/matieres-bar.mjs) — l'absence de lien vaut exclusion,
      // parce qu'un repli sur le nom du produit ferait apparaître « Kir »
      // comme une ligne de stock, et personne ne stocke des kirs.
      return q.not('nom_matiere', 'is', null).order('categorie').order('nom')
    })(),
    supabase.from('inventaires')
      .select('recette_id, ingredient_id, quantite')
      .eq('date_inventaire', aujourdhui),
    // Dernier inventaire AVANT aujourd'hui : repère par produit + valeur totale
    supabase.from('inventaires')
      .select('date_inventaire, recette_id, ingredient_id, quantite, cout_unitaire_ht')
      .lt('date_inventaire', aujourdhui)
      .order('date_inventaire', { ascending: false })
      .limit(400),
    // Matières premières réellement stockées (0133) : jambon, rosette,
    // mozzarella, emballages… `stocke` sépare le réel des 100 lignes de démo
    // héritées du modèle restaurant.
    // Les matières de `ingredients` sont celles du Fournil (jambon, mozza,
    // emballages). Le bar n'en a pas encore : ses matières sont portées par
    // les produits eux-mêmes (une bouteille de whisky SE VEND à la dose).
    // Les afficher sous le bar y mettrait le jambon du sandwich.
    poste === 'fournil'
      ? supabase.from('ingredients')
          .select('id, nom, categorie, unite, prix_achat_ht, libelle_achat')
          .eq('stocke', true).eq('actif', true)
          .order('categorie').order('nom')
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    // Lignes de facture — entrées de stock (dates portées par la facture)
    supabase.from('facture_lignes')
      .select('description, quantite, unite, facture:factures_fournisseurs(date_emission, type_document)'),
  ])

  // ── On compte des MATIÈRES, pas des produits vendus ─────────────────
  // Dans le congélateur il y a des pâtons, pas « Pizza ronde Reine », « Pizza
  // ronde chèvre-miel », « Pizza ronde poulet-pesto » ET « Panuozzi ». Dans la
  // réserve il y a une boîte de capsules, pas quatre cafés. Les produits qui
  // partagent un `libelle_achat` (0131) se replient donc en UNE ligne à
  // compter, portée par un représentant stable (le premier par id).
  //
  // Coût de la matière = cout_achat_ht × unites_par_achat : le coût stocké est
  // celui de l'unité VENDUE (1/10 de flan) ; on compte des flans entiers.
  type Ligne = {
    id: string; nom: string; categorie: string; cout: number | null
    libelleAchat: string | null; recetteIds: string[]; parAchat: number
  }
  const groupes = new Map<string, Ligne>()
  for (const r of (prodRes.data ?? []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    // Nom AFFICHÉ = ce qu'on compte (« Pâton à pizza »), pas le texte de la
    // facture (« PATON A PIZZA 250G C=40 »). Repli en cascade.
    const cle = ((r.nom_matiere as string) ?? '').trim()
      || ((r.libelle_achat as string) ?? '').trim()
      || (r.nom as string)
    const parAchat = Number(r.unites_par_achat ?? 1) || 1
    const deja = groupes.get(cle)
    if (deja) { deja.recetteIds.push(r.id as string); continue }
    const coutVendu = r.cout_achat_ht == null ? null : Number(r.cout_achat_ht)
    groupes.set(cle, {
      id: r.id as string,
      nom: cle,
      categorie: (r.categorie as string) ?? 'Autre',
      cout: coutVendu == null ? null : Math.round(coutVendu * parAchat * 10000) / 10000,
      libelleAchat: ((r.libelle_achat as string) ?? '').trim() || null,
      recetteIds: [r.id as string],
      parAchat,
    })
  }
  // Les matières premières rejoignent la liste, préfixées `ing:` pour que le
  // client sache sur quelle colonne écrire (recette_id ou ingredient_id).
  for (const m of matRes.data ?? []) {
    const unite = (m.unite as string) ?? ''
    groupes.set(`ing:${m.id}`, {
      id: `ing:${m.id}`,
      nom: unite ? `${m.nom} — ${unite}` : (m.nom as string),
      categorie: (m.categorie as string) ?? 'Matières',
      cout: m.prix_achat_ht == null ? null : Number(m.prix_achat_ht),
      libelleAchat: ((m.libelle_achat as string) ?? '').trim() || null,
      recetteIds: [],
      parAchat: 1,
    })
  }

  const produits = Array.from(groupes.values())
    .sort((a, b) => a.categorie.localeCompare(b.categorie, 'fr') || a.nom.localeCompare(b.nom, 'fr'))

  const dejaSaisi: Record<string, number> = {}
  for (const l of jourRes.data ?? []) {
    const cle = l.ingredient_id ? `ing:${l.ingredient_id}` : (l.recette_id as string)
    dejaSaisi[cle] = Number(l.quantite)
  }

  // Ne garder que le dernier inventaire (une seule date)
  // ⚠️ Le repère « la dernière fois » doit être celui de CE poste. Prendre la
  // dernière ligne toutes activités confondues afficherait au bar la valeur du
  // stock du Fournil — un chiffre juste, au mauvais endroit, donc un chiffre
  // faux pour qui le lit.
  const idsDuPoste = new Set(Array.from(groupes.values(), g => g.id))
  const cleLigne = (l: { ingredient_id?: unknown; recette_id?: unknown }) =>
    l.ingredient_id ? `ing:${l.ingredient_id}` : String(l.recette_id)
  const lignesDuPoste = (dernierRes.data ?? []).filter(l => idsDuPoste.has(cleLigne(l)))
  const datePrecedente = lignesDuPoste[0]?.date_inventaire as string | undefined
  const precedent: Record<string, number> = {}
  let valeurPrecedente = 0
  for (const l of lignesDuPoste) {
    if (l.date_inventaire !== datePrecedente) continue
    precedent[cleLigne(l)] = Number(l.quantite)
    valeurPrecedente += Number(l.quantite) * Number(l.cout_unitaire_ht ?? 0)
  }

  // ══ Stock théorique = dernier comptage + entrées − sorties ══════════
  //
  // Rien n'est STOCKÉ : tout est recalculé à l'ouverture depuis les sources
  // (comptages, factures, ventes). Un compteur entretenu à chaque vente
  // dériverait au premier oubli — un café offert, une saisie manquée — et un
  // stock auquel personne ne croit ne sert à rien. Ici, une facture scannée
  // en retard corrige le chiffre toute seule.
  //
  // Les SORTIES ne sont connues que pour les produits revendus tels quels
  // (la caisse dit exactement combien de croissants sont partis). Pour une
  // matière première — le jambon d'un sandwich — il faudrait une recette
  // chiffrée : hors modèle. On affiche alors les entrées seules, sans
  // prétendre à un théorique.
  const normalise = (x: string) =>
    x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

  const entrees = new Map<string, number>()
  if (datePrecedente) {
    type FL = {
      description: string; quantite: number | string | null; unite: string | null
      facture: { date_emission?: string; type_document?: string } | null
    }
    const depuis = (flRes.data ?? []) as unknown as FL[]
    for (const g of groupes.values()) {
      const cible = normalise(g.libelleAchat ?? g.nom)
      if (cible.length < 4) continue
      let recu = 0
      for (const l of depuis) {
        const f = l.facture
        if (!f?.date_emission || f.date_emission <= datePrecedente) continue
        // Un avoir est une marchandise RENDUE : elle sort du stock.
        const signe = f.type_document === 'avoir' ? -1 : 1
        if (!normalise(l.description).includes(cible)) continue
        const q = Number(l.quantite ?? 0)
        const cond = extraireConditionnement(l.description)
        const estPiece = /^(pce|pi[eè]ce|piece|p|u)s?$/.test(String(l.unite ?? '').toLowerCase())
        // Ligne au colis → × conditionnement pour retrouver des pièces.
        recu += signe * (estPiece || cond == null ? q : q * cond)
      }
      if (recu !== 0) entrees.set(g.id, Math.round(recu * 100) / 100)
    }
  }

  const sorties = new Map<string, number>()
  if (datePrecedente) {
    const { data: cmds } = await supabase.from('commandes').select('id')
      .eq('statut', 'encaisse').gte('created_at', datePrecedente + 'T00:00:00')
    const ids = (cmds ?? []).map(c => String(c.id))
    const venduParRecette = new Map<string, number>()
    for (let i = 0; i < ids.length; i += 200) {
      const { data: arts } = await supabase.from('commande_articles')
        .select('recette_id, quantite')
        .in('commande_id', ids.slice(i, i + 200)).neq('statut', 'annule')
      for (const a of arts ?? []) {
        if (!a.recette_id) continue
        venduParRecette.set(a.recette_id as string,
          (venduParRecette.get(a.recette_id as string) ?? 0) + Number(a.quantite ?? 0))
      }
    }
    for (const g of groupes.values()) {
      if (g.recetteIds.length === 0) continue
      let v = 0
      for (const rid of g.recetteIds) v += (venduParRecette.get(rid) ?? 0) / g.parAchat
      if (v > 0) sorties.set(g.id, Math.round(v * 100) / 100)
    }
  }

  const theorique: Record<string, number | null> = {}
  for (const g of groupes.values()) {
    const base = precedent[g.id]
    if (base == null) { theorique[g.id] = null; continue }
    // Sans suivi des sorties (matières premières), pas de théorique honnête.
    if (g.recetteIds.length === 0) { theorique[g.id] = null; continue }
    theorique[g.id] = Math.round((base + (entrees.get(g.id) ?? 0) - (sorties.get(g.id) ?? 0)) * 100) / 100
  }

  return (
    <InventaireClient
      entrees={Object.fromEntries(entrees)}
      sorties={Object.fromEntries(sorties)}
      theorique={theorique}
      produits={produits}
      dejaSaisi={dejaSaisi}
      precedent={precedent}
      datePrecedente={datePrecedente ?? null}
      valeurPrecedente={Math.round(valeurPrecedente * 100) / 100}
      dateJour={aujourdhui}
      poste={poste}
      postes={Object.entries(POSTES).map(([cle, p]) => ({ cle, ...p }))}
    />
  )
}
