// Module 8 — Logique métier fournisseurs.
// Pure functions partagées server / client.

import { fmtPrix as _fmtPrix, fmtPct as _fmtPct } from './foodCost'

export const fmtPrix = _fmtPrix
export const fmtPct  = _fmtPct

// ─── Modèles ─────────────────────────────────────────────────────────
export type Fournisseur = {
  id: string
  nom: string
  contact: string | null
  telephone: string | null
  email: string | null
  adresse: string | null
  conditions_tarifaires: string | null
  delai_livraison_jours: number
  minimum_commande: number
  jours_livraison: string[]
  note_qualite: number          // 1-5 saisi manuellement
  note_ponctualite: number      // 1-5 saisi manuellement
  actif: boolean
  created_at: string
}

export type BonCommandeLigne = {
  id: string
  bon_commande_id: string
  ingredient_id: string | null
  ingredient_nom?: string
  ingredient_unite?: string
  quantite_commandee: number
  prix_unitaire_ht: number
  quantite_recue: number
  temperature_reception: number | null
  dlc_observee: string | null
  etat_emballage: 'parfait' | 'correct' | 'abime' | 'rejete' | null
  note_qualite_ligne: number | null
  commentaire: string | null
}

export type BonCommande = {
  id: string
  fournisseur_id: string
  fournisseur_nom?: string
  statut: 'brouillon' | 'a_valider' | 'envoye' | 'recu' | 'annule'
  date_commande: string
  date_livraison_prevue: string | null
  montant_total_ht: number
  notes: string | null
  created_at: string
  reception_a_verifier?: boolean
  lignes: BonCommandeLigne[]
}

export type Facture = {
  id: string
  fournisseur_id: string
  fournisseur_nom?: string
  bon_commande_id: string | null
  numero: string
  date_emission: string
  date_echeance: string | null
  montant_ht: number
  montant_ttc: number
  statut: 'a_payer' | 'paye' | 'en_retard' | 'litige' | 'annule'
  /** 'avoir' = note de crédit du fournisseur, montants stockés en négatif */
  type_document: 'facture' | 'avoir'
  facture_liee_id: string | null
  paye_le: string | null
  notes: string | null
  created_at: string
}

// ─── Constantes UI ───────────────────────────────────────────────────
export const STATUT_BON_LABEL: Record<BonCommande['statut'], { label: string; emoji: string; cls: string }> = {
  brouillon: { label: 'Brouillon',      emoji: '📝', cls: 'bg-zinc-100 text-zinc-700 border-zinc-300' },
  a_valider: { label: 'À valider',      emoji: '🕓', cls: 'bg-amber-100 text-amber-900 border-amber-300' },
  envoye:    { label: 'Envoyé',         emoji: '📧', cls: 'bg-blue-100 text-blue-800 border-blue-300' },
  recu:      { label: 'Reçu',           emoji: '✅', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  annule:    { label: 'Annulé',         emoji: '❌', cls: 'bg-red-100 text-red-800 border-red-300' },
}

export const STATUT_FACTURE_LABEL: Record<Facture['statut'], { label: string; emoji: string; cls: string }> = {
  a_payer:   { label: 'À payer',        emoji: '⏳', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  paye:      { label: 'Payée',          emoji: '✓',  cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  en_retard: { label: 'En retard',      emoji: '🚨', cls: 'bg-red-100 text-red-800 border-red-300' },
  litige:    { label: 'Litige',         emoji: '⚠',  cls: 'bg-orange-100 text-orange-800 border-orange-300' },
  annule:    { label: 'Annulée',        emoji: '×',  cls: 'bg-zinc-100 text-zinc-700 border-zinc-300' },
}

export const ETAT_EMBALLAGE_LABEL: Record<NonNullable<BonCommandeLigne['etat_emballage']>, { label: string; cls: string }> = {
  parfait: { label: 'Parfait', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  correct: { label: 'Correct', cls: 'bg-blue-100 text-blue-800 border-blue-300' },
  abime:   { label: 'Abîmé',   cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  rejete:  { label: 'Rejeté',  cls: 'bg-red-100 text-red-800 border-red-300' },
}

export const JOURS_SEMAINE = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const
export type JourSemaine = typeof JOURS_SEMAINE[number]

// ─── Score fournisseur ───────────────────────────────────────────────
// Pour l'instant : moyenne (qualité + ponctualité). Le score prix sera
// ajouté quand on aura plus de données comparatives.
export type ScoreFournisseur = {
  score: number              // 1-5
  qualite: number
  ponctualite: number
  prix: number | null        // null si pas assez de données
  details: string
}

export function scoreFournisseur(f: Fournisseur): ScoreFournisseur {
  const score = (Number(f.note_qualite ?? 0) + Number(f.note_ponctualite ?? 0)) / 2
  return {
    score: Math.round(score * 10) / 10,
    qualite: Number(f.note_qualite ?? 0),
    ponctualite: Number(f.note_ponctualite ?? 0),
    prix: null,
    details: `Qualité ${f.note_qualite}/5 · Ponctualité ${f.note_ponctualite}/5`,
  }
}

// ─── Alerte hausse prix ──────────────────────────────────────────────
// Détecte les ingrédients dont le dernier prix est > +5% par rapport
// à l'avant-dernier. Calcule l'impact sur les recettes utilisant cet
// ingrédient.

export type EntreePrix = {
  ingredient_id: string
  prix_achat_ht: number
  created_at: string
  fournisseur_id: string | null
  source: 'creation' | 'manuel' | 'livraison' | 'bon_commande'
}

export type HaussePrix = {
  ingredient_id: string
  ingredient_nom: string
  ingredient_unite: string
  prix_avant: number
  prix_actuel: number
  delta_eur: number
  delta_pct: number              // ex. 12.5 (= +12.5%)
  fournisseur_actuel?: string
  date_changement: string
}

export function detecterHaussesPrix(
  entrees: EntreePrix[],
  ingredients: Array<{ id: string; nom: string; unite: string }>,
  seuilPct = 5
): HaussePrix[] {
  // Group entries by ingredient + sort by date asc
  const map = new Map<string, EntreePrix[]>()
  for (const e of entrees) {
    if (!map.has(e.ingredient_id)) map.set(e.ingredient_id, [])
    map.get(e.ingredient_id)!.push(e)
  }
  const out: HaussePrix[] = []
  for (const [ing_id, lignes] of map.entries()) {
    if (lignes.length < 2) continue
    lignes.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const dernier = lignes[lignes.length - 1]
    const precedent = lignes[lignes.length - 2]
    if (precedent.prix_achat_ht <= 0) continue
    const delta_pct = ((dernier.prix_achat_ht - precedent.prix_achat_ht) / precedent.prix_achat_ht) * 100
    if (delta_pct < seuilPct) continue
    const ing = ingredients.find(i => i.id === ing_id)
    if (!ing) continue
    out.push({
      ingredient_id: ing_id,
      ingredient_nom: ing.nom,
      ingredient_unite: ing.unite,
      prix_avant:   Number(precedent.prix_achat_ht),
      prix_actuel:  Number(dernier.prix_achat_ht),
      delta_eur:    Number(dernier.prix_achat_ht) - Number(precedent.prix_achat_ht),
      delta_pct,
      date_changement: dernier.created_at,
    })
  }
  return out.sort((a, b) => b.delta_pct - a.delta_pct)
}

/**
 * Pour une hausse de prix donnée, calcule l'impact sur les recettes
 * qui utilisent cet ingrédient (food cost et marge nouvelle vs ancienne).
 */
export type ImpactMarge = {
  recette_id: string
  recette_nom: string
  prix_vente_ht: number
  surcout_par_portion: number     // €/portion supplémentaire
  food_cost_avant_pct: number
  food_cost_apres_pct: number
  marge_avant_eur: number
  marge_apres_eur: number
}

export function impactSurMarges(
  hausse: HaussePrix,
  recettes: Array<{
    id: string
    nom: string
    nb_portions: number
    prix_vente_ht: number
    ingredients: Array<{ ingredient_id: string; quantite: number; prix_achat_ht_actuel: number }>
  }>
): ImpactMarge[] {
  const out: ImpactMarge[] = []
  for (const r of recettes) {
    const ing = r.ingredients.find(li => li.ingredient_id === hausse.ingredient_id)
    if (!ing) continue
    const cout_avant = r.ingredients.reduce((s, li) => {
      const prix = li.ingredient_id === hausse.ingredient_id ? hausse.prix_avant : li.prix_achat_ht_actuel
      return s + li.quantite * prix
    }, 0) / Math.max(1, r.nb_portions)
    const cout_apres = r.ingredients.reduce((s, li) => {
      const prix = li.ingredient_id === hausse.ingredient_id ? hausse.prix_actuel : li.prix_achat_ht_actuel
      return s + li.quantite * prix
    }, 0) / Math.max(1, r.nb_portions)
    const surcout = cout_apres - cout_avant
    const fc_avant = r.prix_vente_ht > 0 ? (cout_avant / r.prix_vente_ht) * 100 : 0
    const fc_apres = r.prix_vente_ht > 0 ? (cout_apres / r.prix_vente_ht) * 100 : 0
    out.push({
      recette_id: r.id,
      recette_nom: r.nom,
      prix_vente_ht: r.prix_vente_ht,
      surcout_par_portion: Math.round(surcout * 10000) / 10000,
      food_cost_avant_pct: fc_avant,
      food_cost_apres_pct: fc_apres,
      marge_avant_eur: r.prix_vente_ht - cout_avant,
      marge_apres_eur: r.prix_vente_ht - cout_apres,
    })
  }
  return out.sort((a, b) => b.surcout_par_portion - a.surcout_par_portion)
}

// ─── Comparateur prix entre fournisseurs ─────────────────────────────
// Pour un ingrédient donné, agrège le dernier prix par fournisseur.
export type LigneComparateur = {
  ingredient_id: string
  ingredient_nom: string
  unite: string
  prix_actuel: number              // prix de référence en cours sur ingredients
  fournisseurs: Array<{
    fournisseur_id: string | null
    fournisseur_nom: string
    dernier_prix: number
    derniere_date: string
    nb_livraisons: number
  }>
  prix_min: number
  prix_max: number
  ecart_pct: number                // (max-min)/min × 100
}

export function comparerPrix(
  entrees: EntreePrix[],
  ingredients: Array<{ id: string; nom: string; unite: string; prix_achat_ht: number }>,
  fournisseurs: Array<{ id: string; nom: string }>
): LigneComparateur[] {
  const ingMap = new Map(ingredients.map(i => [i.id, i]))
  const fournisseurMap = new Map(fournisseurs.map(f => [f.id, f]))

  // Group: ingredient_id × fournisseur_id → last entry
  type Bucket = { dernier_prix: number; derniere_date: string; nb_livraisons: number; nom: string }
  const grid = new Map<string, Map<string, Bucket>>()  // ing_id → (fourn_id|'_inconnu' → Bucket)

  for (const e of entrees) {
    if (!ingMap.has(e.ingredient_id)) continue
    const fid = e.fournisseur_id ?? '_inconnu'
    const fnom = e.fournisseur_id ? (fournisseurMap.get(e.fournisseur_id)?.nom ?? 'Inconnu') : 'Sans fournisseur'
    if (!grid.has(e.ingredient_id)) grid.set(e.ingredient_id, new Map())
    const sub = grid.get(e.ingredient_id)!
    const existing = sub.get(fid)
    if (!existing || new Date(e.created_at) > new Date(existing.derniere_date)) {
      sub.set(fid, {
        dernier_prix: e.prix_achat_ht,
        derniere_date: e.created_at,
        nb_livraisons: (existing?.nb_livraisons ?? 0) + 1,
        nom: fnom,
      })
    } else {
      existing.nb_livraisons++
    }
  }

  const out: LigneComparateur[] = []
  for (const [ing_id, ing] of ingMap.entries()) {
    const sub = grid.get(ing_id)
    if (!sub || sub.size === 0) continue
    const fournisseursList = Array.from(sub.entries()).map(([fid, b]) => ({
      fournisseur_id: fid === '_inconnu' ? null : fid,
      fournisseur_nom: b.nom,
      dernier_prix: Number(b.dernier_prix),
      derniere_date: b.derniere_date,
      nb_livraisons: b.nb_livraisons,
    }))
    const prix_min = Math.min(...fournisseursList.map(f => f.dernier_prix))
    const prix_max = Math.max(...fournisseursList.map(f => f.dernier_prix))
    const ecart_pct = prix_min > 0 ? ((prix_max - prix_min) / prix_min) * 100 : 0
    out.push({
      ingredient_id: ing_id,
      ingredient_nom: ing.nom,
      unite: ing.unite,
      prix_actuel: ing.prix_achat_ht,
      fournisseurs: fournisseursList.sort((a, b) => a.dernier_prix - b.dernier_prix),
      prix_min,
      prix_max,
      ecart_pct,
    })
  }
  return out
    .filter(l => l.fournisseurs.length >= 2)  // n'afficher que ceux avec ≥ 2 fournisseurs
    .sort((a, b) => b.ecart_pct - a.ecart_pct)
}

// ─── Alertes factures ────────────────────────────────────────────────
export type AlerteFacture = {
  facture: Facture
  jours_avant_echeance: number      // négatif si en retard
  niveau: 'urgent' | 'cette_semaine' | 'a_venir'
}

export function alertesFactures(factures: Facture[], joursPreavis = 7): AlerteFacture[] {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const out: AlerteFacture[] = []
  for (const f of factures) {
    if (f.statut === 'paye' || f.statut === 'annule') continue
    if (!f.date_echeance) continue
    const eche = new Date(f.date_echeance); eche.setHours(0, 0, 0, 0)
    const jours = Math.round((eche.getTime() - today.getTime()) / 86400000)
    let niveau: AlerteFacture['niveau']
    if (jours < 0)         niveau = 'urgent'
    else if (jours <= joursPreavis) niveau = 'cette_semaine'
    else continue
    out.push({ facture: f, jours_avant_echeance: jours, niveau })
  }
  return out.sort((a, b) => a.jours_avant_echeance - b.jours_avant_echeance)
}
