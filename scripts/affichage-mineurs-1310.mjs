// L'affichage « interdiction de vente aux mineurs » manquait au registre.
//
// Constaté le 13/10/2026 en créant le puff rechargeable : les 14 affichages
// suivis par `affichages_verifications` couvrent l'interdiction de FUMER, les
// horaires, la convention collective, l'origine des viandes… mais **aucun ne
// parle de la vente aux mineurs**. Or la maison vend désormais les trois
// catégories concernées :
//
//   · l'ALCOOL — licence IV, art. L3342-4 du code de la santé publique :
//     l'affiche rappelant l'interdiction de vente aux mineurs est obligatoire
//     dans tout débit de boissons ;
//   · le VAPOTAGE — art. L3513-5 : même interdiction, même obligation ;
//   · le TABAC et ses accessoires — art. L3512-12.
//
// ⚠️ `present: false` — on ne déclare pas présent un affichage que personne
// n'a vu au mur. Même règle que les obligations légales (0147) : « une
// échéance fausse dans un registre légal est pire que pas d'échéance, elle
// rassure ». `date_verification` reste NULLE jusqu'à ce qu'un humain regarde.
//
// ⚠️ Idempotent : rapproché sur le titre, n'écrase jamais une ligne vérifiée
// à la main entre-temps.
//
//   node scripts/affichage-mineurs-1310.mjs [--ecrire]
import { readFileSync } from 'node:fs'

const ECRIRE = process.argv.includes('--ecrire')
const TITRE = 'Interdiction de vente aux mineurs (alcool, tabac, vapotage)'

const env = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const H = { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (c, o = {}) => {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${c}`, { ...o, headers: H })
  const t = await r.text()
  if (!r.ok) throw new Error(`Supabase ${r.status} :: ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}

const tous = await sb('affichages_verifications?select=id,titre,present,ordre')
const deja = tous.find(a => /mineur/i.test(a.titre))
console.log(`\n📋 ${tous.length} affichage(s) au registre · ${tous.filter(a => a.present).length} présent(s)`)
if (deja) { console.log(`   = « ${deja.titre} » existe déjà (${deja.present ? 'présent' : 'absent'})\n`); process.exit(0) }
console.log(`   → à ajouter : « ${TITRE} »`)
console.log(`      obligatoire, marqué ABSENT, sans date de vérification`)
if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

const [c] = await sb('affichages_verifications', { method: 'POST', body: JSON.stringify([{
  titre: TITRE,
  description: "Affiche rappelant l'interdiction de vendre de l'alcool, du tabac, "
    + 'des accessoires de fumeur et des produits de vapotage aux mineurs de moins '
    + "de 18 ans. Obligatoire dès lors que l'un de ces produits est vendu — c'est "
    + 'le cas depuis le 13/10/2026 (feuilles OCB, briquet, puff rechargeable) et '
    + 'depuis la reprise de la licence IV.',
  reference_legale: 'Code de la santé publique, art. L3342-4 (alcool), L3512-12 (tabac), L3513-5 (vapotage)',
  obligatoire: true,
  present: false,                 // personne ne l'a vu au mur
  date_verification: null,        // on ne date pas un contrôle qui n'a pas eu lieu
  ordre: Math.max(0, ...tous.map(a => Number(a.ordre) || 0)) + 1,
  notes: 'Ajouté en créant le puff rechargeable : le registre ne portait AUCUNE '
    + 'mention de la vente aux mineurs, alors que la maison vend les trois '
    + 'catégories concernées.',
}]) })
console.log(`   ✓ ajouté ${c.id} · obligatoire, ABSENT`)
console.log('\n⚠ À imprimer et poser au comptoir, puis cocher dans /admin/legal.\n')
