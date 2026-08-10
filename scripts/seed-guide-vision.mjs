// Crée LE guide d'accueil « Pourquoi cet outil » — poste 'tous', ordre 0,
// sans quiz (validé dès toutes les étapes vues). C'est le tout premier guide
// que chaque employé voit. Idempotent (delete par titre puis re-insert).
//
// Usage : node scripts/seed-guide-vision.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const TITRE = '🎯 Bienvenue — Pourquoi cet outil (à lire en premier)'

const ETAPES = [
  {
    titre: 'Bienvenue dans l\'équipe 👋',
    contenu: `Avant d'apprendre **ton poste**, prends 8 minutes pour comprendre **pourquoi** on utilise cet outil. C'est la chose la plus importante de ta formation.

> Cet outil n'est pas « un logiciel de plus ». C'est le **système nerveux du restaurant** : tout ce que chacun y fait se connecte au reste.

Quand tu auras compris ça, tout le reste de ta formation aura du sens. 💡`,
  },
  {
    titre: 'La symphonie : chaque geste compte 🎼',
    contenu: `Imagine un orchestre : si un seul musicien joue faux, tout le morceau sonne mal. Ici c'est pareil — **chaque action en alimente plein d'autres, automatiquement** :

- 🧾 Tu prends une commande → elle s'affiche **en cuisine et au bar** en temps réel.
- 🍽️ Tu sers un plat → le **stock se déduit tout seul** → le **food cost** se calcule → ça remonte dans les **finances** et le **pilotage** du gérant.
- 💶 Tu encaisses → le **chiffre d'affaires**, le **rapport de caisse** et la **TVA** se mettent à jour.
- 🌡️ Tu relèves une température → la **conformité hygiène (HACCP)** est tracée → zéro risque en cas de contrôle.
- ⏱️ Tu pointes → tes **heures**, ta **paie** et le **planning** sont justes.

> **La règle d'or :** ce que tu saisis bien → des chiffres justes → de bonnes décisions. Ce que tu saisis mal → tout le reste devient faux. *« Bien rentré = bien piloté. »*`,
  },
  {
    titre: 'Qui fait quoi : l\'organigramme 🗺️',
    contenu: `Tout le monde travaille avec le même outil, chacun sur sa partie — et **tout remonte au gérant** qui pilote l'établissement.

**🎩 Gérant** — voit tout (CA, stock, RH, finances, hygiène) et pilote.
**▲ alimenté en temps réel par le travail de chacun ▲**

- **🍽️ Salle** — serveur · barman · caisse
- **👨‍🍳 Cuisine** — cuisinier · pizzaiolo · snacking · plonge
- **🛒 Comptoir & Borne** — snack · encaissement
- **🛵 Livraison** · **🛎️ Réception**

Chaque poste a **son écran** et **ses manuels**. Toi, tu es **polyvalent** : tu touches à plusieurs postes — d'où l'importance de comprendre l'ensemble. 💪`,
  },
  {
    titre: 'Ce que ton travail alimente 🔗',
    contenu: `Concrètement, voici à quoi sert ce que tu fais dans l'outil :

| Ton action | Ce que ça alimente |
|---|---|
| 🧾 Prendre une commande | Écrans cuisine/bar · suivi du service · CA |
| 🍽️ Servir / donner au client | Déduction de **stock** · **food cost** · marges |
| 💶 Encaisser | **Chiffre d'affaires** · rapport Z · **TVA** · compta |
| 🌡️ Relevé température / checklist | **Hygiène HACCP** · conformité · sécurité |
| 📦 Réception livraison | Stock · prix d'achat · alertes rupture |
| ⏱️ Pointer arrivée/départ | **Heures** · paie · masse salariale · planning |
| 🎓 Te former (ces guides) | Ton autonomie · les certifications du jour J |

> Rien n'est « pour rien ». Chaque clic a une suite. C'est ça qui rend le restaurant **fluide et bien piloté**.`,
  },
  {
    titre: 'Pourquoi bien l\'utiliser (et bien se former) ⭐',
    contenu: `Bien utilisé, l'outil **te facilite la vie** et fait tourner la maison :

- ✅ Moins de gaspillage, des marges justes → l'établissement est sain.
- ✅ Des **pourboires** et un **planning** justes (basés sur des données réelles).
- ✅ Un service **fluide**, moins de stress, moins d'erreurs.
- ✅ Le gérant voit en direct ce qui va et ce qui coince → il aide au bon moment.

Mal utilisé (saisie bâclée, oublis) → chiffres faux → mauvaises décisions → ça retombe sur toute l'équipe.

> C'est pour ça que **bien se former maintenant** = travailler sereinement plus tard. Prends le temps, ça en vaut la peine. 🙌`,
  },
  {
    titre: 'Comment tu vas l\'utiliser au quotidien ✅',
    contenu: `Quelques réflexes simples :

1. 🔢 Sur une tablette partagée : **« Prendre le poste »** avec ton code → tes actions sont à ton nom.
2. ⏱️ Saisis **en temps réel** (pas « plus tard ») et **honnêtement**.
3. 📚 Termine **tes guides de formation** et leurs quiz.
4. ❓ Un doute ? Utilise le bouton **« Poser une question »** dans les guides, ou demande au gérant.

---

**Tu as compris le pourquoi ? Parfait.** Tu peux maintenant attaquer les manuels de tes postes. Bonne formation, et bienvenue à bord ! 🚀`,
  },
]

async function main() {
  console.log(`→ Guide « ${TITRE} »`)
  await sb.from('guides_formation').delete().eq('titre', TITRE)

  const { data: guide, error: eG } = await sb.from('guides_formation').insert({
    titre: TITRE,
    description: 'Comprendre pourquoi on utilise cet outil, la synergie entre les postes et ce que ton travail alimente. À lire en tout premier.',
    poste: 'tous',
    ordre: 0,
    actif: true,
    seuil_reussite_pct: 0,   // pas de quiz → validé dès que toutes les étapes sont vues
    duree_minutes: 8,
  }).select('id').single()
  if (eG) { console.error('❌ guide :', eG.message); process.exit(1) }
  console.log('✓ guide', guide.id)

  const etapes = ETAPES.map((s, i) => ({ guide_id: guide.id, ordre: i + 1, titre: s.titre, contenu: s.contenu }))
  const { error: eE } = await sb.from('etapes_formation').insert(etapes)
  if (eE) { console.error('❌ étapes :', eE.message); process.exit(1) }
  console.log(`✓ ${etapes.length} étapes — guide d'accueil prêt (poste 'tous', ordre 0).`)
}
main().catch(e => { console.error('❌', e.message); process.exit(1) })
