import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); let v = l.slice(i+1).trim().replace(/\r$/,''); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); return [l.slice(0,i).trim(), v] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const since = new Date(Date.now() - 14*3600000).toISOString()
const { data: pmts } = await sb.from('paiements_caisse')
  .select('id, methode, montant, session_caisse_id, encaisse_at')
  .gte('encaisse_at', since).order('encaisse_at', { ascending: false })
console.log(`Paiements (14h) : ${(pmts??[]).length}`)
let sansSession = 0, total = 0, totalSansSession = 0
for (const p of pmts ?? []) { total += Number(p.montant); if (!p.session_caisse_id) { sansSession++; totalSansSession += Number(p.montant) } }
for (const p of (pmts??[]).slice(0,12)) console.log(` ${p.encaisse_at?.slice(11,19)} | ${p.methode} | ${p.montant}€ | session=${p.session_caisse_id ? p.session_caisse_id.slice(0,8) : '❌ AUCUNE'}`)
console.log(`\nTotal encaissé : ${total.toFixed(2)}€`)
console.log(`Paiements SANS session : ${sansSession}/${(pmts??[]).length} = ${totalSansSession.toFixed(2)}€`)
// Sessions du jour
const { data: sess } = await sb.from('sessions_caisse').select('id, date_session, fermee_at, fond_initial').gte('date_session', new Date(Date.now()-86400000).toISOString().slice(0,10)).order('date_session',{ascending:false})
console.log(`\nSessions caisse récentes : ${(sess??[]).length}`)
for (const s of sess ?? []) console.log(` ${s.date_session} | ${s.fermee_at ? 'FERMÉE' : 'OUVERTE'} | fond ${s.fond_initial}€ | ${s.id.slice(0,8)}`)
