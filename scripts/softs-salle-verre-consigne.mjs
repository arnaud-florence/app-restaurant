// Deux tarifs, deux fiches : le verre consigné en brasserie, la canette à
// emporter au Fournil. Précision du gérant, 29/09/2026.
//
// ⚠️ UNE FICHE NE PEUT PORTER QU'UN COÛT. Jusqu'ici un seul produit
// « Coca-Cola 33 cl » portait le prix de la canette Euro-Cash (0,60 €) et un
// `prix_sur_place_ttc` de 2,80 € — mais ce qu'on sert à table est la bouteille
// France Boissons, à 1,128 €. La marge en salle était donc surévaluée de 88 %,
// sans qu'aucune erreur ne le signale. C'est le même motif que la TVA à 20 %
// venue de SumUp : un chiffre plausible, faux, et muet.
//
// Formats VÉRIFIÉS sur les fiches produit d'Eazle, jamais déduits d'un
// libellé : Coca 12×25 cl, Fanta / Fuze tea / Oasis / Sprite 24×25 cl,
// San Bernardo 16×75 cl, Perrier 24×33 cl.
//
// ⚠️ Le verre consigné n'est pas un choix commercial : la loi AGEC interdit le
// jetable pour la consommation sur place. Il n'existe pas d'option moins
// chère, et c'est pourquoi le Coca reste à 41 % de food cost.
//
//   node scripts/softs-salle-verre-consigne.mjs [--ecrire]
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY, Z = env.ZELTY_API_KEY
const ECRIRE = process.argv.includes('--ecrire')
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: H })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 400)}`)
  return t ? JSON.parse(t) : null
}
const f2 = n => n.toFixed(2).replace('.', ',')
const TVA = 10, ht = ttc => Math.round(ttc / 1.10 * 1e4) / 1e4

// Un seul prix pour tous les softs en verre : au comptoir on ne réfléchit pas,
// et le client non plus. L'eau de table fait exception — c'est une 75 cl.
const SOFT = 3.00, EAU = 3.50

const CREER = [
  { nom: 'Coca-Cola 25 cl',      ttc: SOFT, cout: 13.54 / 12, ref: '112242', mat: 'Coca-Cola VC 25 cl (carton de 12)' },
  { nom: 'Coca-Cola Zéro 25 cl', ttc: SOFT, cout: 12.83 / 12, ref: '112253', mat: 'Coca-Cola zero VC 25 cl (carton de 12)' },
  { nom: 'Fanta orange 25 cl',   ttc: SOFT, cout: 19.97 / 24, ref: '125410', mat: 'Fanta orange VC 25 cl (caisse de 24)' },
  { nom: 'Ice Tea pêche 25 cl',  ttc: SOFT, cout: 35.50 / 48, ref: '117890', mat: 'Fuze tea pêche VC 25 cl (caisse de 24)' },
  { nom: 'Oasis tropical 25 cl', ttc: SOFT, cout: 21.46 / 24, ref: '116574', mat: 'Oasis tropical VC 25 cl (caisse de 24)' },
  { nom: 'Eau pétillante 75 cl', ttc: EAU,  cout: 10.15 / 16, ref: '112141', mat: 'Acqua San Bernardo frizzante VC 75 cl (caisse de 16)' },
  { nom: 'Eau plate 75 cl',      ttc: EAU,  cout: 10.15 / 16, ref: '112155', mat: 'Acqua San Bernardo plate VC 75 cl (caisse de 16)' },
]

// Les softs déjà au bar s'alignent : une carte où le Perrier est à 2,80 et le
// Coca à 3,00 se lit comme une erreur de saisie.
const ALIGNER = { 'Perrier 33 cl': SOFT, 'Schweppes Agrumes 25 cl': SOFT, 'Sprite 25 cl': SOFT,
                  'Limonade 25 cl': SOFT, 'Diabolo': 3.20 }

// Au Fournil, ces canettes ne se servent plus à table : la brasserie a sa
// fiche. Laisser un prix salle sur la canette, c'est deux boutons pour le
// même geste, et l'équipe tapera celui qui coûte le moins cher à l'écran.
const RETIRER_PRIX_SALLE = ['Coca-Cola 33 cl', 'Coca-Cola Zéro 33 cl', 'Fanta 33 cl', 'Oasis 33 cl', 'Ice Tea 33 cl']

const [modele] = await sb('recettes?tag_destination=eq.BAR&categorie=eq.Boisson%20fra%C3%AEche&actif=eq.true&select=etablissement_id&limit=1')
if (!modele) { console.error('  ✗ aucun produit modèle au bar'); process.exit(1) }

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} — softs en verre consigné (brasserie) ──\n`)
const nouveaux = []
for (const p of CREER) {
  const [deja] = await sb(`recettes?nom=eq.${encodeURIComponent(p.nom)}&select=id`)
  const cout = Math.round(p.cout * 1e4) / 1e4, h = ht(p.ttc)
  console.log(`  ${deja ? '=' : '+'} ${p.nom.padEnd(24)} ${f2(p.ttc)} € · coût ${f2(cout)} · food cost ${(cout / h * 100).toFixed(0).padStart(2)} % · marge ${f2(h - cout)} €`)
  if (deja || !ECRIRE) continue
  const [n] = await sb('recettes', { method: 'POST', body: JSON.stringify({
    nom: p.nom, nom_caisse: p.nom, categorie: 'Boisson fraîche', tag_destination: 'BAR',
    etablissement_id: modele.etablissement_id, prix_vente_ht: h, tva: TVA, cout_achat_ht: cout,
    nom_matiere: p.mat, reference_fournisseur: p.ref, unites_par_achat: 1,
    contient_alcool: false, vendable_online: false, actif: true }) })
  nouveaux.push(n)
}

console.log(`\n── alignement des softs déjà au bar ──\n`)
for (const [nom, ttc] of Object.entries(ALIGNER)) {
  const [r] = await sb(`recettes?nom=eq.${encodeURIComponent(nom)}&tag_destination=eq.BAR&select=id,prix_vente_ht,prix_sur_place_ttc,tva,cout_achat_ht`)
  if (!r) { console.log(`  ✗ ${nom} introuvable`); continue }
  const av = r.prix_sur_place_ttc != null ? Number(r.prix_sur_place_ttc) : Number(r.prix_vente_ht) * (1 + Number(r.tva) / 100)
  const h = ht(ttc), c = Number(r.cout_achat_ht ?? 0)
  console.log(`  ${nom.padEnd(26)} ${f2(av)} → ${f2(ttc)} €   food cost ${(c / (av / 1.10) * 100).toFixed(0)} % → ${(c / h * 100).toFixed(0)} %`)
  if (ECRIRE) await sb(`recettes?id=eq.${r.id}`, { method: 'PATCH',
    body: JSON.stringify({ prix_vente_ht: h, prix_sur_place_ttc: null }) })
}

console.log(`\n── Fournil : la canette perd son prix salle ──\n`)
for (const nom of RETIRER_PRIX_SALLE) {
  const [r] = await sb(`recettes?nom=eq.${encodeURIComponent(nom)}&tag_destination=eq.FOURNIL&select=id,prix_sur_place_ttc,prix_vente_ht,tva,cout_achat_ht`)
  if (!r) { console.log(`  ✗ ${nom} introuvable`); continue }
  const body = { prix_sur_place_ttc: null }
  // ⚠️ L'Ice Tea avait reçu le coût du Fuze tea ce matin : c'était le prix de
  // la BOUTEILLE de salle posé sur la CANETTE à emporter. La canette vient
  // d'Euro-Cash, qui n'a pas chiffré cette ligne. On remet « inconnu » —
  // mieux vaut pas de chiffre qu'un chiffre faux.
  if (nom === 'Ice Tea 33 cl') { body.cout_achat_ht = null; body.nom_matiere = null; body.reference_fournisseur = null }
  console.log(`  ${nom.padEnd(24)} prix salle ${r.prix_sur_place_ttc == null ? '—' : f2(Number(r.prix_sur_place_ttc)) + ' €'} → retiré${body.cout_achat_ht === null ? ' · coût remis à INCONNU (canette Euro-Cash non chiffrée)' : ''}`)
  if (ECRIRE) await sb(`recettes?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

if (!ECRIRE) { console.log('\n  (rien écrit — relancer avec --ecrire)\n'); process.exit(0) }
if (!Z || !nouveaux.length) { console.log('\n  ✓ écrit.\n'); process.exit(0) }
// ⚠️ Tableau NU, un seul appel, `remote_id` = notre uuid, TVA en MILLIÈMES.
const corps = nouveaux.map(n => ({ name: n.nom_caisse, remote_id: n.id,
  price: Math.round(Number(n.prix_vente_ht) * 1.10 * 100), price_togo: Math.round(Number(n.prix_vente_ht) * 1.10 * 100),
  tax: 1000, tax_takeaway: 1000 }))
const r = await fetch('https://api.zelty.fr/2.11/catalog/dishes',
  { method: 'POST', headers: { Authorization: `Bearer ${Z}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
const j = await r.json().catch(() => ({}))
console.log(`\n  → caisse : HTTP ${r.status} · ${(j.dishes ?? []).length} plat(s) créé(s) · errno ${j.errno}`)
for (const d of j.dishes ?? [])
  await sb('correspondances_catalogue', { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ systeme: 'zelty', identifiant_externe: String(d.id), recette_id: String(d.remote_id) }) })
console.log('  ✓ correspondances enregistrées.\n')
