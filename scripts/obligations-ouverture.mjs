// Amorcer le registre des obligations légales — ouverture de septembre 2026.
//
// `obligations_legales` était VIDE : le module 17 est livré depuis des mois
// mais n'a jamais été nourri. Conséquence concrète — l'alerte à J-30 ne peut
// pas se déclencher sur une échéance qui n'existe pas, donc le registre ne
// protège de rien. Et on ouvre un débit de boissons dans quelques semaines.
//
// ⚠️ CE N'EST PAS UN AVIS JURIDIQUE. C'est la liste de contrôle d'un
// bar-restaurant-pizzeria en France, à confirmer avec la mairie, le comptable
// et le SDIS. Elle sert à ce que rien ne soit OUBLIÉ, pas à trancher.
//
// ⚠️ AUCUNE DATE N'EST INVENTÉE. Une échéance fausse dans un registre légal
// est pire que pas d'échéance : elle rassure. Toutes les lignes arrivent sans
// date, à `a_faire`. C'est le gérant qui pose les dates au fur et à mesure
// qu'il obtient les documents — et l'alerte J-30 fonctionne à partir de là.
//
// Idempotent : rapproché sur le titre, jamais de doublon, jamais d'écrasement
// d'une ligne déjà renseignée à la main.
//
//   node scripts/obligations-ouverture.mjs [--ecrire]

import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const ECRIRE = process.argv.includes('--ecrire')
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, {
    ...o, headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(o.headers || {}) },
  })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}

const B = '⛔ BLOQUANT pour l\'ouverture — '

const REGISTRE = [
  // ── Débit de boissons ────────────────────────────────────────────
  {
    titre: 'Licence IV (débit de boissons à consommer sur place)',
    categorie: 'licence_iv', frequence: 'permanent',
    description:
      "Obligatoire pour servir des spiritueux : whisky, vodka, gin, rhum, digestifs — tout le groupe 5 de notre carte bar. " +
      "Une licence III ne couvre que le groupe 3 (vin, bière, cidre, vins doux ≤ 18°) : avec une III, il faudrait retirer 7 produits de la carte.",
    notes: B +
      "Les licences IV sont CONTINGENTÉES (1 pour 450 habitants) et ne se créent plus depuis 1959 : il faut en acheter ou en faire transférer une existante, " +
      "et un transfert depuis une autre commune obéit à des règles de périmètre. C'est le seul point du registre dont le délai ne dépend pas de nous. " +
      "→ Si la maison n'en détient pas déjà une, à traiter en PRIORITÉ ABSOLUE.",
  },
  {
    titre: "Permis d'exploitation (formation débit de boissons)",
    categorie: 'permis_exploitation', frequence: '10 ans',
    description:
      "Formation obligatoire pour exploiter un débit de boissons : 20 h, ramenées à 6 h si l'exploitant justifie de 10 ans d'exploitation. Valable 10 ans.",
    notes: B + "Exigé À L'APPUI de la déclaration en mairie : sans lui, la déclaration n'est pas recevable.",
  },
  {
    titre: 'Déclaration préalable en mairie (Cerfa 11542)',
    categorie: 'licence_iv', frequence: 'à chaque ouverture / mutation',
    description:
      "Déclaration d'ouverture, mutation, translation ou transfert d'un débit de boissons, à déposer en mairie. Un récépissé est délivré.",
    notes: B + "À déposer AU MOINS 15 JOURS avant l'ouverture au public. C'est une date qui se calcule à rebours : la fixer dès que la date d'ouverture est arrêtée.",
  },
  {
    titre: 'Affichages du débit de boissons (protection des mineurs, ivresse)',
    categorie: 'licence_iv', frequence: 'permanent',
    description:
      "Affichage de la licence, de la répression de l'ivresse publique et de la protection des mineurs (interdiction de vente d'alcool aux moins de 18 ans).",
    notes: "Voir l'onglet « Affichages » : la ligne « Licence IV » y est encore marquée absente.",
  },

  // ── Sécurité ERP — le sujet des travaux en cours ─────────────────
  {
    titre: 'Autorisation de travaux ERP + visite de la commission de sécurité',
    categorie: 'securite_erp', frequence: 'à chaque aménagement',
    description:
      "Tout aménagement d'un établissement recevant du public est soumis à autorisation, et la réouverture au public après travaux est subordonnée à l'avis de la commission de sécurité.",
    notes: B +
      "Nous sommes EN TRAVAUX. Ouvrir au public sans avis favorable expose à une fermeture administrative — c'est-à-dire à perdre l'ouverture qu'on prépare. " +
      "La commission ne se réunit pas à la demande : le délai de convocation est à vérifier auprès du SDIS/mairie DÈS MAINTENANT, c'est peut-être le vrai chemin critique du planning.",
  },
  {
    titre: 'Registre de sécurité ERP',
    categorie: 'securite_erp', frequence: 'permanent',
    description:
      "Registre tenu à disposition de la commission de sécurité : contrôles, travaux, formations du personnel, consignes.",
    notes: "L'application l'imprime : /admin/legal → Registre de sécurité. Encore faut-il que les contrôles y soient saisis.",
  },
  {
    titre: 'Accessibilité PMR — attestation',
    categorie: 'securite_erp', frequence: 'permanent',
    description:
      "Un ERP doit être accessible aux personnes handicapées, ou disposer d'une dérogation motivée. Les travaux en cours sont l'occasion de le régler.",
    notes: B + "À vérifier avec le maître d'œuvre pendant que les travaux sont ouverts : après, chaque correction coûte dix fois plus.",
  },
  {
    titre: 'Vérification annuelle des extincteurs et RIA',
    categorie: 'securite_erp', frequence: 'annuel',
    description: "Vérification par un organisme compétent, consignée au registre de sécurité.",
    notes: "Saisir aussi l'extincteur comme équipement dans /admin/maintenance pour que l'alerte à 1 mois se déclenche.",
  },
  {
    titre: 'Contrôle de l\'installation électrique',
    categorie: 'securite_erp', frequence: 'annuel',
    description: "Vérification périodique des installations électriques par un organisme agréé.",
    notes: '',
  },
  {
    titre: 'Contrôle de l\'installation gaz',
    categorie: 'securite_erp', frequence: 'annuel',
    description: "Vérification de l'installation et des appareils de cuisson au gaz.",
    notes: 'Le four à pizza et les feux de la cuisine entrent dans ce contrôle.',
  },
  {
    titre: 'Ramonage et dégraissage des conduits de hotte',
    categorie: 'securite_erp', frequence: '1 à 2 fois par an',
    description: "Nettoyage des conduits d'extraction. Fréquence fixée par le règlement sanitaire départemental.",
    notes: "Première cause d'incendie en cuisine, et première cause de refus d'indemnisation par l'assureur quand le certificat manque.",
  },

  // ── Hygiène ──────────────────────────────────────────────────────
  {
    titre: "Déclaration d'activité à la DDPP (Cerfa 13984)",
    categorie: 'hygiene', frequence: 'à chaque ouverture',
    description:
      "Déclaration obligatoire de tout établissement manipulant des denrées animales ou d'origine animale, auprès de la direction départementale de la protection des populations.",
    notes: "À vérifier : le Fournil est déjà déclaré ? L'extension au restaurant et à la pizzeria peut nécessiter une mise à jour.",
  },
  {
    titre: 'Formation HACCP — au moins une personne dans l\'établissement',
    categorie: 'hygiene', frequence: 'permanent',
    description:
      "Au moins une personne de l'établissement doit avoir suivi la formation à l'hygiène alimentaire (14 h), ou justifier d'une équivalence par diplôme ou expérience.",
    notes: "À rattacher aux fiches employés dans /admin/rh → Formations, pour que le justificatif soit retrouvable en cas de contrôle.",
  },

  // ── Assurances et immobilier ─────────────────────────────────────
  {
    titre: 'Assurance multirisque professionnelle + RC',
    categorie: 'assurance', frequence: 'annuel',
    description: "Responsabilité civile professionnelle, dommages aux biens, et perte d'exploitation.",
    notes: B + "L'ouverture d'un débit de boissons et l'extension de l'activité DOIVENT être déclarées à l'assureur : une activité non déclarée n'est pas couverte.",
  },
  {
    titre: 'Bail commercial — échéance triennale',
    categorie: 'bail_commercial', frequence: '3 ans',
    description: "Échéance triennale, révision du loyer, et conformité de la destination des lieux aux activités réellement exercées.",
    notes: "⚠️ Vérifier que la destination du bail autorise le DÉBIT DE BOISSONS. Un bail limité à la boulangerie ne le couvre pas.",
  },
  {
    titre: 'Autorisation d\'occupation du domaine public (terrasse)',
    categorie: 'autorisation_terrasse', frequence: 'annuel',
    description: "Permis de stationnement ou permission de voirie délivrée par la mairie, avec redevance.",
    notes: '',
  },
  {
    titre: 'Enseigne — déclaration préalable et TLPE',
    categorie: 'autre', frequence: 'permanent',
    description: "Déclaration préalable pour la pose d'enseigne, et taxe locale sur la publicité extérieure si la commune l'a instituée.",
    notes: '',
  },

  // ── Musique ──────────────────────────────────────────────────────
  {
    titre: 'SACEM et SPRE — diffusion de musique',
    categorie: 'droits_musique', frequence: 'annuel',
    description:
      "Toute diffusion de musique dans un lieu ouvert au public est soumise aux droits d'auteur (SACEM) et à la rémunération équitable (SPRE).",
    notes: "À traiter seulement si le bar diffuse de la musique. Une déclaration spontanée coûte moins cher qu'un redressement.",
  },

  // ── Personnel ────────────────────────────────────────────────────
  {
    titre: 'DUERP — document unique d\'évaluation des risques',
    categorie: 'personnel', frequence: 'annuel',
    description:
      "Obligatoire dès le premier salarié, mis à jour au moins une fois par an et à chaque modification importante des conditions de travail.",
    notes: "L'ouverture du bar et de la pizzeria EST une modification importante : le DUERP doit être repris, pas seulement daté.",
  },
  {
    titre: 'Registre unique du personnel',
    categorie: 'personnel', frequence: 'permanent',
    description: "Registre obligatoire tenu à jour, mentionnant chaque salarié dans l'ordre des embauches.",
    notes: "L'application le produit : /admin/rh → Registre légal.",
  },
  {
    titre: 'Visites médicales d\'embauche (SPST)',
    categorie: 'visite_medicale_employeur', frequence: 'à chaque embauche',
    description: "Visite d'information et de prévention, à organiser dans les délais suivant l'embauche.",
    notes: "À prévoir pour les recrutements de septembre, avant qu'ils ne soient oubliés dans le rush de l'ouverture.",
  },
]

// ── Exécution ──────────────────────────────────────────────────────
const existantes = await sb('obligations_legales?select=id,titre')
const parTitre = new Map(existantes.map(o => [o.titre.trim().toLowerCase(), o]))

const aCreer = REGISTRE.filter(o => !parTitre.has(o.titre.trim().toLowerCase()))
const deja   = REGISTRE.length - aCreer.length

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──\n`)
const bloquants = REGISTRE.filter(o => o.notes.startsWith('⛔'))
console.log(`  registre proposé : ${REGISTRE.length} obligations`)
console.log(`  dont BLOQUANTES avant ouverture : ${bloquants.length}`)
bloquants.forEach(o => console.log(`    ⛔ ${o.titre}`))
console.log(`\n  déjà présentes   : ${deja}`)
console.log(`  à créer          : ${aCreer.length}`)
console.log(`\n  Aucune date d'échéance n'est posée : une échéance inventée dans un`)
console.log(`  registre légal rassure à tort. C'est le gérant qui les pose.`)

if (!ECRIRE) { console.log('\n  (rien écrit — relancer avec --ecrire)\n'); process.exit(0) }
if (aCreer.length === 0) { console.log('\n  Rien à faire.\n'); process.exit(0) }

await sb('obligations_legales', {
  method: 'POST',
  body: JSON.stringify(aCreer.map(o => ({
    titre: o.titre, categorie: o.categorie, description: o.description,
    frequence: o.frequence, statut: 'a_faire',
    date_echeance: null, notes: o.notes || null,
    // Une bloquante sans date doit quand même alerter : l'absence de date
    // y est le symptôme (« pas commencé »), pas une excuse (0147).
    bloquant: o.notes.startsWith('⛔'),
  }))),
})
console.log(`\n  → ${aCreer.length} obligation(s) créée(s), toutes à « à faire », sans date.\n`)
