// « Frites belges à la graisse de bœuf » sur la carte. Décision du gérant,
// 30/09/2026.
//
// La mention fait DEUX choses d'un même mot, et c'est pour ça qu'elle vaut
// mieux qu'une note en bas de carte :
//   — elle vend. Une 12×12 avec peau cuite à la graisse de bœuf, aucun voisin
//     ne l'a, et ça ne se devine pas en lisant « frites ».
//   — ⚠️ elle PRÉVIENT. Des frites à la graisse de bœuf ne sont ni
//     végétariennes ni halal. Ce n'est pas un des 14 allergènes, donc rien
//     dans la déclaration réglementaire ne le dira — et c'est exactement le
//     genre d'information qui se découvre à table, après coup. Elle accompagne
//     tous les burgers, l'entrecôte, le tartare, l'andouillette ET le menu
//     enfant.
//
// ⚠️ La `description` est le texte COMMERCIAL, celui que lit le client sur la
// carte et sur casatasia.fr. La `procedure` est la méthode à respecter au
// poste (0150). Les deux changent, mais pas pour dire la même chose.
//
//   node scripts/frites-belges-carte.mjs [--ecrire]
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
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: H })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 400)}`)
  return t ? JSON.parse(t) : null
}

const MENTION = 'frites belges à la graisse de bœuf'
const NOUVEAU_NOM = 'Frites belges 12×12 (kg)'
const ANCIEN_NOM = 'Frites surgelées (kg)'

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — « ${MENTION} » ──\n`)

const plats = await sb('recettes?actif=eq.true&or=(description.ilike.*frite*,procedure.ilike.*frite*)&select=id,nom,description,procedure')
for (const p of plats) {
  const body = {}
  // ⚠️ On remplace le mot SEUL, pas « frites belges » déjà posé : relancer le
  // script ne doit pas écrire « frites belges à la graisse de bœuf belges à
  // la graisse de bœuf ». Un script qu'on ne peut pas rejouer n'en est pas un.
  if (p.description && !p.description.includes(MENTION)) {
    const d = p.description.replace(/\bfrites\b/gi, MENTION)
    if (d !== p.description) body.description = d
  }
  if (p.procedure && !/GRAISSE DE B/i.test(p.procedure)) {
    // ⚠️ Le bac dédié n'est pas un détail : on ne mélange pas graisse et
    // huile. Écrit dans la procédure, c'est lu au poste ; écrit ailleurs, non.
    const pr = p.procedure.replace(/^(\s*\d+\.\s*)Frites\s*:/gim,
      '$1Frites belges 12×12 : friteuse à la GRAISSE DE BŒUF (bac dédié, jamais l’huile) —')
    if (pr !== p.procedure) body.procedure = pr
  }
  if (!Object.keys(body).length) { console.log(`  = ${p.nom} — déjà à jour`); continue }
  console.log(`  ▸ ${p.nom}`)
  if (body.description) console.log(`    ${body.description}`)
  if (body.procedure) console.log(`    ${body.procedure.split('\n').find(l => /GRAISSE/i.test(l))?.trim()}`)
  if (ECRIRE) await sb(`recettes?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

// ── La matière porte enfin le bon nom ─────────────────────────────────
// « Frites surgelées » décrivait le produit Félix Potin. Ce qu'on achète
// désormais est une 12×12 avec peau : le nom s'affiche à l'inventaire, sur le
// bon de commande et sur la fiche technique imprimée au poste.
const [m] = await sb(`ingredients?nom=eq.${encodeURIComponent(ANCIEN_NOM)}&select=id,nom`)
if (m) {
  console.log(`\n  ▸ matière « ${ANCIEN_NOM} » → « ${NOUVEAU_NOM} »`)
  // ⚠️ `cle_comparaison` est du TEXTE, pas une clé étrangère : renommer la
  // matière sans la renommer casse les 4 face-à-face, en silence.
  const cles = await sb(`catalogue_fournisseur?cle_comparaison=eq.${encodeURIComponent(ANCIEN_NOM)}&select=id,fournisseur:fournisseurs(nom)`)
  console.log(`    ${cles.length} ligne(s) de catalogue portent l'ancienne clé : ${cles.map(c => c.fournisseur?.nom).join(', ')}`)
  if (ECRIRE) {
    await sb(`ingredients?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify({ nom: NOUVEAU_NOM }) })
    for (const c of cles) await sb(`catalogue_fournisseur?id=eq.${c.id}`,
      { method: 'PATCH', body: JSON.stringify({ cle_comparaison: NOUVEAU_NOM }) })
  }
} else console.log(`\n  (matière déjà renommée)`)

console.log(ECRIRE ? '\n  ✓ écrit.\n' : '\n  (essai à blanc — relancer avec --ecrire)\n')
