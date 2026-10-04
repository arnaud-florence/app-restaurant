// Tout ouvre le lundi 12 octobre 2026 — décision du gérant, 04/10/2026.
//
// Les quatre modules encore en aperçu annonçaient le « samedi 3 octobre »,
// date DÉPASSÉE : le site promettait une ouverture qui avait déjà eu lieu.
//
// ⚠️⚠️ LA DATE VIT À DEUX ENDROITS, et les deux s'affichent.
// `date_ouverture_prevue` pilote le compte à rebours ET le refus de
// précommande avant l'ouverture ; `teaser_texte` porte la date EN TOUTES
// LETTRES sur la page d'accueil. Changer l'une sans l'autre laisse le site
// se contredire — un bandeau « ouverture samedi 3 octobre » au-dessus d'un
// compteur qui vise le 12.
//
// ⚠️ Les CHAMBRES ne sont pas touchées : elles n'ont jamais porté de date
// (« ouverture prochainement ») et relèvent d'une autre activité. Leur
// inventer le 12 octobre serait promettre une réservation qu'on ne tiendra
// pas.
//
//   node scripts/ouverture-12-octobre.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 250)}`)
  return t ? JSON.parse(t) : null
}
const LE = '2026-10-12'
// ⚠️ Le 12 octobre 2026 est bien un LUNDI — vérifié, pas recopié de l'affiche.
const jour = new Date(LE + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', timeZone: 'UTC' })
if (jour !== 'lundi') { console.log(`\n  ✗ le ${LE} est un ${jour}, pas un lundi — l'affiche dit « LUNDI 12 OCTOBRE ». RIEN n'est écrit.\n`); process.exit(1) }

const TEXTES = {
  bar: 'Le Comptoir & terrasses — ouverture lundi 12 octobre',
  restaurant_salle: 'Brasserie le midi 7j/7, et le vendredi et samedi soir — ouverture lundi 12 octobre',
  pizzeria: 'Pizzeria le soir 7j/7 — ouverture lundi 12 octobre',
  evenementiel: 'Événements, baptêmes et anniversaires — dès l’ouverture, lundi 12 octobre',
  relais_colis: 'Relais colis & dépôt d’ordonnances — ouverture lundi 12 octobre',
}
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — tout ouvre le ${jour} ${LE} ──\n`)
const mods = await sb('activites_modules?teaser=is.true&select=cle,actif,date_ouverture_prevue,teaser_texte&order=cle')
const hier = new Date().toISOString().slice(0, 10)
for (const m of mods) {
  const txt = TEXTES[m.cle]
  if (!txt) {
    console.log(`   — ${m.cle.padEnd(18)} NON TOUCHÉ · ${m.date_ouverture_prevue ?? 'sans date'} · « ${m.teaser_texte} »`)
    continue
  }
  const perimee = m.date_ouverture_prevue && m.date_ouverture_prevue < hier
  console.log(`   → ${m.cle.padEnd(18)} ${String(m.date_ouverture_prevue ?? '—').padEnd(12)}${perimee ? ' ⚠️ dépassée' : ''} → ${LE}`)
  console.log(`     ${' '.repeat(18)} « ${txt} »`)
  if (ECRIRE) await sb(`activites_modules?cle=eq.${m.cle}`, { method: 'PATCH', body: JSON.stringify({
    date_ouverture_prevue: LE, teaser_texte: txt }) })
}
if (ECRIRE) {
  const apres = await sb('activites_modules?teaser=is.true&select=cle,date_ouverture_prevue,teaser_texte&order=cle')
  const incoherent = apres.filter(m => m.date_ouverture_prevue && !String(m.teaser_texte ?? '').includes('12 octobre'))
  console.log(incoherent.length
    ? `\n   ⚠️ ${incoherent.length} module(s) dont le TEXTE ne dit pas la même date que le compteur : ${incoherent.map(m => m.cle).join(', ')}`
    : `\n   ✓ les ${apres.filter(m => m.date_ouverture_prevue).length} modules datés annoncent tous le 12 octobre, compteur ET texte`)
}
console.log(ECRIRE ? '' : '\n  (essai à blanc — relancer avec --ecrire)\n')
