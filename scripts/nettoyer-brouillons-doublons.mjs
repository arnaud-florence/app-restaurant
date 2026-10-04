// Les brouillons que l'agent Stock a empilés — 04/10/2026.
//
// L'agent tourne toutes les 2 h et son anti-doublon ne portait que sur 6 h :
// un besoin non traité produisait donc un brouillon identique toutes les
// 6-8 heures, sans fin. Six pour une ligne de 0,9 kg d'oignons en deux jours ;
// une quarantaine au 12 octobre.
//
// ⚠️ ON GARDE LE PLUS ANCIEN, pas le plus récent : c'est lui que le gérant a
// peut-être déjà ouvert, annoté ou dont il a parlé au fournisseur.
//
// ⚠️ ON NE TOUCHE QU'AUX BROUILLONS JAMAIS ENVOYÉS, de l'agent, et seulement
// quand plusieurs portent EXACTEMENT les mêmes lignes. Un brouillon envoyé
// est une commande passée ; deux brouillons de contenus différents sont deux
// besoins.
//
//   node scripts/nettoyer-brouillons-doublons.mjs [--ecrire]
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
const fourn = new Map((await sb('fournisseurs?select=id,nom')).map(f => [f.id, f.nom]))
const bons = await sb('bons_commande?statut=eq.brouillon&envoye_le=is.null&select=id,fournisseur_id,created_at,notes&order=created_at')
const lignes = await sb('bon_commande_lignes?select=bon_commande_id,libelle,quantite_commandee,recette_id,ingredient_id')
const parBon = new Map()
for (const l of lignes) {
  if (!parBon.has(l.bon_commande_id)) parBon.set(l.bon_commande_id, [])
  parBon.get(l.bon_commande_id).push(`${l.recette_id ?? l.ingredient_id ?? l.libelle}:${l.quantite_commandee}`)
}
// empreinte d'un bon : fournisseur + ses lignes triées
const groupes = new Map()
for (const b of bons) {
  const emp = `${b.fournisseur_id}|${(parBon.get(b.id) ?? []).slice().sort().join('·')}`
  if (!groupes.has(emp)) groupes.set(emp, [])
  groupes.get(emp).push(b)
}
console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — brouillons jamais envoyés ──\n`)
console.log(`   ${bons.length} brouillon(s) · ${groupes.size} besoin(s) distinct(s)\n`)
let supprimes = 0
for (const [, g] of [...groupes.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const nom = fourn.get(g[0].fournisseur_id) ?? '?'
  const n = (parBon.get(g[0].id) ?? []).length
  if (g.length === 1) { console.log(`   = ${nom.padEnd(22)} 1 brouillon · ${n} ligne(s)`); continue }
  console.log(`   ✗ ${nom.padEnd(22)} ${g.length} brouillons IDENTIQUES · ${n} ligne(s)`)
  console.log(`     on garde celui du ${g[0].created_at.slice(0, 16).replace('T', ' ')}, on retire les ${g.length - 1} suivants`)
  for (const b of g.slice(1)) {
    supprimes++
    if (!ECRIRE) continue
    await sb(`bon_commande_lignes?bon_commande_id=eq.${b.id}`, { method: 'DELETE' })
    await sb(`bons_commande?id=eq.${b.id}`, { method: 'DELETE' })
  }
}
console.log(`\n   ${supprimes} brouillon(s) ${ECRIRE ? 'supprimé(s)' : 'à supprimer'}`)
console.log(ECRIRE ? '' : '\n  (essai à blanc — relancer avec --ecrire)\n')
