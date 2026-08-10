// Démo « Le coup de main d'Arnaud » : crée (ou nettoie) une commande cuisine
// datée de 25 min avec une allergie notée → déclenche les nudges retard + allergène.
//   node scripts/demo-coup-de-main.mjs create
//   node scripts/demo-coup-de-main.mjs cleanup
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      const k = l.slice(0, i).trim()
      let v = l.slice(i + 1).trim().replace(/\r$/, '')
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      return [k, v]
    }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const action = process.argv[2] || 'create'

if (action === 'create') {
  const { data: rec } = await sb.from('recettes').select('id, nom').eq('actif', true).eq('tag_destination', 'CUISINE').limit(1).maybeSingle()
  const numero = 'DEMO-' + Date.now()
  const createdAt = new Date(Date.now() - 25 * 60 * 1000).toISOString()
  const { data: cmd, error: e1 } = await sb.from('commandes').insert({
    numero, source: 'TABLE', numero_table: 'T-DEMO', statut: 'en_preparation',
    created_at: createdAt, updated_at: createdAt, notes: 'DEMO coup de main',
  }).select('id').single()
  if (e1) { console.error('commande:', e1.message); process.exit(1) }
  const { error: e2 } = await sb.from('commande_articles').insert({
    commande_id: cmd.id, recette_id: rec?.id ?? null, quantite: 1, tag_destination: 'CUISINE',
    statut: 'en_preparation', commentaire: 'DEMO — client allergique', allergenes_a_eviter: ['gluten', 'lait'],
  })
  if (e2) { console.error('article:', e2.message); process.exit(1) }
  console.log('CREATED', cmd.id, '· plat:', rec?.nom ?? '(aucun)', '· créée il y a 25 min · allergènes gluten+lait')
} else if (action === 'cleanup') {
  const { data: cmds } = await sb.from('commandes').select('id').like('numero', 'DEMO-%')
  for (const c of cmds ?? []) {
    await sb.from('commande_articles').delete().eq('commande_id', c.id)
    await sb.from('commandes').delete().eq('id', c.id)
  }
  console.log('CLEANED', (cmds ?? []).length, 'commande(s) démo')
}
