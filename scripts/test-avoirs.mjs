// Test d'intégration — avoirs fournisseurs (0127).
//
// Vérifie la convention de signe qui garde justes toutes les sommes
// existantes : une facture de 100 € + un avoir de 30 € = dette de 70 €,
// sans qu'aucun consommateur (pilotage, P&L, assistant) n'ait changé.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

let ok = 0, ko = 0
const check = (nom, cond) => { cond ? ok++ : ko++; console.log(`${cond ? '✓' : '✗'} ${nom}`) }

const { data: fours } = await sb.from('fournisseurs').select('id, nom').limit(1)
if (!fours?.length) { console.error('✗ aucun fournisseur'); process.exit(1) }
const fid = fours[0].id
const tag = 'TEST-0127-' + Date.now()

// ─── 1. Facture 100 € puis avoir lié de 30 € (stocké négatif) ────────
const { data: fa, error: e1 } = await sb.from('factures_fournisseurs').insert({
  fournisseur_id: fid, numero: tag + '-F', date_emission: '2026-08-21',
  montant_ht: 94.79, montant_ttc: 100, statut: 'a_payer', type_document: 'facture',
}).select('id, type_document').single()
check('facture créée (type facture par défaut ok)', !e1 && fa?.type_document === 'facture')

const { data: av, error: e2 } = await sb.from('factures_fournisseurs').insert({
  fournisseur_id: fid, numero: tag + '-A', date_emission: '2026-08-21',
  montant_ht: -28.44, montant_ttc: -30, statut: 'a_payer',
  type_document: 'avoir', facture_liee_id: fa.id,
}).select('id, montant_ttc, facture_liee_id').single()
check('avoir créé en négatif, lié à sa facture',
  !e2 && Number(av?.montant_ttc) === -30 && av?.facture_liee_id === fa.id)

// ─── 2. La somme « à payer » (le calcul du pilotage) déduit l'avoir ──
const { data: dus } = await sb.from('factures_fournisseurs')
  .select('montant_ttc').eq('statut', 'a_payer').like('numero', tag + '%')
const dette = (dus ?? []).reduce((s, f) => s + Number(f.montant_ttc), 0)
check(`dette nette : 100 − 30 = 70 € (obtenu ${dette})`, Math.abs(dette - 70) < 0.001)

// ─── 3. La contrainte rejette un type inconnu ────────────────────────
const { error: e3 } = await sb.from('factures_fournisseurs').insert({
  fournisseur_id: fid, numero: tag + '-X', date_emission: '2026-08-21',
  montant_ht: 1, montant_ttc: 1, statut: 'a_payer', type_document: 'remboursement',
})
check('type_document inconnu rejeté par la contrainte', !!e3)

// ─── 4. Supprimer la facture d'origine ne supprime pas l'avoir ───────
await sb.from('factures_fournisseurs').delete().eq('id', fa.id)
const { data: avApres } = await sb.from('factures_fournisseurs')
  .select('id, facture_liee_id').eq('id', av.id).single()
check('avoir survivant, lien remis à null (on delete set null)',
  !!avApres && avApres.facture_liee_id === null)

// ─── Cleanup ─────────────────────────────────────────────────────────
await sb.from('factures_fournisseurs').delete().like('numero', tag + '%')
const { count } = await sb.from('factures_fournisseurs')
  .select('*', { count: 'exact', head: true }).like('numero', tag + '%')
check('cleanup : 0 document de test restant', count === 0)

console.log(`\n${'─'.repeat(40)}\nBilan : ${ok} ✓ · ${ko} ✗`)
process.exit(ko > 0 ? 1 : 0)
