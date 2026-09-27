// Le bon de commande qui part vraiment chez le fournisseur.
//
// Règles PURES : aucun réseau, aucune base. Testables sans compte.
//
// ⚠️ UN BON DE COMMANDE ENGAGE DE L'ARGENT. Tout ce qui suit est écrit
// dans ce sens : on refuse plutôt que d'envoyer approximativement, et on
// ne marque jamais « envoyé » ce qui n'est pas parti.

export type LigneBon = {
  libelle: string
  quantite: number
  unite: string | null
  /** Prix connu de l'unité commandée. NULL = on ne sait pas — et on le DIT. */
  prix_unitaire_ht: number | null
  /** Code article du fournisseur, quand on le connaît. */
  reference: string | null
}

export type RefusEnvoi =
  | 'sans_ligne' | 'sans_destinataire' | 'deja_envoye' | 'quantite_invalide'

/**
 * Peut-on envoyer ce bon ?
 *
 * ⚠️ Les quatre refus correspondent à quatre façons de se ridiculiser chez
 * un fournisseur, ou de payer deux fois.
 */
export function verifierEnvoi(input: {
  lignes: LigneBon[]
  email: string | null
  dejaEnvoyeLe: string | null
  /** Renvoi assumé après un échec ou une correction. */
  forcer?: boolean
}): { ok: true } | { ok: false; raison: RefusEnvoi; message: string } {
  if (!input.lignes.length) {
    return { ok: false, raison: 'sans_ligne',
      message: 'Ce bon n’a aucune ligne — il n’y a rien à commander.' }
  }
  // ⚠️ Une quantité nulle ou négative dans un document de commande, c'est
  // soit une ligne oubliée, soit un signe inversé. Les deux se découvrent
  // à la livraison.
  if (input.lignes.some(l => !(l.quantite > 0))) {
    return { ok: false, raison: 'quantite_invalide',
      message: 'Une ligne a une quantité nulle ou négative.' }
  }
  if (!input.email) {
    return { ok: false, raison: 'sans_destinataire',
      message: 'Ce fournisseur n’a pas d’adresse e-mail enregistrée.' }
  }
  // ⚠️ Le garde-fou qui compte : renvoyer un bon déjà parti, c'est une
  // seconde livraison et une seconde facture. Même raisonnement que le
  // refus de doublon sur les factures (0127).
  if (input.dejaEnvoyeLe && !input.forcer) {
    return { ok: false, raison: 'deja_envoye',
      message: `Ce bon est déjà parti le ${input.dejaEnvoyeLe.slice(0, 10).split('-').reverse().join('/')}. Le renvoyer risque une seconde livraison.` }
  }
  return { ok: true }
}

const eur = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const qte = (n: number) => Number.isInteger(n) ? String(n) : n.toLocaleString('fr-FR', { maximumFractionDigits: 3 })

/** Total des lignes dont le prix est CONNU, et combien ne le sont pas. */
export function totaux(lignes: LigneBon[]): { ht: number; sansPrix: number } {
  let ht = 0, sansPrix = 0
  for (const l of lignes) {
    if (l.prix_unitaire_ht == null) sansPrix++
    else ht += l.prix_unitaire_ht * l.quantite
  }
  return { ht: Number(ht.toFixed(2)), sansPrix }
}

/**
 * Le message envoyé au fournisseur.
 *
 * ⚠️ Chaque ligne porte la RÉFÉRENCE quand on l'a. Un commercial qui doit
 * retrouver « BAGUETTE PRECUITE 280G » dans son propre catalogue peut en
 * servir une autre, et ça se découvre au déchargement.
 *
 * ⚠️ Le total est annoncé comme INDICATIF, et le nombre de lignes sans prix
 * est dit. Un total présenté comme ferme alors qu'il ignore trois lignes
 * devient une contestation de facture.
 */
export function messageBonCommande(input: {
  fournisseur: string
  reference: string
  lignes: LigneBon[]
  dateLivraison: string | null
  notes: string | null
  etablissement?: string
  adresse?: string
}): { objet: string; texte: string } {
  const nom = input.etablissement ?? 'CASATASIA'
  const t = totaux(input.lignes)
  const largeur = Math.max(...input.lignes.map(l => l.libelle.length), 10)

  const lignes = input.lignes.map(l => {
    const ref = l.reference ? `[${l.reference}] ` : ''
    const prix = l.prix_unitaire_ht == null
      ? 'prix à confirmer'
      : `${eur(l.prix_unitaire_ht)} / ${l.unite ?? 'u'}`
    return `  · ${ref}${l.libelle.padEnd(largeur)}   ${qte(l.quantite).padStart(6)} ${(l.unite ?? '').padEnd(8)} ${prix}`
  })

  const corps = [
    `Bonjour,`,
    ``,
    `Merci de bien vouloir enregistrer la commande suivante pour ${nom} :`,
    ``,
    ...lignes,
    ``,
    t.sansPrix === 0
      ? `Total indicatif HT : ${eur(t.ht)}`
      : `Total indicatif HT : ${eur(t.ht)} — ${t.sansPrix} ligne${t.sansPrix > 1 ? 's' : ''} sans prix connu de notre côté, à confirmer.`,
    ``,
    input.dateLivraison
      ? `Livraison souhaitée : ${input.dateLivraison.split('-').reverse().join('/')}`
      : `Livraison : à votre prochain passage.`,
    ...(input.adresse ? [`Adresse de livraison : ${input.adresse}`] : []),
    ...(input.notes ? ['', input.notes] : []),
    ``,
    `Merci de nous confirmer la bonne réception de cette commande.`,
    ``,
    nom,
  ]

  return {
    objet: `${nom} — commande ${input.reference} (${input.lignes.length} référence${input.lignes.length > 1 ? 's' : ''})`,
    texte: corps.join('\n'),
  }
}

/** Numéro lisible : BC-AAMMJJ-XXXX. Le fournisseur le cite en réponse. */
export function referenceBon(date = new Date(), graine?: string): string {
  const d = date.toISOString().slice(2, 10).replace(/-/g, '')
  const n = graine
    ? [...graine].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 10000
    : Math.floor(Math.random() * 10000)
  return `BC-${d}-${String(n).padStart(4, '0')}`
}
