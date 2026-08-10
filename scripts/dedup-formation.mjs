// Dédoublonnage des guides de formation niveau 2 (simulations) et 3 (certifs).
// Le seed `seed-formation-niveaux.mjs` a tourné plusieurs fois → plusieurs guides
// « Je pratique » / « Quiz cert » pour un même métier.
//
// Stratégie : on regroupe par (métier, niveau) en lisant le métier dans le TITRE
// (le champ poste est trop grossier : snacking/livreur/réception sont tous 'autre').
// Dans chaque groupe on garde le MEILLEUR guide et on DÉSACTIVE les autres
// (actif=false → réversible, pas de suppression destructive). On conserve aussi
// celui qui a déjà des progressions pour ne pas perdre l'historique.
//
//   node scripts/dedup-formation.mjs            → dry-run (n'écrit rien)
//   node scripts/dedup-formation.mjs --apply    → applique (actif=false)

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
)

const strip = s => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Déduit le métier depuis le titre (ordre important : 'second' avant 'cuisinier').
function jobKey(titre) {
  const t = strip(titre)
  if (t.includes('second')) return 'second'
  if (t.includes('cuisinier') || t.includes('cuisine')) return 'cuisinier'
  if (t.includes('pizza')) return 'pizzaiolo'
  if (t.includes('barman') || t.includes('boisson')) return 'barman'
  if (t.includes('serveur') || t.includes('salle') || t.includes('service complet') || t.includes('accueil')) return 'serveur'
  if (t.includes('snack')) return 'snacking'
  if (t.includes('livreur') || t.includes('livraison')) return 'livreur'
  if (t.includes('reception') || t.includes('check-in') || t.includes('reservation') || t.includes('chambre')) return 'receptionniste'
  return 'autre:' + t.slice(0, 16)
}

function richesseConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return 0
  if (Array.isArray(cfg.actions)) return cfg.actions.length
  if (Array.isArray(cfg.scenarios)) return cfg.scenarios.length
  return 0
}

async function main() {
  console.log(`\n=== Dédoublonnage formation (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`)

  const { data: guides, error } = await sb
    .from('guides_formation')
    .select('id, titre, poste, niveau, simulation_config, actif, created_at')
    .eq('actif', true)
  if (error) { console.error('ERR guides:', error.message); process.exit(1) }

  // Compte questions + progressions par guide (pour départager les doublons).
  const { data: qq } = await sb.from('quiz_questions').select('guide_id')
  const { data: progs } = await sb.from('progressions_formation').select('guide_id')
  const nbQ = new Map(), nbProg = new Map()
  for (const q of qq ?? []) nbQ.set(q.guide_id, (nbQ.get(q.guide_id) ?? 0) + 1)
  for (const p of progs ?? []) nbProg.set(p.guide_id, (nbProg.get(p.guide_id) ?? 0) + 1)

  // On ne dédoublonne QUE les niveaux 2 et 3 (les manuels niveau 1 sont uniques par poste).
  const cibles = guides.filter(g => (g.niveau ?? (g.simulation_config ? 2 : 1)) >= 2)

  // Groupe par (métier, niveau)
  const groupes = new Map()
  for (const g of cibles) {
    const niveau = g.niveau ?? (g.simulation_config ? 2 : 1)
    const key = `${jobKey(g.titre)}__n${niveau}`
    if (!groupes.has(key)) groupes.set(key, [])
    groupes.get(key).push({ ...g, niveau })
  }

  const aDesactiver = []
  let nbGroupesDoublons = 0

  for (const [key, gs] of [...groupes.entries()].sort()) {
    if (gs.length <= 1) continue
    nbGroupesDoublons++
    // Score de préférence du "keeper" :
    //   1) a des progressions (préserve l'historique) — poids fort
    //   2) richesse config (n2) ou nb questions (n3)
    //   3) plus ancien (created_at) — stable
    const score = g => {
      const prog = (nbProg.get(g.id) ?? 0) * 1000
      const rich = g.niveau === 3 ? (nbQ.get(g.id) ?? 0) : richesseConfig(g.simulation_config)
      return prog + rich
    }
    const tri = [...gs].sort((a, b) => score(b) - score(a) || new Date(a.created_at) - new Date(b.created_at))
    const keeper = tri[0]
    const losers = tri.slice(1)
    console.log(`▶ ${key}  (${gs.length} guides)`)
    console.log(`   ✅ GARDÉ   : ${keeper.titre}  [poste=${keeper.poste} q=${nbQ.get(keeper.id) ?? 0} prog=${nbProg.get(keeper.id) ?? 0} rich=${richesseConfig(keeper.simulation_config)}]`)
    for (const l of losers) {
      console.log(`   ❌ DÉSACT. : ${l.titre}  [poste=${l.poste} q=${nbQ.get(l.id) ?? 0} prog=${nbProg.get(l.id) ?? 0} rich=${richesseConfig(l.simulation_config)}]`)
      aDesactiver.push(l)
    }
    console.log('')
  }

  console.log(`Résumé : ${nbGroupesDoublons} groupes avec doublons · ${aDesactiver.length} guides à désactiver.\n`)

  if (!APPLY) {
    console.log('DRY-RUN — rien écrit. Relance avec --apply pour appliquer.\n')
    return
  }

  for (const g of aDesactiver) {
    const { error: e } = await sb.from('guides_formation').update({ actif: false }).eq('id', g.id)
    if (e) console.log(`   ⚠ échec désactivation ${g.id}: ${e.message}`)
  }
  console.log(`✓ ${aDesactiver.length} guides désactivés (actif=false, réversible).\n`)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
