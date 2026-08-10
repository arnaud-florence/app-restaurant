// Démo — Co-gérant 1.2 : Arnaud propose des plats (Claude) avec food cost.
// Lecture seule. Lit le contexte + le catalogue d'ingrédients, appelle Claude,
// calcule le food cost, et AFFICHE les plats proposés. La première "pensée"
// d'Arnaud. (Le code de prod est dans src/lib/co-gerant/proposer-plats.ts)

import { readFileSync } from 'node:fs'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = k => { const m = env.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : null }
const SB = get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const AK = get('ANTHROPIC_API_KEY')
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const rest = async p => { const r = await fetch(`${SB}/rest/v1/${p}`, { headers: H }); return r.json() }

if (!AK) { console.log('✗ ANTHROPIC_API_KEY absente de .env.local — impossible de faire penser Arnaud en local.'); process.exit(1) }

const NB = Number(process.env.NB || 6)
const round2 = n => Math.round(n * 100) / 100

;(async () => {
  // Contexte + catalogue
  const params = await rest('parametres?cle=in.(cg_concept,cg_style_cuisine,cg_gamme_prix,cg_specialites,etablissement_nom)&select=cle,valeur')
  const P = Object.fromEntries((params || []).map(r => [r.cle, r.valeur]))
  const ings = await rest('ingredients?actif=eq.true&select=id,nom,unite,prix_achat_ht&order=nom')
  const byNom = new Map((ings || []).map(i => [i.nom.toLowerCase().trim(), { ...i, prix_achat_ht: Number(i.prix_achat_ht) }]))

  const restoNom = P.etablissement_nom || 'CASATASIA'
  const concept = P.cg_concept || 'pizzeria-trattoria italienne conviviale'
  const style = P.cg_style_cuisine || 'cuisine italienne maison'
  const gamme = P.cg_gamme_prix || 'plat 12-18 €'
  const listeIng = (ings || []).length
    ? ings.map(i => `- ${i.nom} (${i.unite}, ${Number(i.prix_achat_ht)}€/${i.unite})`).join('\n')
    : '(aucun ingrédient en base)'

  console.log(`— Arnaud réfléchit pour « ${restoNom} » (${concept}) —`)
  console.log(`  Catalogue : ${(ings || []).length} ingrédients · objectif : ${NB} plats\n`)

  const prompt = `Tu es un chef-consultant en restauration. Tu aides "${restoNom}" (${concept}, ${style}, gamme ${gamme}) à bâtir sa carte selon les bonnes pratiques (carte équilibrée, food cost cible < 30%).

Ingrédients DISPONIBLES (utilise EXCLUSIVEMENT ceux-ci, nom EXACT) :
${listeIng}

Propose ${NB} plats cohérents. Quantités réalistes par portion. Si la liste est vide/pauvre, propose des classiques avec ingrédients de base.

Réponds UNIQUEMENT en JSON strict :
{"plats":[{"nom":"...","categorie":"Entrée|Plat|Pizza|Dessert","tag_destination":"CUISINE|PIZZA|BAR","description":"courte","nb_portions":1,"prix_vente_ht":12.5,"ingredients":[{"nom":"<nom EXACT>","quantite":0.15,"unite":"kg"}]}]}`

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': AK, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 3500, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!r.ok) { console.log('✗ Claude:', r.status, (await r.text()).slice(0, 300)); process.exit(1) }
  const j = await r.json()
  const txt = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim()
  let parsed; try { parsed = JSON.parse(txt) } catch { const m = txt.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : { plats: [] } }

  let okPlats = 0
  for (const p of parsed.plats || []) {
    let total = 0; const lignes = []
    for (const ing of p.ingredients || []) {
      const m = byNom.get(String(ing.nom || '').toLowerCase().trim())
      if (!m) { lignes.push(`   · ${ing.nom} ${ing.quantite}${ing.unite} (hors catalogue)`); continue }
      const q = Number(ing.quantite) || 0
      total += q * m.prix_achat_ht
      lignes.push(`   · ${m.nom} ${q}${ing.unite || m.unite} → ${round2(q * m.prix_achat_ht)}€`)
    }
    const nbPort = Number(p.nb_portions) || 1
    const cp = total / nbPort
    const prix = Number(p.prix_vente_ht) || 0
    const fc = prix > 0 ? round2((cp / prix) * 100) : 0
    const feu = fc < 28 ? '🟢' : fc <= 32 ? '🟠' : '🔴'
    okPlats++
    console.log(`🍽  ${p.nom}  [${p.categorie} · ${p.tag_destination}]`)
    console.log(`    ${p.description || ''}`)
    console.log(`    Prix ${round2(prix)}€ HT · coût ${round2(cp)}€ · food cost ${fc}% ${feu}`)
    lignes.forEach(l => console.log(l))
    console.log('')
  }

  console.log(`Bilan : ${okPlats} plat(s) proposé(s) par Arnaud, food cost calculé.`)
  process.exit(okPlats > 0 ? 0 : 1)
})().catch(e => { console.log('✗ exception:', e.message); process.exit(1) })
