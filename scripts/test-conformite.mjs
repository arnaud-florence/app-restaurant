// Test d'intégration — 0128 : date métier des relevés température,
// suppression de lots, documents de conformité (table + bucket Storage).
// Setup → assertions → cleanup complet (lignes ET fichiers).

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

let ok = 0, ko = 0
const check = (nom, cond) => { cond ? ok++ : ko++; console.log(`${cond ? '✓' : '✗'} ${nom}`) }

// ─── 1. Relevé antidaté : la date métier prime ───────────────────────
const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
const { data: rel, error: e1 } = await sb.from('releves_temperatures').insert({
  equipement: 'TEST-0128 congélateur', type_equipement: 'congelateur',
  temperature: -19, date_releve: hier, moment: 'soir',
}).select('id, date_releve, created_at').single()
check(`relevé saisi aujourd'hui, daté d'hier (${hier})`,
  !e1 && rel?.date_releve === hier && rel?.created_at.slice(0, 10) !== hier)

// Le compteur « du jour » ne doit PAS le compter
const aujourdhui = new Date().toISOString().slice(0, 10)
const { count: cJour } = await sb.from('releves_temperatures')
  .select('id', { count: 'exact', head: true })
  .eq('date_releve', aujourdhui).eq('equipement', 'TEST-0128 congélateur')
check('le relevé antidaté ne compte pas dans « aujourd\'hui »', cJour === 0)

// ─── 2. Suppression de lot (correction d'erreur de saisie) ───────────
const { data: lot } = await sb.from('lots_produits').insert({
  produit_nom: 'TEST-0128 erreur de saisie', lot_numero: 'TEST-0128-' + Date.now(),
  quantite: 1, statut: 'en_stock',
}).select('id').single()

// Correction d'un lot (parcours modifierLot) : les champs se corrigent,
// le statut ne bouge pas par ce chemin.
const { error: eM } = await sb.from('lots_produits')
  .update({ produit_nom: 'TEST-0128 corrigé', quantite: 25, dlc: '2027-01-15' })
  .eq('id', lot.id)
const { data: corr } = await sb.from('lots_produits')
  .select('produit_nom, quantite, statut').eq('id', lot.id).single()
check('lot corrigé (nom, quantité, DLC) sans toucher au statut',
  !eM && corr?.produit_nom === 'TEST-0128 corrigé'
  && Number(corr?.quantite) === 25 && corr?.statut === 'en_stock')

const { error: e2 } = await sb.from('lots_produits').delete().eq('id', lot.id)
const { count: cLot } = await sb.from('lots_produits')
  .select('id', { count: 'exact', head: true }).eq('id', lot.id)
check('lot erroné supprimé définitivement', !e2 && cLot === 0)

// ─── 3. Document de conformité : bucket + table ──────────────────────
const pdfMinimal = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
  'trailer<</Root 1 0 R>>\n%%EOF')
const chemin = `test-0128-${Date.now()}.pdf`
const { error: e3 } = await sb.storage.from('conformite')
  .upload(chemin, pdfMinimal, { contentType: 'application/pdf' })
check('upload PDF dans le bucket conformite', !e3)

const { data: pub } = sb.storage.from('conformite').getPublicUrl(chemin)
const r = await fetch(pub.publicUrl)
check(`fichier accessible publiquement (HTTP ${r.status})`, r.ok)

const { data: doc, error: e4 } = await sb.from('documents_conformite').insert({
  titre: 'TEST-0128 Permis d\'exploitation', categorie: 'permis',
  fichier_url: pub.publicUrl, fichier_nom: 'permis.pdf',
  taille_octets: pdfMinimal.length,
  date_document: '2026-08-01', date_expiration: '2036-08-01',
}).select('id, titre, date_expiration').single()
check('fiche document enregistrée avec expiration', !e4 && !!doc)

// ─── Cleanup ─────────────────────────────────────────────────────────
if (doc) await sb.from('documents_conformite').delete().eq('id', doc.id)
await sb.storage.from('conformite').remove([chemin])
await sb.from('releves_temperatures').delete().eq('id', rel.id)
const { count: cFin } = await sb.from('documents_conformite')
  .select('id', { count: 'exact', head: true }).like('titre', 'TEST-0128%')
const { data: fichiers } = await sb.storage.from('conformite').list('', { search: 'test-0128' })
check('cleanup : 0 ligne et 0 fichier de test restants',
  cFin === 0 && (fichiers ?? []).length === 0)

console.log(`\n${'─'.repeat(40)}\nBilan : ${ok} ✓ · ${ko} ✗`)
process.exit(ko > 0 ? 1 : 0)
