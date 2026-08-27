// CA par point de vente — calculé sur les LIGNES de vente.
//
// Source unique partagée par /admin/ventes et /admin/ventes-pdv. Deux pages
// qui ventilent le CA différemment finissent par afficher deux chiffres, et
// personne ne sait lequel croire.
//
// Pourquoi les lignes et non l'en-tête de commande :
//   · une caisse ne donne pas toujours le point de vente du ticket — Zelty
//     l'a confirmé en démo le 27/08/2026 : sur un compte unique, ses
//     statistiques ventilent par sur place / à emporter / livraison, jamais
//     par activité ;
//   · un même ticket mélange les activités : un café du Fournil et une pizza
//     sur la même addition.
//
// Le produit vendu, lui, sait toujours d'où il vient.
//
// Server-only (accès base).

import { createClient } from '@/lib/supabase/server'

export type CaPointDeVente = {
  /** null = ligne rattachable à aucun point de vente. */
  etablissement_id: string | null
  quantite: number
  ca: number
  caHT: number
  /** Ce qui vous reste : CA HT pour une vente, commission sinon (0136). */
  revenu: number
  /** Nombre de commandes distinctes touchant ce point de vente. */
  tickets: number
}

const arrondi = (n: number) => Math.round(n * 100) / 100

/**
 * Ventile le CA encaissé depuis `depuisIso` par point de vente.
 *
 * Le rattachement d'une ligne suit l'ordre : établissement du PRODUIT, puis
 * établissement de la COMMANDE en repli. Une ligne sans ni l'un ni l'autre
 * tombe sous `etablissement_id: null` plutôt que d'être absorbée en silence.
 */
export async function caParPointDeVente(depuisIso: string): Promise<CaPointDeVente[]> {
  const sb = await createClient()

  const { data: cmds } = await sb
    .from('commandes')
    .select('id, etablissement_id')
    .eq('statut', 'encaisse')
    .gte('created_at', depuisIso)

  const posDeCommande = new Map<string, string | null>()
  for (const c of cmds ?? []) posDeCommande.set(String(c.id), c.etablissement_id as string | null)
  const ids = [...posDeCommande.keys()]
  if (ids.length === 0) return []

  const acc = new Map<string, { q: number; ca: number; caHT: number; revenu: number; tickets: Set<string> }>()

  for (let i = 0; i < ids.length; i += 200) {
    const { data: arts } = await sb
      .from('commande_articles')
      .select(`commande_id, quantite, prix_unitaire_ttc, tva_taux,
               recette:recettes(tva, etablissement_id, type_revenu, commission_pct, commission_forfait_ht)`)
      .in('commande_id', ids.slice(i, i + 200))

    for (const a of arts ?? []) {
      const r = a.recette as {
        tva?: number | string | null; etablissement_id?: string | null
        type_revenu?: string | null
        commission_pct?: number | string | null
        commission_forfait_ht?: number | string | null
      } | null

      const q = Number(a.quantite ?? 0)
      const ca = q * Number(a.prix_unitaire_ttc ?? 0)
      const taux = Number(a.tva_taux ?? r?.tva ?? 5.5)
      const caHT = ca / (1 + taux / 100)

      const commission = r?.type_revenu === 'commission'
      const forfait = r?.commission_forfait_ht == null ? null : Number(r.commission_forfait_ht)
      const pct = r?.commission_pct == null ? null : Number(r.commission_pct)
      const revenu = !commission ? caHT
        : forfait != null ? q * forfait
        : pct != null ? ca * (pct / 100)
        : 0

      const cmdId = String(a.commande_id)
      const posId = r?.etablissement_id ?? posDeCommande.get(cmdId) ?? null
      const cle = posId ?? '—'
      const cur = acc.get(cle) ?? { q: 0, ca: 0, caHT: 0, revenu: 0, tickets: new Set<string>() }
      cur.q += q; cur.ca += ca; cur.revenu += revenu
      if (!commission) cur.caHT += caHT
      cur.tickets.add(cmdId)
      acc.set(cle, cur)
    }
  }

  return [...acc.entries()]
    .map(([cle, v]) => ({
      etablissement_id: cle === '—' ? null : cle,
      quantite: v.q,
      ca: arrondi(v.ca),
      caHT: arrondi(v.caHT),
      revenu: arrondi(v.revenu),
      tickets: v.tickets.size,
    }))
    .sort((a, b) => b.ca - a.ca)
}
