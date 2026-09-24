// Les clôtures de caisse — le Z, vu par la caisse elle-même.
//
// Contrat relevé sur https://docs.zelty.fr (section Closures, lue le
// 24/09/2026 depuis le back-office connecté) :
//
//   GET /closures?after=AAAA-MM-JJ&before=AAAA-MM-JJ&limit=500&offset=N
//   → { closures: [{ id, id_restaurant, created_at, date, turnover,
//                    comment, taxes }], errno }
//
// ─── Pourquoi c'est le témoin qui manquait ─────────────────────────────────
//
// Le rapprochement quotidien (0139) confronte ce que la caisse nous a POUSSÉ
// à ce qu'on en a COMPRIS. Les deux viennent du même flux : si un ticket ne
// nous est jamais parvenu, aucun des deux ne le sait, et la journée s'affiche
// « ok » alors qu'elle est amputée. Le Z, lui, est le chiffre que la caisse
// déclare POUR ELLE-MÊME — celui du comptable. Il est indépendant de notre
// ingestion, et c'est ce qui le rend utile.
//
// ⚠️ `turnover` et `taxes` sont en CENTIMES. Le reste de nos tables est en
// euros : mélanger les deux dans la même ligne donnerait un écart faux d'un
// facteur cent, et un écart faux est pire qu'aucun écart puisqu'on y croit.
//
// ⚠️ `restaurant_ids` doit partir en TABLEAU RÉPÉTÉ
// (`restaurant_ids[]=5146&restaurant_ids[]=5134`). La documentation le dit
// noir sur blanc : une chaîne séparée par des virgules n'est PAS découpée,
// elle est silencieusement tronquée à sa première valeur par `intval()`. Sur
// un compte multi-établissements, on croirait rapprocher les deux et on n'en
// verrait qu'un. Notre clé étant liée à un seul restaurant, on ne l'envoie
// pas du tout.

import { z } from 'zod'

export const clotureZelty = z.object({
  id: z.number().nullish(),
  id_restaurant: z.number().nullish(),
  created_at: z.string().nullish(),
  /** Jour de la clôture, AAAA-MM-JJ. */
  date: z.string().nullish(),
  /** Chiffre d'affaires total, EN CENTIMES. */
  turnover: z.number().nullish(),
  comment: z.string().nullish(),
  /** TVA totale, EN CENTIMES. */
  taxes: z.number().nullish(),
}).passthrough()

export const reponseClotures = z.object({
  closures: z.array(clotureZelty),
  errno: z.number().nullish(),
})

export type ClotureNormalisee = {
  id_externe: string
  date: string
  ca_ttc: number
  taxes: number
  commentaire: string | null
}

const centimesEnEuros = (n: number | null | undefined): number =>
  Math.round((n ?? 0)) / 100

/** Une clôture exploitable, ou rien.
 *
 *  ⚠️ Une clôture sans DATE est inutilisable : on ne saurait à quelle journée
 *  la comparer. Mieux vaut l'écarter en le disant que la rattacher au hasard. */
export function normaliser(
  brut: unknown,
): { ok: true; cloture: ClotureNormalisee } | { ok: false; motif: string } {
  const parsed = clotureZelty.safeParse(brut)
  if (!parsed.success) return { ok: false, motif: parsed.error.issues[0].message }
  const c = parsed.data

  const date = (c.date ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, motif: `clôture ${c.id ?? '?'} sans date exploitable` }
  }

  return {
    ok: true,
    cloture: {
      id_externe: String(c.id ?? ''),
      date,
      ca_ttc: centimesEnEuros(c.turnover),
      taxes: centimesEnEuros(c.taxes),
      commentaire: (c.comment ?? '').trim() || null,
    },
  }
}

/** Plusieurs clôtures peuvent tomber le MÊME jour — une caisse qui ferme deux
 *  fois, ou deux caisses. On les additionne, et on garde tous les
 *  identifiants : présenter l'une d'elles comme « le » Z du jour ferait
 *  apparaître un écart qui n'existe pas. */
export function agregerParJour(clotures: ClotureNormalisee[]): Map<string, {
  ids: string[]; ca_ttc: number; taxes: number; commentaires: string[]
}> {
  const parJour = new Map<string, { ids: string[]; ca_ttc: number; taxes: number; commentaires: string[] }>()
  for (const c of clotures) {
    const e = parJour.get(c.date) ?? { ids: [], ca_ttc: 0, taxes: 0, commentaires: [] }
    e.ids.push(c.id_externe)
    e.ca_ttc = Math.round((e.ca_ttc + c.ca_ttc) * 100) / 100
    e.taxes = Math.round((e.taxes + c.taxes) * 100) / 100
    if (c.commentaire) e.commentaires.push(c.commentaire)
    parJour.set(c.date, e)
  }
  return parJour
}
