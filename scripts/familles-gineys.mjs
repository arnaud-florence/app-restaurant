// Les rayons du portail Gineys, posés sur nos lignes de catalogue.
//
//   node scripts/familles-gineys.mjs [--ecrire]
//
// Le relevé du 26/09 n'avait capté que le libellé et le prix : les 2 892
// lignes Gineys sont arrivées SANS famille, donc le filtre par catégorie de
// `/admin/achats` ne couvrait que 305 lignes sur 3 303.
//
// Le portail range pourtant ses articles en 21 rayons. Ils se relèvent
// famille par famille (fil d'Ariane → sélecteur), et le fichier
// `data/gineys/gineys-familles.json` accumule ce qui a été relevé.
//
// ⚠️ Relevé INCOMPLET et c'est assumé : l'écran affiche le nombre de
// références sans catégorie plutôt que de faire semblant. Chaque passage
// supplémentaire enrichit le fichier ; le script est idempotent.
//
// ⚠️ Ce portail n'est pas pilotable de façon fiable depuis un onglet
// d'arrière-plan : son contexte JS retarde de plusieurs rendus, et le menu
// des familles bascule à chaque clic. Les positions se lisent sur une
// CAPTURE, jamais sur le DOM. Compter une vingtaine d'allers-retours par
// famille dans le pire cas.
//
// → La vraie solution est de DEMANDER LE FICHIER à Gineys : un export de
//   leur catalogue (code, libellé, rayon, colisage) réglerait catégories et
//   références d'un coup, et se rejouerait à chaque mise à jour.

import fs from 'node:fs'

const FICHIER = 'data/gineys/gineys-familles.json'
const ECRIRE = process.argv.includes('--ecrire')
if (!fs.existsSync(FICHIER)) {
  console.error(`\n✗ ${FICHIER} absent (gitignoré : il vit sur le poste).\n`)
  process.exit(1)
}

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: {
    apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json',
    Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}

const releve = JSON.parse(fs.readFileSync(FICHIER, 'utf8'))
const parCode = new Map(releve.map(r => [r.code, r.famille]))

const fournisseurs = await sb('fournisseurs?select=id,nom')
const gineys = fournisseurs.find(f => /gineys/i.test(f.nom))
if (!gineys) { console.error('✗ Fournisseur Gineys introuvable.'); process.exit(1) }

// ⚠️ Pagination : PostgREST plafonne à 1 000 lignes sans le dire.
const lignes = []
for (let de = 0; de < 20000; de += 1000) {
  const lot = await sb(`catalogue_fournisseur?fournisseur_id=eq.${gineys.id}&select=id,reference,famille&offset=${de}&limit=1000`)
  lignes.push(...lot)
  if (lot.length < 1000) break
}

const aPoser = lignes.filter(l => parCode.has(l.reference) && l.famille !== parCode.get(l.reference))
const dejaBonnes = lignes.filter(l => parCode.has(l.reference) && l.famille === parCode.get(l.reference)).length
const inconnues = lignes.filter(l => !parCode.has(l.reference)).length

const par = {}
for (const l of aPoser) { const f = parCode.get(l.reference); par[f] = (par[f] || 0) + 1 }

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} · rayons Gineys ──\n`)
console.log(`  ${releve.length} code(s) relevé(s) sur le portail`)
console.log(`  ${lignes.length} ligne(s) Gineys au catalogue`)
console.log(`  · ${aPoser.length} à mettre à jour`)
console.log(`  · ${dejaBonnes} déjà correctes`)
console.log(`  · ${inconnues} encore sans rayon relevé`)
Object.entries(par).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`     ${String(v).padStart(4)}  ${k}`))

if (!ECRIRE) { console.log('\n  (rien écrit — relancer avec --ecrire)\n'); process.exit(0) }

let n = 0
for (const l of aPoser) {
  await sb(`catalogue_fournisseur?id=eq.${l.id}`, {
    method: 'PATCH', body: JSON.stringify({ famille: parCode.get(l.reference) }),
    headers: { Prefer: 'return=minimal' },
  })
  n++
  if (n % 50 === 0) process.stdout.write(`\r  écrit ${n}/${aPoser.length}`)
}
console.log(`\n\n✓ ${n} rayon(s) posé(s). Reste ${inconnues} référence(s) sans rayon.\n`)
