// Les 9 lignes livrées que rien ne stockait — 02/10/2026.
//
// `audit-chaine-livraison.mjs` les a trouvées : livrées, payées, et invisibles
// de tous les écrans de stock parce qu'aucun produit ni aucune matière ne les
// portait. Aperol, Lavazza, CO2, sucre, prosecco, crème de cassis.
//
// ⚠️ LE PRIX VIENT DE LA COMMANDE, QUI A ÉTÉ FACTURÉE AU TARIF PUBLIC — la
// remise du contrat n'a pas été appliquée, c'est signalé à France Boissons.
// Ces prix sont donc des MAJORANTS, marqués `prix_estime = true` (0165). La
// première facture correcte les remplacera.
//
//   node scripts/matieres-livraison-fb.mjs [--ecrire]
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
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`)
  return t ? JSON.parse(t) : null
}
// libellé EXACT du bon · nom affiché · unité · catégorie
const M = [
  ['Aperol Spritz 1L',                              'Aperol 1 L',                  'bouteille', 'Bar'],
  ['Père Henry Crème de Cassis',                    'Crème de cassis 70 cl',       'bouteille', 'Bar'],
  ['Get 31',                                        'Get 31 70 cl',                'bouteille', 'Bar'],
  ['Prosecco doc Scalini',                          'Prosecco Scalini 75 cl',      'bouteille', 'Bar'],
  ['Lavazza Gold Selection',                        'Café en grains Gold 1 kg',    'kg',        'Bar'],
  ['Lavazza Dek Décaféiné Moulu boite 250gr',       'Café déca moulu 250 g',       'boîte',     'Bar'],
  ['CHOCOLAT ESPRESSO BOITE POUDRE',                'Chocolat en poudre',          'boîte',     'Bar'],
  ['Sucre Lavazza buchette 700X4gr',                'Bûchettes de sucre (700)',    'boîte',     'Bar'],
  ['Standard Tube Gaz CO2 modèle 140 bicolore 5kg', 'Tube CO2 5 kg',               'bouteille', 'Bar'],
]
const [fb] = await sb('fournisseurs?nom=eq.France%20Boissons&select=id,nom')
const [bon] = await sb('bons_commande?reference=eq.FB-47231850&select=id')
const lignes = await sb(`bon_commande_lignes?bon_commande_id=eq.${bon.id}&select=libelle,prix_unitaire_ht`)
const prix = new Map(lignes.map(l => [l.libelle, Number(l.prix_unitaire_ht)]))
const [bl] = await sb('factures_fournisseurs?numero=eq.BL-47231850&select=id')

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — matières livrées que rien ne stockait ──\n`)
for (const [lib, nom, unite, cat] of M) {
  const p = prix.get(lib)
  const [deja] = await sb(`ingredients?nom=eq.${encodeURIComponent(nom)}&select=id`)
  console.log(`   ${nom.padEnd(28)} ${String(p ?? '—').padStart(7)} €  ← « ${lib.slice(0, 40)} »${deja ? '  (existe)' : ''}`)
  if (!ECRIRE || deja) continue
  const [ing] = await sb('ingredients', { method: 'POST', body: JSON.stringify({
    nom, unite, categorie: cat, prix_achat_ht: p ?? 0, prix_estime: true,
    stocke: true, actif: true, libelle_achat: lib, fournisseur_principal: fb.nom }) })
  // la ligne du BL pointe désormais sur la matière : l'entrée sera comptée
  await sb(`facture_lignes?facture_id=eq.${bl.id}&description=eq.${encodeURIComponent(lib)}`,
    { method: 'PATCH', body: JSON.stringify({ ingredient_id: ing.id }) })
}
console.log(ECRIRE ? '\n   ✓ créées, rattachées au BL\n' : '\n  (essai à blanc — relancer avec --ecrire)\n')
