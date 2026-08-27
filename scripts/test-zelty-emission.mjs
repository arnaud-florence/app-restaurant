// Émission d'une commande du site vers la caisse Zelty.
//
// Joué à travers le banc d'essai : aucun compte, aucune clé, rien n'est
// envoyé nulle part. C'est le vrai constructeur qui est éprouvé.
//
// Ce qu'on protège, et tout vient de la documentation officielle :
//
//   · un `total` INFÉRIEUR au total recalculé par Zelty est accepté EN
//     SILENCE, et la caisse crée une remise égale à l'écart. Un panier
//     amputé d'une ligne fuiterait la marge sans que personne ne le voie.
//     D'où le refus TOUT OU RIEN ;
//   · `item_id` est un champ mort sur POST : c'est `id`, entier, qui compte ;
//   · `remote_id` stable = idempotence, donc pas de double vente au renvoi.
//
//   PORT=3000 node scripts/test-zelty-emission.mjs

import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('=')
  if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
}
const BASE = `http://localhost:${process.env.PORT ?? '3000'}`

let ok = 0, ko = 0
const t = (nom, cond, detail = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nom}`) }
  else { ko++; console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ''}`) }
}
const sortante = async (s) => {
  const r = await fetch(`${BASE}/api/integrations/zelty/verifier`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CRON_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sortante: s }),
  })
  return (await r.json().catch(() => ({})))
}

console.log('\n── Émission vers la caisse ──\n')
if (!env.CRON_SECRET) { console.log('  ✗ CRON_SECRET absent'); process.exit(1) }

const R1 = 'aaaaaaaa-0000-0000-0000-000000000001'
const R2 = 'aaaaaaaa-0000-0000-0000-000000000002'
const base = {
  numero: 'WEB-260915-AB12',
  mode: 'takeaway',
  lignes: [
    { recette_id: R1, nom: 'Croissant', quantite: 2, prix_unitaire_ttc: 1.20 },
    { recette_id: R2, nom: 'Panuozzi',  quantite: 1, prix_unitaire_ttc: 10.00 },
  ],
  montantTotalTtc: 12.40,
  correspondances: { [R1]: '1974', [R2]: '1975' },
  modePaiement: 'Paiement en ligne',
  creneau: '2026-09-15T10:30:00Z',
}

// ── 1. Panier complet et cohérent ───────────────────────────────────
let r = await sortante(base)
t('la commande est acceptée', r.refus === false, JSON.stringify(r.raisons))
const c = r.commande ?? {}
t('notre numéro sert de clé d\'idempotence', c.remote_id === 'WEB-260915-AB12', c.remote_id)
t('la source est « web »', c.source === 'web', c.source)
t('le mode est repris', c.mode === 'takeaway', c.mode)
t('le total est en centimes', c.total === 1240, `${c.total}`)
t('une ligne par unité vendue', (c.items ?? []).length === 3, `${(c.items ?? []).length}`)
t('le plat est référencé par `id` ENTIER',
  c.items?.[0]?.id === 1974 && typeof c.items[0].id === 'number', JSON.stringify(c.items?.[0]))
t('aucun `item_id` n\'est envoyé — champ mort sur POST',
  !(c.items ?? []).some(i => 'item_id' in i))
t('la somme des lignes égale le total',
  (c.items ?? []).reduce((s, i) => s + i.price, 0) === c.total)
t('le règlement est joint, en centimes et en chaîne',
  c.transactions?.[0]?.name === 'Paiement en ligne' && c.transactions?.[0]?.price === '1240',
  JSON.stringify(c.transactions))
t('le créneau devient une date ISO',
  String(c.due_date).startsWith('2026-09-15T10:30'), c.due_date)

// ── 2. LE cas qui coûte de l'argent ─────────────────────────────────
// Un produit sans correspondance : envoyer le panier amputé serait accepté
// en silence, et Zelty créerait une remise de 10 €.
r = await sortante({ ...base, correspondances: { [R1]: '1974' } })
t('un produit sans correspondance fait REFUSER tout le panier', r.refus === true)
t('et le produit fautif est nommé',
  (r.raisons ?? []).some(x => /Panuozzi/.test(x)), JSON.stringify(r.raisons))

// ── 3. Total incohérent avec les lignes ─────────────────────────────
r = await sortante({ ...base, montantTotalTtc: 11.00 })
t('un total qui ne colle pas aux lignes est refusé', r.refus === true)
t('et la remise silencieuse est expliquée',
  (r.raisons ?? []).some(x => /remise silencieuse/.test(x)), JSON.stringify(r.raisons))

// ── 4. Identifiant caisse illisible ─────────────────────────────────
r = await sortante({ ...base, correspondances: { [R1]: '1974', [R2]: 'abc' } })
t('un identifiant caisse non numérique est refusé', r.refus === true,
  JSON.stringify(r.raisons))

// ── 5. Panier vide ──────────────────────────────────────────────────
r = await sortante({ ...base, lignes: [], montantTotalTtc: 0 })
t('un panier vide est refusé', r.refus === true, JSON.stringify(r.raisons))

// ── 6. Sans paiement : la commande part quand même ──────────────────
// Paiement à la remise : la caisse encaissera elle-même.
const { modePaiement, ...sansPaiement } = base
r = await sortante(sansPaiement)
t('une commande à régler sur place part sans transaction',
  r.refus === false && !('transactions' in (r.commande ?? {})),
  JSON.stringify(r.commande?.transactions))

// ── 7. Livraison ────────────────────────────────────────────────────
r = await sortante({ ...base, mode: 'delivery' })
t('le mode livraison est transmis', r.commande?.mode === 'delivery')

console.log(`\n── ${ok} ✓   ${ko} ✗ ──\n`)
process.exit(ko === 0 ? 0 : 1)
