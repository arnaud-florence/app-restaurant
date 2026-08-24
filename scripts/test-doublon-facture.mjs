// Test — garde-fou anti-doublon de facture fournisseur.
//
// ⚠️ REJOUE la règle de createFacture (la source est en TS) : modifier les
// deux ensemble, comme test-commande-statut.mjs.
// Vérifie qu'un même numéro chez un même fournisseur est bloqué, mais que le
// même numéro chez DEUX fournisseurs différents passe (ils numérotent chacun
// leur série), et qu'une facture et un avoir de même numéro coexistent.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

let ok = 0, ko = 0
const check = (nom, cond) => { cond ? ok++ : ko++; console.log(`${cond ? '✓' : '✗'} ${nom}`) }

const { data: fours } = await sb.from('fournisseurs').select('id, nom').order('nom').limit(2)
if ((fours?.length ?? 0) < 2) { console.error('✗ il faut 2 fournisseurs'); process.exit(1) }
const [A, B] = fours
const NUM = 'TEST-DBL-' + Date.now()

// La règle telle qu'implémentée dans createFacture
async function existeDeja(fournisseurId, numero, typeDoc) {
  const { data } = await sb.from('factures_fournisseurs')
    .select('id').eq('fournisseur_id', fournisseurId).eq('numero', numero)
    .eq('type_document', typeDoc).maybeSingle()
  return !!data
}

const base = { numero: NUM, date_emission: '2026-08-24', montant_ht: 100, montant_ttc: 110, statut: 'a_payer' }

check('1ʳᵉ saisie : aucun doublon détecté', !(await existeDeja(A.id, NUM, 'facture')))
await sb.from('factures_fournisseurs').insert({ ...base, fournisseur_id: A.id, type_document: 'facture' })

check(`2ᵉ saisie du même n° chez ${A.nom} : BLOQUÉE`, await existeDeja(A.id, NUM, 'facture'))
check(`même n° chez ${B.nom} : autorisé (séries distinctes)`, !(await existeDeja(B.id, NUM, 'facture')))
check('un AVOIR de même n° chez le même fournisseur : autorisé',
  !(await existeDeja(A.id, NUM, 'avoir')))

// Le forçage écrit malgré tout
await sb.from('factures_fournisseurs').insert({ ...base, fournisseur_id: A.id, type_document: 'facture' })
const { count } = await sb.from('factures_fournisseurs')
  .select('*', { count: 'exact', head: true }).eq('numero', NUM)
check('forçage : la 2ᵉ facture s\'écrit quand le gérant le demande', count === 2)

await sb.from('factures_fournisseurs').delete().eq('numero', NUM)
const { count: fin } = await sb.from('factures_fournisseurs')
  .select('*', { count: 'exact', head: true }).eq('numero', NUM)
check('cleanup : 0 facture de test', fin === 0)

console.log(`\n${'─'.repeat(40)}\nBilan : ${ok} ✓ · ${ko} ✗`)
process.exit(ko > 0 ? 1 : 0)
