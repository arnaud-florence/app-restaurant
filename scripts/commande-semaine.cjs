// LA COMMANDE DE LA SEMAINE — ce qu'il faut acheter, chez qui, en quelle
// quantité, pour couvrir la semaine qu'on va servir.
//
//   node scripts/commande-semaine.cjs [--pour AAAA-MM-JJ] [--habituel] [--csv]
//
// LECTURE SEULE. Aucun bon n'est créé, aucun message n'est envoyé : la
// création des bons se fait depuis `/admin/reassort` (elle passe par
// `requireManager()`), et l'envoi reste un second geste explicite (0160).
//
// ⚠️⚠️ IL N'Y A PAS DE SECONDE IMPLÉMENTATION ICI. Ce script appelle
// `chargerLignesReassort()` et `lignesCommandables()` — exactement ce que
// lit `/admin/reassort` et ce que lit l'agent Stock. Un troisième calcul
// finirait par annoncer une quantité que l'écran ne montre pas, et c'est
// l'écran que le gérant croira.
//
// ⚠️⚠️ ON DIMENSIONNE SUR LA SEMAINE SERVIE, PAS SUR AUJOURD'HUI. Une
// commande se passe plusieurs jours avant la livraison : `--pour` porte le
// premier jour de la semaine à couvrir, et c'est lui qui sélectionne
// l'ardoise. Sans ça, à sept jours de l'ouverture, les cibles retombaient
// sur la carte ENTIÈRE alors que l'ardoise réduite était déjà saisie.
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
const CSV = process.argv.includes('--csv')

const eur = n => n == null ? '—'
  : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const nb = n => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })

;(async () => {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } })

  const brut = await chargerLignesReassort(sb, POUR)
  // ⚠️ Un comptage de plus de 30 jours n'est PAS un stock : la maison a pu
  // fermer entre-temps. Il est écarté du calcul et la date reste dite.
  const lignes = R.sansComptagePerime(brut)
  const c = R.lignesCommandables(lignes, MOINS_CHER)

  const ouverture = R.stockAReconstituer(lignes)
  const surArdoise = lignes.filter(l => l.cible_origine === 'ardoise').length

  console.log(`\n╔═══ COMMANDE POUR LA SEMAINE DU ${POUR} ═══`)
  console.log(`║  ${MOINS_CHER ? 'au MOINS CHER (bascule autorisée)' : 'chez le fournisseur HABITUEL'}`)
  console.log(`║  ${lignes.length} références suivies · ${c.prets.length} à commander`)
  console.log(`║  ${surArdoise > 0
    ? `${surArdoise} dimensionnées sur l'ARDOISE de la semaine`
    : "⚠️ aucune ardoise ne couvre cette date — repli sur la carte ENTIÈRE,\n║     c'est le scénario le plus coûteux en reliquat"}`)
  if (ouverture) console.log('║  ⚠️ aucun comptage récent : c\'est une commande d\'OUVERTURE,\n║     les quantités valent la cible entière')
  console.log('╚' + '═'.repeat(48))

  // ─── Par fournisseur : l'ordre dans lequel on commande ────────────────
  const par = new Map()
  for (const l of c.prets) {
    const f = l.retenu.nom
    if (!par.has(f)) par.set(f, { id: l.retenu.id, lignes: [], total: 0, inconnus: 0, bascules: 0 })
    const g = par.get(f)
    g.lignes.push(l)
    if (l.prix == null) g.inconnus++; else g.total += l.prix * l.quantite
    if (l.retenu.bascule) g.bascules++
  }

  const { data: fours } = await sb.from('fournisseurs')
    .select('id, nom, email, jours_livraison, minimum_commande').eq('actif', true)
  const infoF = new Map((fours ?? []).map(f => [f.id, f]))

  let TOTAL = 0, INCONNUS = 0
  for (const [nom, g] of [...par].sort((a, b) => b[1].total - a[1].total)) {
    TOTAL += g.total; INCONNUS += g.inconnus
    const f = infoF.get(g.id) ?? {}
    console.log(`\n━━━ ${nom.toUpperCase()} — ${g.lignes.length} lignes · ${eur(g.total)}` +
      (g.inconnus ? `  ⚠️ + ${g.inconnus} à tarif inconnu` : ''))
    console.log(`    ${f.email ? '✉ ' + f.email : '⛔ AUCUNE ADRESSE — rien ne pourra partir'}` +
      (f.jours_livraison ? `  ·  livre : ${f.jours_livraison}` : ''))
    if (g.bascules) console.log(`    ↪ ${g.bascules} ligne(s) réaiguillée(s) ici car moins chères — tarif à confirmer`)
    for (const l of g.lignes.sort((a, b) => (b.prix ?? 0) * b.quantite - (a.prix ?? 0) * a.quantite)) {
      const t = l.prix == null ? 'à confirmer' : eur(l.prix * l.quantite)
      console.log(`      ${nb(l.quantite).padStart(7)} ${(l.unite ?? '').slice(0, 14).padEnd(15)} ${t.padStart(11)}  ` +
        `${(l.nom_vente ?? l.nom).slice(0, 42).padEnd(43)}${l.reference ? ' réf. ' + l.reference : ''}`)
    }
  }

  console.log(`\n╔═══ TOTAL ${eur(TOTAL)} chiffré` +
    (INCONNUS ? ` · ${INCONNUS} lignes à tarif à confirmer` : ''))
  if (MOINS_CHER) {
    const eco = R.economieEstimee(c.prets)
    console.log(`║  bascules : ${c.bascules.length} ligne(s), ≈ ${eur(eco)} d'économie ESTIMÉE`)
    console.log('║  ⚠️ estimation d\'après les tarifs comparés, pas un prix négocié')
  }
  console.log('╚' + '═'.repeat(48))

  // ⚠️ CE QU'ON NE PEUT PAS COMMANDER EST DIT, jamais tu. Annoncer une
  // commande complète alors qu'il manque un morceau est le pire des deux.
  if (c.sansFournisseur.length) {
    console.log(`\n⚠️ ${c.sansFournisseur.length} RÉFÉRENCES SANS INTERLOCUTEUR — elles ne partiront chez personne :\n`)
    for (const l of c.sansFournisseur.slice(0, 20))
      console.log(`   ${nb(R.aCommander(l)).padStart(6)} ${(l.unite ?? '').slice(0, 14).padEnd(15)} ${(l.nom_vente ?? l.nom).slice(0, 48)}`)
    if (c.sansFournisseur.length > 20) console.log(`   … ${c.sansFournisseur.length - 20} autres`)
  }
  const sansCible = lignes.filter(l => (l.cible ?? 0) <= 0)
  if (sansCible.length) {
    console.log(`\n⚠️ ${sansCible.length} références SANS CIBLE : aucune quantité n'est proposée.`)
    console.log("   Un nombre sorti de nulle part se fait valider par habitude.")
  }

  if (CSV) {
    const out = ['Fournisseur;Reference;Produit;Quantite;Unite;Prix unitaire HT;Total HT;Tarif']
    for (const [nom, g] of par) for (const l of g.lignes)
      out.push([nom, l.reference ?? '', `"${(l.nom_vente ?? l.nom).replace(/"/g, "'")}"`,
        l.quantite, l.unite ?? '', l.prix ?? '', l.prix == null ? '' : (l.prix * l.quantite).toFixed(2),
        l.prix == null ? 'a confirmer' : 'releve'].join(';'))
    const f = `data/commande-${POUR}.csv`
    fs.writeFileSync(f, out.join('\n') + '\n')
    console.log(`\n✓ ${f}`)
  }
  console.log()
})().catch(e => { console.error('ÉCHEC :', e.message); process.exit(1) })
