// Démo bug serveur : crée (ou nettoie) une table avec une commande SERVIE
// (apéro servi → table 'à encaisser') pour tester le choix Ajouter/Encaisser.
//   node scripts/demo-table-servie.mjs create
//   node scripts/demo-table-servie.mjs cleanup
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim().replace(/\r$/, ''); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const action = process.argv[2] || 'create'

if (action === 'create' || action === 'create2') {
  const { data: table } = await sb.from('tables_restaurant').select('numero').eq('statut', 'libre').order('numero').limit(1).maybeSingle()
  const numeroTable = table?.numero ?? 'T01'
  const { data: rec } = await sb.from('recettes').select('id, nom, prix_vente_ht, tva, tag_destination').eq('actif', true).limit(1).maybeSingle()
  const nbRounds = action === 'create2' ? 2 : 1
  let dernierId = null
  for (let i = 0; i < nbRounds; i++) {
    const numero = 'DEMOSRV-' + Date.now() + '-' + i
    const { data: cmd, error: e1 } = await sb.from('commandes').insert({
      numero, source: 'TABLE', numero_table: numeroTable, statut: 'servi',
      montant_total_ht: 5, montant_total_ttc: 5.5, notes: `DEMO tournée ${i + 1}`,
    }).select('id').single()
    if (e1) { console.error('commande:', e1.message); process.exit(1) }
    dernierId = cmd.id
    const { error: e2 } = await sb.from('commande_articles').insert({
      commande_id: cmd.id, recette_id: rec?.id ?? null, quantite: 1,
      prix_unitaire_ht: 5, tag_destination: rec?.tag_destination ?? 'BAR',
      statut: 'servi', commentaire: `DEMO tournée ${i + 1}`,
    })
    if (e2) { console.error('article:', e2.message); process.exit(1) }
  }
  await sb.from('tables_restaurant').update({ statut: 'a_encaisser', commande_active_id: dernierId }).eq('numero', numeroTable)
  console.log('CREATED table', numeroTable, '·', nbRounds, 'tournée(s) servie(s) impayée(s) · plat', rec?.nom ?? '(aucun)')
} else if (action === 'cleanup') {
  const { data: cmds } = await sb.from('commandes').select('id, numero_table').like('numero', 'DEMOSRV-%')
  for (const c of cmds ?? []) {
    if (c.numero_table) await sb.from('tables_restaurant').update({ statut: 'libre', commande_active_id: null }).eq('numero', c.numero_table)
    await sb.from('paiements_caisse').delete().eq('commande_id', c.id)
    await sb.from('commande_articles').delete().eq('commande_id', c.id)
    await sb.from('commandes').delete().eq('id', c.id)
  }
  console.log('CLEANED', (cmds ?? []).length, 'commande(s) démo + paiements + tables réinitialisées')
}
