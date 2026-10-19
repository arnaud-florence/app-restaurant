// UN BOUTON GÉNÉRIQUE « COCKTAIL » À 8,00 € — 17/10/2026.
//
// Demande du gérant : « ajoute le cocktail a 8€ ». Aucun cocktail n'existait
// sur la carte — ni mojito, ni gin tonic ; le Planteur est désactivé et le
// Spritz est à 6,00 €. Interrogé, il a confirmé vouloir UN bouton générique,
// pas un cocktail nommé.
//
// ⚠️ LA QUESTION VALAIT L'ALLER-RETOUR : « le cocktail » au singulier et sans
// nom pouvait aussi bien désigner un mojito précis, qui aurait eu une
// composition, donc un coût et une sortie de stock. Et Zelty ne sait pas
// supprimer un plat : un bouton créé de travers reste pour toujours. Même
// discipline que le fetus (« un petit pastis » → « c'est du whisky ») et que
// les six parfums de jus inventés puis retirés.
//
// ⚠️ LE PATRON EXISTE DÉJÀ sur cette carte : « Digestif 4 cl » (4,00 €),
// « Alcool + soft », « Whisky premium 4 cl » sont des boutons génériques. On
// suit la convention de la maison plutôt que d'en inventer une.
//
// ⚠️ FAMILLE « Apéritif », avec le Spritz. Une famille « Cocktail » à un seul
// produit n'a pas sa place sur une caisse — règle posée en rangeant la
// Focaccia en Sandwich. Elle se créera le jour où il y en aura trois.
//
// ⚠️⚠️ AUCUN COÛT D'ACHAT, ET C'EST LE POINT. Le contenu se CHOISIT : le
// chiffrer sur une recette fixe mentirait pour tous les autres cocktails —
// exactement la règle de « Formule CasaTasia » et du menu enfant. Il sort donc
// en « coût inconnu » (gris), jamais à zéro, qui se lirait « gratuit » (0150).
// Repère non écrit : le Spritz coûte 1,54 €, soit ~23 % de food cost à 8 €.
//
// ⚠️⚠️ ON EFFACE LES CHAMPS D'ACHAT ET LES ALLERGÈNES DU GABARIT. Le Spritz
// porte son propre coût (1,54 €) et ses sulfites (c'est un prosecco) : copiés
// tels quels, le prochain scan de facture écrirait le prix du Spritz sur le
// Cocktail, et la fiche déclarerait des sulfites que personne n'a lus. C'est
// la leçon des quatre desserts du 13/10 et du Gommé qui avait hérité des
// sulfites du Martini.
//
// ⚠️ TVA 20 % DANS LES DEUX MODES — il contient de l'alcool. Un taux recopié
// d'un script de desserts (1000) sous-collecterait, et un taux trop BAS est le
// seul qui ne se rattrape pas : on ne réclame pas après coup au client.
//
// ⚠️ `vendable_online: false` — l'alcool n'est JAMAIS en ligne, il n'y a pas
// de contrôle d'âge sur le click & collect (0144).
//
// ⚠️ PAS de `prix_sur_place_ttc` : au bar, le sur place EST le prix.
//
// ⚠️ PAS de `nom_matiere` : il mélange plusieurs matières, comme le Spritz, le
// Kir et le Monaco. Lui en poser une perdrait les autres, qui sortiraient du
// stock sans que rien ne le signale. Conséquence assumée : le réassort ne voit
// pas partir le rhum.
//
// ⚠️ PAS de `id_fabrication_place` sur une CRÉATION : Zelty répond 500
// (vécu le 12/10 sur les jus). Le poste se pose après coup, par upsert.
//
// ⚠️ Il reprend sur la CORRESPONDANCE DE CAISSE, pas sur le nom : un produit
// peut exister chez nous et pas en caisse (429 au mauvais moment, vécu deux
// fois), et juger sur le nom le ferait sortir « existe déjà » pour toujours.
//
//   node scripts/cocktail-generique-1710.mjs [--ecrire] [--prix=N]
import fs from 'node:fs'

const NOM = 'Cocktail'
const GABARIT = 'Spritz'
const FAMILLE = 'Apéritif'
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d }
const TTC = arg('prix', 8.00)
const ECRIRE = process.argv.includes('--ecrire')

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const sb = async (c, o = {}) => {
  let der, fatal = false
  for (let n = 1; n <= 5; n++) {
    try {
      const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${c}`, { ...o,
        headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
                   Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
                   'Content-Type': 'application/json', Prefer: 'return=representation',
                   ...(o.headers || {}) } })
      const t = await r.text()
      if (r.ok) return t ? JSON.parse(t) : null
      der = `Supabase ${r.status} :: ${t.slice(0, 220)}`
      // ⚠️⚠️ UN 4xx NE SE CORRIGERA PAS EN RÉESSAYANT, et le `throw` d'ici
      // était attrapé par le `catch` juste en dessous : un PGRST204 (colonne
      // inconnue) était rejoué cinq fois, puis annoncé « Supabase injoignable »
      // — trente secondes perdues et un message qui désigne la mauvaise cause.
      if (r.status < 500) { fatal = true; break }
    } catch (e) { der = e.cause?.code ?? e.message; console.log(`   base, tentative ${n} → ${der}`) }
    await new Promise(s => setTimeout(s, 2000 * n))
  }
  throw new Error(fatal ? der : `Supabase injoignable : ${der}`)
}
const zl = async (p, o = {}) => {
  let d = { status: 0, body: {} }
  for (let n = 1; n <= 5; n++) {
    try {
      const r = await fetch('https://api.zelty.fr/2.11/' + p, { ...o,
        headers: { Authorization: `Bearer ${env.ZELTY_API_KEY}`,
                   'Content-Type': 'application/json', ...(o.headers || {}) } })
      d = { status: r.status, body: await r.json().catch(() => ({})) }
      if (r.status === 200) return d
      console.log(`   caisse, tentative ${n} sur ${p} → HTTP ${r.status} ${JSON.stringify(d.body).slice(0, 160)}`)
      if (r.status !== 429 && r.status < 500) return d
    } catch (e) { console.log(`   caisse, tentative ${n} sur ${p} → ${e.cause?.code ?? e.message}`) }
    await new Promise(s => setTimeout(s, 3000 * n))
  }
  return d
}

console.log(`\n🍸 « ${NOM} » à ${TTC.toFixed(2)} € — bouton générique`)
console.log(ECRIRE ? '   MODE ÉCRITURE\n' : '   essai à blanc (--ecrire pour appliquer)\n')

const [gab] = await sb(`recettes?select=*&nom=eq.${encodeURIComponent(GABARIT)}`)
if (!gab) throw new Error(`gabarit « ${GABARIT} » introuvable — rien écrit`)
if (!gab.contient_alcool) throw new Error(`« ${GABARIT} » n'est pas marqué alcoolisé — le gabarit ne convient pas`)
if (Number(gab.tva) !== 20) throw new Error(`« ${GABARIT} » est à ${gab.tva} % — un cocktail est à 20 %, rien écrit`)

const [existe] = await sb(`recettes?select=id,nom,actif,prix_vente_ht,tva&nom=eq.${encodeURIComponent(NOM)}`)
const ht = Number((TTC / 1.20).toFixed(4))
console.log(`   famille ${FAMILLE} (avec ${GABARIT} à ${(gab.prix_vente_ht * 1.2).toFixed(2)} €) · TVA 20 % les deux modes`)
console.log(`   ${TTC.toFixed(2)} € TTC = ${ht.toFixed(4)} € HT`)
console.log(`   coût d'achat : AUCUN — le contenu se choisit (repère : le Spritz coûte ${Number(gab.cout_achat_ht).toFixed(4)} €, soit ${(Number(gab.cout_achat_ht) / ht * 100).toFixed(0)} % à ce prix)`)
console.log(`   effacés du gabarit : cout_achat_ht, libelle_achat, reference_fournisseur, nom_matiere, allergènes ${JSON.stringify(gab.allergenes_complementaires)}`)
console.log(`   ${existe ? `⚠ « ${NOM} » existe déjà en base (${existe.actif ? 'actif' : 'INACTIF'}) — on ne recrée pas` : 'nouveau produit'}`)

if (!ECRIRE) { console.log('\nEssai à blanc — rien écrit.\n'); process.exit(0) }

// ── 1. notre base, par COPIE du gabarit (unites_par_achat est NOT NULL) ──
let prod = existe
if (!prod) {
  const { id, created_at, updated_at, ...base } = gab
  const [cree] = await sb('recettes', { method: 'POST', body: JSON.stringify([{
    ...base,
    nom: NOM, nom_caisse: NOM, categorie: FAMILLE,
    prix_vente_ht: ht, prix_sur_place_ttc: null, tva: 20,
    contient_alcool: true, vendable_online: false, actif: true,
    cout_achat_ht: null, libelle_achat: null, reference_fournisseur: null,
      // ⚠⚠ CINQUIÈME champ d'achat (ajouté le 19/10) : `fournisseur_id` se
      // copiait avec le gabarit, attribuant le produit à un fournisseur que RIEN
      // ne prouve — et un bon serait parti là-bas. La 0164 est explicite : trois
      // sources factuelles (facture, référence au catalogue, relevé), jamais une
      // déduction.
      fournisseur_id: null,
    nom_matiere: null, unites_par_achat: 1,
    allergenes_complementaires: [], allergenes_valides_le: null, allergenes_valides_par: null,
    description: 'Cocktail du bar, préparé au comptoir.',
    image_url: null, rupture_le: null,
  }]) })
  prod = cree
  console.log(`   ✓ base : « ${prod.nom} » créé · ${prod.id}`)
} else {
  await sb(`recettes?id=eq.${prod.id}`, { method: 'PATCH', body: JSON.stringify({
    prix_vente_ht: ht, tva: 20, categorie: FAMILLE, actif: true, vendable_online: false }) })
  console.log(`   ✓ base : « ${prod.nom} » mis à jour · ${prod.id}`)
}

// ── 2. la caisse. Reprise sur la CORRESPONDANCE, pas sur le nom ──────
const plats = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
if (plats.length < 100) throw new Error(`la caisse rend ${plats.length} plats — LECTURE RATÉE, rien poussé`)
const deja = plats.find(x => String(x.remote_id) === prod.id)
if (deja) {
  console.log(`   = déjà en caisse (#${deja.id}) — rien recréé`)
} else {
  const tags = (await zl('catalog/tags')).body.tags ?? []
  const tag = tags.find(t => t.name === FAMILLE)
  if (!tag) throw new Error(`famille « ${FAMILLE} » inconnue de la caisse`)
  // ⚠️ tax en MILLIÈMES, 2000 = 20 %. Les DEUX modes : l'alcool ne baisse pas
  // à emporter. ⚠️ PAS de id_fabrication_place sur une création (500).
  const rep = await zl('catalog/dishes', { method: 'POST', body: JSON.stringify([{
    name: NOM, remote_id: prod.id, tags: [tag.id],
    price: Math.round(TTC * 100), price_togo: Math.round(TTC * 100),
    tax: 2000, tax_takeaway: 2000, disable: false,
  }]) })
  if (rep.status !== 200) throw new Error(`caisse : ${rep.status} ${JSON.stringify(rep.body).slice(0, 300)}`)
  console.log(`   ✓ caisse : plat créé`)
}

// ── 3. relecture ───────────────────────────────────────────────────
const apres = (await zl('catalog/dishes?show_all=true&limit=0')).body.dishes ?? []
const z = apres.find(x => String(x.remote_id) === prod.id)
const [b] = await sb(`recettes?id=eq.${prod.id}&select=nom,categorie,prix_vente_ht,tva,cout_achat_ht,contient_alcool,vendable_online,allergenes_complementaires,allergenes_valides_le`)
console.log(`\n   relu base   : ${b.nom} · ${b.categorie} · ${(b.prix_vente_ht * 1.2).toFixed(2)} € TTC · coût ${b.cout_achat_ht ?? 'AUCUN'} · alcool ${b.contient_alcool} · online ${b.vendable_online} · allergènes ${JSON.stringify(b.allergenes_complementaires)} signé ${b.allergenes_valides_le ?? 'non'}`)
if (!z) { console.log('   ✗ ABSENT de la caisse'); process.exit(1) }
console.log(`   relu caisse : #${z.id} « ${z.name} » · ${(z.price / 100).toFixed(2)} / ${(z.price_togo / 100).toFixed(2)} · tax ${z.tax}/${z.tax_takeaway} · ${z.disable ? 'ÉTEINT' : 'actif'}`)
if (z.tax !== 2000 || z.tax_takeaway !== 2000) { console.log('   ✗ TVA ≠ 20 % — sous-collecte'); process.exit(1) }
if (z.price !== Math.round(TTC * 100)) { console.log('   ✗ prix non appliqué'); process.exit(1) }
if (b.cout_achat_ht != null) { console.log('   ✗ un coût a été copié du gabarit'); process.exit(1) }
if ((b.allergenes_complementaires ?? []).length) { console.log('   ✗ des allergènes ont été copiés du gabarit'); process.exit(1) }
console.log('\n✅ Bouton générique en place, coût inconnu assumé.\n')
