#!/usr/bin/env node
// Les ruptures déclarées SUR LA CAISSE redescendent dans l'outil.
//
// ⚠️ Il RECOPIE la règle depuis src/lib/integrations/zelty/ruptures-entrantes.ts
// (la source est en TS) — modifier les deux ensemble.
//
// L'essentiel des assertions porte sur ce que la règle REFUSE de faire :
// lever une rupture. C'est la partie qui protège, et c'est celle qui casserait
// en silence si quelqu'un « simplifiait » la fonction en synchronisation
// symétrique.
//
// Usage : PORT=3000 node scripts/test-zelty-ruptures-entrantes.mjs

import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const PORT = process.env.PORT ?? '3000'
const ROUTE = `http://localhost:${PORT}/api/cron/caisse/zelty/disponibilites/entrantes`

let ok = 0, ko = 0
const t = (nom, vrai, detail = '') => {
  console.log(`  ${vrai ? '✓' : '✗'} ${nom}${detail ? '  — ' + detail : ''}`)
  vrai ? ok++ : ko++
}

// ─── RECOPIE de la règle (src/lib/integrations/zelty/ruptures-entrantes.ts) ──
function deciderRuptures(dispos, produits, aujourdhui) {
  const parId = new Map(produits.map(p => [p.id, p]))
  const d = { aMarquer: [], dejaConnus: [], inconnus: [], avertissements: [] }
  if (dispos.length === 0) {
    d.avertissements.push("la caisse n'a rendu AUCUNE disponibilité — lecture probablement ratée, rien n'est écrit")
    return d
  }
  for (const z of dispos) {
    if (z.outofstock !== true) continue
    const ref = z.dish_remote_id
    if (!ref) { d.inconnus.push(z.id_dish); continue }
    const p = parId.get(ref)
    if (!p) { d.inconnus.push(z.id_dish); continue }
    if (p.rupture_le === aujourdhui) { d.dejaConnus.push(p.nom); continue }
    d.aMarquer.push({ id: p.id, nom: p.nom })
  }
  if (d.inconnus.length > 0) {
    d.avertissements.push(`${d.inconnus.length} plat(s) en rupture chez la caisse sans correspondance ici`)
  }
  return d
}

const JOUR = '2026-09-25'
const HIER = '2026-09-24'

console.log('\n── Ruptures entrantes : caisse → outil ──\n')

// ── 1. Le cas nominal ─────────────────────────────────────────────────────
{
  const d = deciderRuptures(
    [{ id_dish: 1, dish_remote_id: 'A', outofstock: true }],
    [{ id: 'A', nom: 'Croissant', rupture_le: null }], JOUR)
  t('une rupture déclarée est reprise', d.aMarquer.length === 1 && d.aMarquer[0].nom === 'Croissant')
  t('aucun avertissement', d.avertissements.length === 0)
}

// ── 2. ⚠️ LA RÈGLE CENTRALE : on ne lève JAMAIS une rupture ───────────────
// `outofstock: false` est la valeur PAR DÉFAUT de tout plat que personne n'a
// touché — les 181 plats du compte y sont aujourd'hui. Ça ne veut pas dire
// « quelqu'un a vérifié qu'il y en a », ça veut dire « rien n'a été déclaré ».
// Même faute que le tableau d'allergènes vide lu comme « aucun allergène ».
{
  const d = deciderRuptures(
    [{ id_dish: 1, dish_remote_id: 'A', outofstock: false }],
    [{ id: 'A', nom: 'Croissant', rupture_le: JOUR }], JOUR)
  t('une rupture posée chez nous n\'est PAS levée par la caisse',
    d.aMarquer.length === 0 && d.dejaConnus.length === 0)
  t('…et rien n\'est signalé comme anomalie', d.avertissements.length === 0)
}

// ── 3. Idempotence : repasser n'écrit rien ────────────────────────────────
{
  const d = deciderRuptures(
    [{ id_dish: 1, dish_remote_id: 'A', outofstock: true }],
    [{ id: 'A', nom: 'Croissant', rupture_le: JOUR }], JOUR)
  t('déjà en rupture aujourd\'hui → aucune écriture', d.aMarquer.length === 0)
  t('…mais c\'est compté comme connu', d.dejaConnus[0] === 'Croissant')
}

// ── 4. Une rupture de la VEILLE est reposée ───────────────────────────────
// `rupture_le` est daté : une rupture se périme seule le lendemain. Si la
// caisse la déclare encore, c'est qu'elle dure — on la repose au jour.
{
  const d = deciderRuptures(
    [{ id_dish: 1, dish_remote_id: 'A', outofstock: true }],
    [{ id: 'A', nom: 'Croissant', rupture_le: HIER }], JOUR)
  t('une rupture d\'hier encore déclarée est reposée au jour', d.aMarquer.length === 1)
}

// ── 5. ⚠️ Une liste VIDE est une lecture ratée, pas « aucune rupture » ────
// Sans ce garde-fou, une réponse tronquée passerait pour un catalogue sain.
{
  const d = deciderRuptures([], [{ id: 'A', nom: 'Croissant', rupture_le: null }], JOUR)
  t('liste vide → avertissement', d.avertissements.length === 1)
  t('liste vide → rien à écrire', d.aMarquer.length === 0)
  t('…et le message dit que rien n\'est écrit', /rien n'est écrit/.test(d.avertissements[0]))
}

// ── 6. Ce qu'on ne reconnaît pas est SIGNALÉ, jamais créé ─────────────────
// Inventer une fiche depuis une rupture doublonnerait nos produits, sans nom,
// sans prix et sans photo.
{
  const d = deciderRuptures(
    [{ id_dish: 9, dish_remote_id: 'INCONNU', outofstock: true },
     { id_dish: 8, outofstock: true }],
    [{ id: 'A', nom: 'Croissant', rupture_le: null }], JOUR)
  t('un plat sans correspondance est signalé', d.inconnus.length === 2)
  t('…et rien n\'est créé', d.aMarquer.length === 0)
  t('…avec un avertissement', /sans correspondance/.test(d.avertissements[0] ?? ''))
}

// ── 7. Le rapprochement se fait sur l'identifiant, JAMAIS sur le nom ──────
// Un faux positif retirerait un produit de la vente sans que personne ne
// sache pourquoi.
{
  const d = deciderRuptures(
    [{ id_dish: 1, dish_remote_id: 'Croissant', outofstock: true }],
    [{ id: 'A', nom: 'Croissant', rupture_le: null }], JOUR)
  t('un identifiant qui ressemble au NOM ne rapproche pas', d.aMarquer.length === 0)
}

// ── 8. Les valeurs molles ne déclenchent rien ─────────────────────────────
// `outofstock` absent ou null n'est pas `true`. Un `!= false` ferait passer
// les deux pour une rupture et retirerait toute la carte de la vente.
{
  const d = deciderRuptures(
    [{ id_dish: 1, dish_remote_id: 'A' },
     { id_dish: 2, dish_remote_id: 'B', outofstock: null }],
    [{ id: 'A', nom: 'Croissant', rupture_le: null },
     { id: 'B', nom: 'Baguette', rupture_le: null }], JOUR)
  t('outofstock absent ou null ne marque RIEN', d.aMarquer.length === 0 && d.inconnus.length === 0)
}

// ── 9. La route est fermée sans authentification ──────────────────────────
{
  try {
    const r = await fetch(ROUTE, { signal: AbortSignal.timeout(20000) })
    t('la route refuse un appel anonyme', r.status === 401, `HTTP ${r.status}`)
  } catch { t('la route refuse un appel anonyme', false, 'serveur injoignable') }
}

// ── 10. L'essai à blanc n'écrit rien ──────────────────────────────────────
{
  const S = env.CRON_SECRET
  try {
    const r = await fetch(`${ROUTE}?dry=1`, {
      headers: { Authorization: `Bearer ${S}` }, signal: AbortSignal.timeout(60000),
    })
    const b = await r.json().catch(() => ({}))
    t('l\'essai à blanc répond', r.status === 200, `HTTP ${r.status}`)
    t('…et ne marque rien', b.dry === true && b.marquees === 0, JSON.stringify(b).slice(0, 120))
  } catch { t('l\'essai à blanc répond', false, 'serveur injoignable') }
}

console.log(`\n${ko === 0 ? '✓' : '✗'} ${ok} réussite(s), ${ko} échec(s)\n`)
process.exit(ko === 0 ? 0 : 1)
