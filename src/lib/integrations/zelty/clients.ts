// Clients Zelty ↔ nos clients (module 20).
//
// Traduction PURE. La forme vient de `GET /customers`, observée le 24/09/2026
// sur le compte Casatasia.
//
// ─── Pourquoi ce pont ──────────────────────────────────────────────────────
//
// Il y a deux fichiers clients, donc aucun des deux n'est LE fichier client :
// celui qui commande sur casatasia.fr est chez nous, avec sa fidélité, ses
// allergies mémorisées et ses segments ; celui qui donne son nom au comptoir
// est chez Zelty. Le même habitué peut exister deux fois, et sa fidélité se
// partage entre deux comptes dont aucun n'est juste.
//
// ─── ⚠️ LA RÈGLE QUI PRIME SUR TOUTES LES AUTRES ───────────────────────────
//
// UN CONSENTEMENT NE SE DEVINE PAS, NE SE COPIE PAS, NE S'ÉCRASE JAMAIS.
// `opt_in_marketing` chez nous, `accept_marketing` / `sms_optin` /
// `mail_optin` chez eux. Un client qui a dit non ici et dont la fiche caisse
// porte un `true` par défaut ne doit PAS se retrouver réabonné : ce n'est pas
// un défaut d'affichage, c'est une infraction, et elle se paie en plainte CNIL
// plutôt qu'en ticket de support.
//
// D'où deux règles absolues, appliquées par `fusionner()` :
//   1. sur un client EXISTANT, le consentement n'est jamais touché ;
//   2. sur un client CRÉÉ depuis la caisse, il part à FALSE — même si Zelty
//      dit `true`. Leur `accept_marketing` vaut `true` par défaut sur toute
//      fiche créée par l'API, y compris celles que nous créons nous-mêmes :
//      c'est une valeur par défaut, pas un consentement recueilli.

import { z } from 'zod'

export const clientZelty = z.object({
  id: z.number(),
  uuid: z.string().nullish(),
  remote_id: z.string().nullish(),
  nice_name: z.string().nullish(),
  name: z.string().nullish(),
  fname: z.string().nullish(),
  company: z.string().nullish(),
  phone: z.string().nullish(),
  phone2: z.string().nullish(),
  mail: z.string().nullish(),
  birthday: z.string().nullish(),
  personal_info: z.string().nullish(),
  loyalty: z.number().nullish(),
  turnover: z.number().nullish(),
  nb_orders: z.number().nullish(),
  last_order_date: z.string().nullish(),
  accept_marketing: z.boolean().nullish(),
  sms_optin: z.boolean().nullish(),
  mail_optin: z.boolean().nullish(),
  vip: z.boolean().nullish(),
  updated_at: z.string().nullish(),
}).passthrough()

export type ClientZelty = z.infer<typeof clientZelty>

export const reponseCustomers = z.object({
  customers: z.array(clientZelty),
  errno: z.number().nullish(),
})

/** Un numéro comparable : Zelty normalise en +33…, nous saisissons 06…
 *
 *  ⚠️ Sans cette mise à plat, « 0767453444 » et « +33767453444 » sont deux
 *  clients différents — et le rapprochement échouerait sur la moitié du
 *  fichier, là même où il devrait servir. */
export function telephoneComparable(tel: string | null | undefined): string | null {
  if (!tel) return null
  const chiffres = tel.replace(/[^\d+]/g, '')
  if (chiffres.startsWith('+33')) return '0' + chiffres.slice(3)
  if (chiffres.startsWith('0033')) return '0' + chiffres.slice(4)
  if (chiffres.startsWith('33') && chiffres.length === 11) return '0' + chiffres.slice(2)
  return chiffres || null
}

/** Un email comparable. Les majuscules d'un formulaire ne font pas un autre
 *  client. */
export function emailComparable(mail: string | null | undefined): string | null {
  const m = (mail ?? '').trim().toLowerCase()
  return m && m.includes('@') ? m : null
}

export type ClientNormalise = {
  caisse_externe_systeme: 'zelty'
  caisse_externe_id: string
  prenom: string | null
  nom: string | null
  email: string | null
  telephone: string | null
  date_naissance: string | null
  notes_internes: string | null
}

/** Caisse → nous. */
export function normaliser(
  brut: unknown,
): { ok: true; client: ClientNormalise; avertissements: string[] } | { ok: false; motif: string } {
  const parsed = clientZelty.safeParse(brut)
  if (!parsed.success) return { ok: false, motif: parsed.error.issues[0].message }
  const c = parsed.data
  const avertissements: string[] = []

  const email = emailComparable(c.mail)
  const telephone = telephoneComparable(c.phone)

  // ⚠️ Un client sans email NI téléphone ne peut être rapproché de personne et
  // ne sert à rien : l'importer créerait une fiche muette de plus, et le
  // fichier client se remplirait de doublons impossibles à fusionner.
  if (!email && !telephone) {
    avertissements.push(`client Zelty ${c.id} sans email ni téléphone — non rapprochable`)
  }

  // `birthday` peut arriver en ISO complet ; la date seule suffit.
  const naissance = c.birthday ? String(c.birthday).slice(0, 10) : null

  return {
    ok: true,
    avertissements,
    client: {
      caisse_externe_systeme: 'zelty',
      caisse_externe_id: String(c.id),
      prenom: (c.fname || '').trim() || null,
      nom: (c.name || '').trim() || null,
      email,
      telephone,
      date_naissance: /^\d{4}-\d{2}-\d{2}$/.test(naissance ?? '') ? naissance : null,
      // `personal_info` est le champ libre de la caisse. Il peut contenir une
      // allergie notée à la volée — on le garde en notes, jamais dans le champ
      // `allergies`, qui engage.
      notes_internes: (c.personal_info || '').trim() || null,
    },
  }
}

export type ClientExistant = {
  id: string
  prenom: string | null
  nom: string | null
  email: string | null
  telephone: string | null
  date_naissance: string | null
  notes_internes: string | null
  caisse_externe_id: string | null
}

/** Ce qu'on écrit sur un client DÉJÀ chez nous.
 *
 *  ⚠️ On COMPLÈTE, on ne remplace pas. Un prénom saisi au comptoir ne doit pas
 *  effacer celui que le client a écrit lui-même sur le site, et un champ vide
 *  côté caisse ne doit jamais vider le nôtre. Seuls les trous se bouchent. */
export function fusionner(
  existant: ClientExistant,
  entrant: ClientNormalise,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const complete = (champ: keyof ClientExistant & keyof ClientNormalise) => {
    const actuel = existant[champ]
    const nouveau = entrant[champ]
    if (!actuel && nouveau) patch[champ] = nouveau
  }
  complete('prenom')
  complete('nom')
  complete('email')
  complete('telephone')
  complete('date_naissance')

  // Les notes s'ajoutent au lieu de se remplacer : deux personnes peuvent
  // avoir noté deux choses vraies.
  if (entrant.notes_internes && !(existant.notes_internes ?? '').includes(entrant.notes_internes)) {
    patch.notes_internes = [existant.notes_internes, entrant.notes_internes]
      .filter(Boolean).join('\n')
  }

  // Le lien, toujours — c'est lui qui rend le prochain passage exact.
  if (!existant.caisse_externe_id) {
    patch.caisse_externe_systeme = entrant.caisse_externe_systeme
    patch.caisse_externe_id = entrant.caisse_externe_id
    patch.caisse_externe_at = new Date().toISOString()
  }

  // ⚠️ `opt_in_marketing` N'APPARAÎT JAMAIS ICI. Voir l'en-tête du fichier.
  return patch
}

/** Nous → caisse : corps du POST /customers.
 *
 *  ⚠️ On n'envoie AUCUN consentement. Zelty pose ses propres valeurs par
 *  défaut, et prétendre transmettre le nôtre supposerait que les deux
 *  systèmes recueillent la même chose — ce qui n'est pas vrai : notre
 *  `opt_in_marketing` couvre nos emails, pas leurs campagnes SMS. */
export function versZelty(client: {
  prenom: string | null
  nom: string | null
  email: string | null
  telephone: string | null
  id: string
}): { ok: true; corps: Record<string, unknown> } | { ok: false; motif: string } {
  const nom = (client.nom || '').trim()
  if (!nom) return { ok: false, motif: 'nom manquant' }
  if (!client.email && !client.telephone) {
    return { ok: false, motif: 'ni email ni téléphone — la fiche serait muette' }
  }
  return {
    ok: true,
    corps: {
      name: nom,
      ...(client.prenom ? { fname: client.prenom } : {}),
      ...(client.email ? { mail: client.email } : {}),
      ...(client.telephone ? { phone: client.telephone } : {}),
      // Notre identifiant chez eux : la correspondance devient exacte.
      remote_id: client.id,
    },
  }
}
