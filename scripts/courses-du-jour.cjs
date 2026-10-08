// LA LISTE DES COURSES — tous les postes, le fournisseur le moins cher.
//
//   node scripts/courses-du-jour.cjs [--pour AAAA-MM-JJ] [--habituel] [--ecrire]
//
// LECTURE SEULE par défaut : aucun bon créé, aucun message envoyé. `--ecrire`
// ne fait qu'écrire les fichiers à copier dans data/, rien en base.
//
// ⚠️ AUCUN SECOND CALCUL. Le stock vient de `chargerLignesReassort()`, les
// quantités de `aCommander()`, le choix du fournisseur de
// `fournisseurRetenu()` — exactement ce que lisent `/admin/reassort` et
// l'agent Stock. Une troisième implémentation finirait par annoncer une
// quantité que l'écran ne montre pas, et c'est l'écran qu'on croit.
//
// ⚠️ GROUPÉ PAR FOURNISSEUR, pas par carte : on passe UNE commande par
// fournisseur. Le poste est rappelé sur chaque ligne, parce que c'est lui
// qui dit à qui la marchandise est destinée au déchargement.
//
// ⚠️ ON COMMANDE AU MOINS CHER (décision du gérant, 27/09/2026), et
// seulement là où la comparaison TIENT — même base, deux fournisseurs
// distincts, écart ≥ 10 %. `--habituel` revient au fournisseur en place.
//
// ⚠️⚠️ UNE LIGNE QUI CHANGE DE FOURNISSEUR PART SANS PRIX. Notre coût est
// celui de NOTRE conditionnement, le sien celui du sien : les convertir de
// tête écrirait un faux prix sur un document qui engage de l'argent, et un
// faux prix ne se signale pas, il se découvre à la facture.
//
// ⚠️ LE TOTAL DIT CE QU'IL IGNORE. Les prix ESTIMÉS (0165) sont comptés à
// part des prix relevés, et les lignes sans prix ne valent pas zéro — un
// zéro se lit « gratuit ».
//
// ⚠️ LES LIGNES SANS FOURNISSEUR SONT AFFICHÉES EN DERNIER, jamais masquées :
// ce sont celles qu'on oublierait de commander.
const fs = require('node:fs'), path = require('node:path')

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const jiti = require('jiti')(__filename, {
  alias: { '@': path.resolve(__dirname, '..', 'src') },
  interopDefault: true, esmResolve: true,
})
const { createClient } = require('@supabase/supabase-js')
const { chargerLignesReassort } = jiti('../src/lib/reassort-donnees.ts')
const R = jiti('../src/lib/reassort.ts')

const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null }
const POUR = arg('--pour') ?? new Date().toISOString().slice(0, 10)
const MOINS_CHER = !process.argv.includes('--habituel')
const ECRIRE = process.argv.includes('--ecrire')
const f = (n, d = 2) => n.toFixed(d).replace('.', ',')
const q = n => (Number.isInteger(n) ? String(n) : f(n, 3))

;(async () => {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const brut = await chargerLignesReassort(sb, POUR)
  // ⚠️ Un comptage vieux de plus de 30 jours N'EST PAS UN STOCK : il est
  // ramené à « inconnu », sinon on proposerait un complément sur une réserve
  // qui n'existe plus.
  const lignes = R.sansComptagePerime(brut)
  const ouverture = R.stockAReconstituer(lignes)
  const { prets, sansFournisseur, bascules } = R.lignesCommandables(lignes, MOINS_CHER)

  console.log(`\n${'═'.repeat(74)}`)
  console.log(`  LISTE DES COURSES · ${POUR}${MOINS_CHER ? ' · au moins cher' : ' · fournisseur habituel'}`)
  if (ouverture) console.log(`  ⚠️ Aucun comptage récent : c'est une commande d'OUVERTURE, pas un réassort.`)
  console.log('═'.repeat(74))

  const parFourn = new Map()
  for (const l of prets) {
    const k = l.retenu.nom
    if (!parFourn.has(k)) parFourn.set(k, [])
    parFourn.get(k).push(l)
  }
  const ordre = [...parFourn.entries()].sort((a, b) => b[1].length - a[1].length)

  let totalRel = 0, totalEst = 0, nSansPrix = 0
  const csv = ['Fournisseur;Poste;Produit;A commander;Unite;Prix unitaire HT;Total HT;Prix;Note']
  const fichiers = new Map()

  for (const [fourn, ls] of ordre) {
    let sRel = 0, sEst = 0, sans = 0
    const lignesTxt = []
    console.log(`\n┌─ ${fourn.toUpperCase()} — ${ls.length} ligne(s)`)
    const parPoste = new Map()
    for (const l of ls) {
      const p = l.etablissement ?? (l.categorie ? `— ${l.categorie}` : '— non rattaché')
      if (!parPoste.has(p)) parPoste.set(p, [])
      parPoste.get(p).push(l)
    }
    for (const [poste, pl] of [...parPoste.entries()].sort()) {
      console.log(`│  ${poste}`)
      for (const l of pl.sort((a, b) => a.nom.localeCompare(b.nom))) {
        const tot = l.prix == null ? null : Math.round(l.quantite * l.prix * 100) / 100
        if (tot == null) { sans++; nSansPrix++ }
        else if (l.estime) { sEst += tot; totalEst += tot }
        else { sRel += tot; totalRel += tot }
        const note = l.retenu.bascule
          ? `⇄ moins cher que ${l.fournisseur ?? 'ailleurs'} (−${Math.abs(l.ailleurs?.ecartPct ?? 0).toFixed(0)} %) · tarif à confirmer`
          : l.estime ? 'prix estimé, à confirmer' : ''
        const prix = tot == null ? '     à confirmer' : `${f(tot).padStart(8)} €`
        console.log(`│    ${q(l.quantite).padStart(7)} ${String(l.unite ?? '').padEnd(10)} ${l.nom.slice(0, 32).padEnd(32)} ${prix}  ${note}`)
        lignesTxt.push(`${q(l.quantite)} ${l.unite ?? ''} — ${l.nom}${note ? `   [${note}]` : ''}`)
        csv.push([fourn, poste, l.nom, q(l.quantite), l.unite ?? '', l.prix == null ? '' : f(l.prix, 4),
          tot == null ? '' : f(tot), l.prix == null ? 'inconnu' : l.estime ? 'estime' : 'releve', note].join(';'))
      }
    }
    const bilan = [sRel ? `${f(sRel)} € relevés` : null, sEst ? `${f(sEst)} € estimés` : null,
      sans ? `${sans} ligne(s) sans prix` : null].filter(Boolean).join(' · ')
    console.log(`└─ ${bilan || 'aucun prix connu'}`)
    fichiers.set(fourn, `COMMANDE ${fourn} — ${POUR}\nCASATASIA, Parking des Ferrages, 83136 Sainte-Anastasie-sur-Issole\n\n`
      + lignesTxt.map(x => '  ' + x).join('\n')
      + `\n\n${bilan || 'aucun prix connu'}\n`)
  }

  if (sansFournisseur.length) {
    console.log(`\n┌─ ⚠️ ${sansFournisseur.length} LIGNE(S) SANS FOURNISSEUR — à commander, mais on ne sait pas chez qui`)
    for (const l of sansFournisseur.sort((a, b) => (a.etablissement ?? '').localeCompare(b.etablissement ?? '')))
      console.log(`│    ${q(R.aCommander(l)).padStart(7)} ${String(l.unite ?? '').padEnd(10)} ${l.nom.slice(0, 32).padEnd(32)} ${l.etablissement ?? l.categorie ?? ''}`)
    console.log('└─')
  }

  console.log(`\n${'─'.repeat(74)}`)
  console.log(`  ${prets.length} lignes commandables chez ${parFourn.size} fournisseur(s)`)
  console.log(`  ${f(totalRel)} € sur des prix RELEVÉS  ·  ${f(totalEst)} € sur des ESTIMATIONS`)
  if (nSansPrix) console.log(`  ${nSansPrix} ligne(s) sans prix connu — NON chiffrées, jamais comptées pour zéro`)
  if (bascules.length) {
    const eco = R.economieEstimee(prets)
    console.log(`  ${bascules.length} ligne(s) changent de fournisseur · ≈ ${f(eco)} € économisés (estimation catalogue)`)
  }
  if (sansFournisseur.length) console.log(`  ⚠️ ${sansFournisseur.length} ligne(s) sans interlocuteur : la commande n'est PAS complète`)
  console.log('─'.repeat(74) + '\n')

  if (!ECRIRE) { console.log('   (lecture seule — relancer avec --ecrire pour sortir les fichiers)\n'); return }
  const dir = `data/courses-${POUR}`
  fs.mkdirSync(dir, { recursive: true })
  for (const [fourn, txt] of fichiers)
    fs.writeFileSync(path.join(dir, fourn.replace(/[^\w-]+/g, '-') + '.txt'), txt)
  fs.writeFileSync(`${dir}/tout.csv`, csv.join('\n'))
  console.log(`   ✓ ${fichiers.size} bon(s) à copier + tout.csv → ${dir}/\n`)
})().catch(e => { console.error('⛔', e.message); process.exit(1) })
