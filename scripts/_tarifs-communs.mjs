// Règles de lecture d'un tarif fournisseur — PARTAGÉES.
//
// Elles vivaient dans `catalogue-depuis-factures.mjs` seul. L'import du
// portail Gineys en avait besoin à l'identique : plutôt qu'une deuxième copie
// — le travers que ce projet paie le plus cher, et que CLAUDE.md signale à
// chaque test qui « RECOPIE la règle » — elles sont ici, importées par les
// deux. Une correction profite désormais aux deux d'un coup.

/**
 * L'unité de FACTURATION, dans notre vocabulaire.
 *
 * ⚠️ `kg`, `L` et `piece` sont des unités de RÉFÉRENCE : le prix y est déjà
 * ramené, il ne faut surtout pas le rediviser par une contenance.
 * ⚠️ SEULS CES QUATRE CODES SONT SÛRS. `PR`, `TR`, `OF`, `G` sont des codes
 * internes du grossiste : les prendre pour des pièces sortait la mozzarella
 * cerise (« BQT=1KG », facturée « PR ») de toute comparaison, et faisait
 * passer un sac de 250 sacs kraft pour une unité. Tout le reste est traité
 * comme un CONTENANT — on cherche sa contenance, et on ne conclut rien si
 * elle n'y est pas.
 */
export const UNITE = { Kg: 'kg', KG: 'kg', L: 'L', Pce: 'piece', Col: 'colis' }
export const REFERENCE = new Set(['kg', 'L', 'piece'])

/** Colisage d'une ligne : « C=96 ». */
export function conditionnement(description) {
  const m = description.match(/C=(\d+)(?!\d)/)
  if (m) {
    // « C=6 X 500 » n'est pas un colisage simple : six paquets de cinq cents.
    if (/^\s*[X×x]/.test(description.slice((m.index ?? 0) + m[0].length))) {
      const d = description.match(/C\s*=\s*(\d+)\s*[X×x]\s*(\d+)/)
      return d ? Number(d[1]) * Number(d[2]) : null
    }
    const n = Number(m[1])
    return n >= 2 && n <= 2000 ? n : null
  }
  return null
}

const poids = (v, u) => u === 'KG' ? { valeur: v, unite: 'kg' }
  : u === 'G'  ? { valeur: v / 1000, unite: 'kg' }
  : u === 'L'  ? { valeur: v, unite: 'L' }
  : u === 'CL' ? { valeur: v / 100, unite: 'L' }
  : u === 'ML' ? { valeur: v / 1000, unite: 'L' } : null

/**
 * Contenance d'une unité facturée, telle que le fournisseur l'imprime.
 *
 * ⚠️ UN POIDS AU MILIEU D'UN LIBELLÉ NE DIT RIEN DE LA CONTENANCE.
 * « BAGUETTE PRECUITE SUR FOUR A SOLE 280G », facturée au carton, donnerait
 * 49,71 €/kg de baguette — trente-deux fois trop, et l'écran l'afficherait
 * comme les autres. Le 280 g est le poids d'UNE baguette, le prix celui du
 * colis ; rien dans le libellé ne relie les deux.
 *
 * On ne lit donc que deux formes, où le nombre qualifie explicitement le
 * contenant : un marqueur (« BQT=500G », « SEAU=1L ») et un préfixe (la
 * convention cash & carry, « 1KG SCE BARBECUE », « BTE 33CL ORANGINA »).
 */
export function contenance(description) {
  const d = description.toUpperCase()
  const m = d.match(/(?:BQT|BTL|BOT|POT|SEAU|SAC|SACHET|FLACON|POCHE|PLT|BID|BIDON|CAISSE|ETUI)\s*=\s*(\d+(?:[.,]\d+)?)\s*(KG|G|ML|CL|L)\b/)
  if (m) return poids(Number(m[1].replace(',', '.')), m[2])
  const p = d.match(/^(?:BTE|BOITE|BT|PQ|PAQUET|FL|FLACON)?\s*(\d+(?:[.,]\d+)?)\s*(KG|G|ML|CL|L)\b/)
  if (p) return poids(Number(p[1].replace(',', '.')), p[2])
  // « SAC=25 », « C=250 » : un nombre nu de pièces, pas un poids.
  const n = d.match(/(?:SAC|SACHET|PQ|PAQUET)\s*=\s*(\d+)(?![\d.,])/)
  if (n) return { valeur: Number(n[1]), unite: 'piece' }
  return null
}

/** Normalisation d'un libellé, pour servir de clé. */
export const norme = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

/**
 * Nombre d'unités dans un colis Euro-Cash : « c-24x33cl » → 24.
 *
 * ⚠️ ON IGNORE LE FACTEUR QUI PORTE UNE CONTENANCE. Multiplier le 33 de
 * « c-24x33cl » donnerait 792 canettes et un prix unitaire absurde. En
 * revanche « c-1x6pcs » vaut bien 6 : `pcs` compte des PIÈCES, pas un volume.
 */
export function unitesColis(colisage) {
  if (!colisage) return null
  const c = String(colisage).trim()
  if (/^\d+$/.test(c)) return Number(c)
  const facteurs = [...c.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|cl|ml|pcs?)?/gi)]
    .filter(m => !/^(kg|g|l|cl|ml)$/i.test(m[2] ?? ''))
    .map(m => Number(m[1].replace(',', '.')))
  if (!facteurs.length) return null
  const n = facteurs.reduce((a, b) => a * b, 1)
  return Number.isFinite(n) && n > 0 ? n : null
}
