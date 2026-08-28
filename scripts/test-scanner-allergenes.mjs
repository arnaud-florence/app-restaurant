// Test — scanner d'allergènes (POST /api/agents/scanner-allergenes)
//
// Ce qui compte ici n'est pas ce que le scanner TROUVE — ça dépend d'une
// photo — mais ce qu'il REFUSE de faire. Une déclaration d'allergènes est
// lue par un allergique : la seule erreur irrattrapable est de rendre une
// liste vide qui sera prise pour « aucun allergène ».
//
// Le test ne consomme pas Claude Vision : il attaque la route sur ses
// gardes-fous (auth, corps, volume) et vérifie la normalisation en pur.
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const PORT = process.env.PORT
const BASE = PORT ? `http://localhost:${PORT}` : null

let ok = 0, ko = 0
const T = (cond, label, detail = '') => {
  if (cond) { ok++; console.log(`  ✓ ${label}`) }
  else { ko++; console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`) }
}

console.log('╔══════════════════════════════════════════════════════════╗')
console.log('║ Test — scanner d\'allergènes                              ║')
console.log('╚══════════════════════════════════════════════════════════╝')

// ── 1. Les 14 catégories, et rien d'autre ──────────────────────────
console.log('\n── vocabulaire réglementaire ──')
const src = fs.readFileSync('src/lib/allergenes.ts', 'utf8')
const LISTE = [...src.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
const QUATORZE = ['gluten','crustaces','oeufs','poissons','arachides','soja','lait',
  'fruits_a_coque','celeri','moutarde','graines_sesame','sulfites','lupin','mollusques']
T(QUATORZE.every(a => LISTE.includes(a)), 'les 14 allergènes UE sont définis')

const route = fs.readFileSync('src/app/api/agents/scanner-allergenes/route.ts', 'utf8')
T(route.includes('filterAllergenesUE'),
  'les catégories rendues par le modèle sont filtrées sur les 14',
  'sans ça un « lactose » remonterait jusqu\'à l\'écran')

// ── 2. Le garde-fou central : illisible ⇒ rien ─────────────────────
console.log('\n── ce que la route REFUSE ──')
T(/liste_lisible[\s\S]{0,200}\?\s*filterAllergenesUE[\s\S]{0,40}:\s*\[\]/.test(route)
  || route.includes('lisible ? filterAllergenesUE'),
  'une étiquette illisible rend des listes VIDES, jamais une déduction',
  'une liste vide validée serait lue « aucun allergène »')
T(/N'INVENTE RIEN|n'invente rien/i.test(route),
  'la consigne interdit explicitement de déduire du nom du produit')
T(route.includes('NE LES MÉLANGE JAMAIS') || /traces[\s\S]{0,120}présents|présents[\s\S]{0,200}traces/i.test(route),
  'présents et traces sont demandés séparément')
T(route.includes('presents') && route.includes('traces') && !route.includes('[...presents, ...traces]'),
  'la route ne fusionne jamais traces et présents')

// ── 3. L'écran ne coche pas les traces d'office ────────────────────
console.log('\n── ce que l\'écran propose ──')
const cli = fs.readFileSync('src/app/admin/allergenes/AllergenesClient.tsx', 'utf8')
T(/retenus:\s*e\.presents\b/.test(cli),
  'seuls les allergènes PRÉSENTS sont pré-cochés, pas les traces',
  '« peut contenir » n\'est pas « contient »')
T(cli.includes('Liste d&apos;ingrédients illisible') || cli.includes('illisible'),
  'une étiquette illisible est signalée et ne propose rien')
T(/prets\s*=\s*\(etiquettes[\s\S]{0,80}e\.liste_lisible/.test(cli),
  'une étiquette illisible ne peut pas être appliquée')

// ── 4. La validation groupée demande la complétude ─────────────────
T(cli.includes('AUCUN autre allergène'),
  'valider une famille demande confirmation de la COMPLÉTUDE',
  'sinon le gluten pré-rempli ferait signer « pas de lait dans un croissant »')

// ── 5. Le pré-remplissage ne valide jamais ─────────────────────────
console.log('\n── pré-remplissage ──')
const pre = fs.readFileSync('scripts/prefill-allergenes.mjs', 'utf8')
T(!/allergenes_valides_le/.test(pre.split('// Certain')[1] ?? pre),
  'le script ne pose JAMAIS allergenes_valides_le',
  'c\'est un humain qui signe, nominativement')
T(/DÉFINITION|définitionnelle/i.test(pre),
  'la règle écrite est « vrai par définition », pas « probable »')

// ── 6. HTTP : les refus, si le serveur tourne ──────────────────────
if (BASE) {
  console.log('\n── refus HTTP ──')
  const post = async body => {
    const r = await fetch(`${BASE}/api/agents/scanner-allergenes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
    return { code: r.status, json: await r.json().catch(() => ({})) }
  }
  const anon = await post({ images: [{ image_base64: 'AAAA' }] })
  T(anon.code === 401 || anon.code === 403,
    `un appel non authentifié est refusé (HTTP ${anon.code})`,
    'cette route consomme du crédit Claude')
  const vide = await post({ images: [] })
  T(vide.code !== 200, `un corps sans image est refusé (HTTP ${vide.code})`)
} else {
  console.log('\n  (PORT non fourni — refus HTTP non testés)')
}

console.log('\n══════════════════════════════════════════════════════════')
console.log(`  ${ok} succès, ${ko} échec(s)`)
console.log('══════════════════════════════════════════════════════════')
process.exit(ko === 0 ? 0 : 1)
