// Test unitaire — règle de synchronisation commande.statut (CLAUDE.md §5)
// et clôture des ventes au comptoir.
//
// Pas de base, pas de serveur : la règle est une fonction pure
// (src/lib/commande-statut.ts). On la duplique ici en JS pour pouvoir la
// tester avec `node` sans étape de compilation — toute divergence entre les
// deux fera échouer un cas, ce qui est précisément le signal recherché.
//
// Usage : node scripts/test-commande-statut.mjs

function agregerStatutsArticles(statuts) {
  if (statuts.length === 0) return 'en_attente'
  if (statuts.every(s => s === 'servi')) return 'servi'
  if (statuts.every(s => s === 'pret' || s === 'servi')) return 'pret'
  if (statuts.some(s => s === 'en_preparation')) return 'en_preparation'
  return 'en_attente'
}

function estVenteComptoirDirecte(cmd) {
  return cmd.source === 'COMPTOIR' && !cmd.numero_table && !cmd.ardoise_nom?.trim()
}

function statutCommandeCible(statutsArticles, cmd) {
  const agrege = agregerStatutsArticles(statutsArticles)
  if (agrege === 'servi' && estVenteComptoirDirecte(cmd)) return 'encaisse'
  return agrege
}

const COMPTOIR  = { source: 'COMPTOIR', numero_table: null, ardoise_nom: null }
const ARDOISE   = { source: 'COMPTOIR', numero_table: null, ardoise_nom: 'Marcel' }
const TABLE     = { source: 'TABLE',    numero_table: '12', ardoise_nom: null }
const ONLINE    = { source: 'ONLINE',   numero_table: null, ardoise_nom: null }

const CAS = [
  // ── Agrégat de base (règle d'or) ──
  ['aucun article',                        [],                                  TABLE,    'en_attente'],
  ['tous en attente',                      ['en_attente', 'en_attente'],        TABLE,    'en_attente'],
  ['un en préparation',                    ['en_attente', 'en_preparation'],    TABLE,    'en_preparation'],
  ['tous prêts',                           ['pret', 'pret'],                    TABLE,    'pret'],
  ['prêts et servis mélangés',             ['pret', 'servi'],                   TABLE,    'pret'],
  ['table entièrement servie → servi',     ['servi', 'servi'],                  TABLE,    'servi'],

  // ── Ventes au comptoir : clôture directe ──
  ['comptoir servi → encaisse',            ['servi'],                           COMPTOIR, 'encaisse'],
  ['comptoir 3 articles servis → encaisse',['servi', 'servi', 'servi'],         COMPTOIR, 'encaisse'],
  ['comptoir partiel → pas de clôture',    ['servi', 'pret'],                   COMPTOIR, 'pret'],
  ['comptoir en préparation',              ['en_preparation', 'servi'],         COMPTOIR, 'en_preparation'],

  // ── Ardoises : JAMAIS de clôture automatique ──
  ['ardoise servie → reste servi',         ['servi', 'servi'],                  ARDOISE,  'servi'],
  ['ardoise partielle',                    ['servi', 'pret'],                   ARDOISE,  'pret'],
  ['ardoise nom avec espaces → reste servi', ['servi'],
    { source: 'COMPTOIR', numero_table: null, ardoise_nom: '  Léa  ' },                   'servi'],
  ['ardoise vide (espaces seuls) → encaisse', ['servi'],
    { source: 'COMPTOIR', numero_table: null, ardoise_nom: '   ' },                       'encaisse'],

  // ── Autres sources : jamais de clôture automatique ──
  ['online servi → reste servi',           ['servi'],                           ONLINE,   'servi'],
  ['table servie → reste servi',           ['servi'],                           TABLE,    'servi'],
  ['comptoir AVEC table → reste servi',    ['servi'],
    { source: 'COMPTOIR', numero_table: '4', ardoise_nom: null },                         'servi'],
]

let ok = 0, ko = 0
console.log('╔══════════════════════════════════════════════════════════╗')
console.log('║ Test — statut commande & clôture des ventes comptoir     ║')
console.log('╚══════════════════════════════════════════════════════════╝\n')

for (const [nom, statuts, cmd, attendu] of CAS) {
  const obtenu = statutCommandeCible(statuts, cmd)
  if (obtenu === attendu) { console.log(`  ✓ ${nom}`); ok++ }
  else { console.log(`  ✗ ${nom} — attendu « ${attendu} », obtenu « ${obtenu} »`); ko++ }
}

// Invariant complémentaire : une vente comptoir directe et une ardoise ne
// peuvent jamais être vraies en même temps.
const contradiction = [COMPTOIR, ARDOISE, TABLE, ONLINE].some(
  c => estVenteComptoirDirecte(c) && Boolean(c.ardoise_nom?.trim()),
)
if (!contradiction) { console.log('  ✓ aucune ardoise classée en vente directe'); ok++ }
else { console.log('  ✗ une ardoise est classée en vente directe'); ko++ }

console.log(`\n╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Bilan : ${String(ok).padStart(3)} ✓   ${String(ko).padStart(3)} ✗                                  ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)
process.exit(ko > 0 ? 1 : 0)
