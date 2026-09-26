#!/usr/bin/env node
// Génère les visuels des plats de la brasserie — version « vendeuse ».
//
// Les premiers visuels (septembre 2026) étaient sombres, ternes et mous : une
// entrecôte brune sur une assiette beige dans une pièce noire, des frites
// pâles. Techniquement une photo de plat ; commercialement, rien.
//
// Ce qui rend une photo culinaire vendeuse, et qui manquait :
//   · une LUMIÈRE de fenêtre, latérale, pas un éclairage de cave ;
//   · du CONTRASTE de couleur — vert d'herbes, rouge de tomate, doré de
//     croûte — sur une assiette claire ;
//   · de la TEXTURE lisible : le gras qui brille, la vapeur, le croustillant ;
//   · une assiette CADRÉE serré, à 45°, le plat net et le fond fondu.
//
// ⚠️ CE SONT DES ILLUSTRATIONS, PAS DES PHOTOS DE VOS ASSIETTES. Elles
// tiennent jusqu'à ce que le restaurant photographie ses plats — et elles se
// remplacent alors sans toucher aux URL en base. Ne jamais les présenter
// comme des photos du lieu.
//
// ⚠️ Écrit dans un dossier de travail, JAMAIS directement dans
// public/produits : les 18 premières avaient donné 4 hors-sujet (un camembert
// rendu en pain, un carpaccio sans bœuf). On regarde, puis on installe.
//
// Usage : node scripts/photos-brasserie-generer.mjs [dossier] [--seul <slug>]

import fs from 'node:fs'
import path from 'node:path'

const DEST = process.argv[2]?.startsWith('--') ? '/tmp/brasserie-v2' : (process.argv[2] ?? '/tmp/brasserie-v2')
const i = process.argv.indexOf('--seul')
const SEUL = i > 0 ? process.argv[i + 1] : null
// ⚠️ La graine dérive du slug, donc relancer rend LA MÊME image — c'est voulu
// (on peut refaire le lot sans tout changer). Pour retenter un plat raté, il
// faut donc décaler la graine explicitement.
const j = process.argv.indexOf('--variante')
const VARIANTE = j > 0 ? Number(process.argv[j + 1]) || 0 : 0

// ⚠️ La description doit dire ce qu'il y a DANS l'assiette, pas le nom du
// plat : « Planche CasaTasia » ne veut rien dire pour un modèle d'image, et
// c'est comme ça qu'on obtient un camembert rendu en pain.
// ⚠️ NE JAMAIS ÉCRIRE « window » NI « natural window light ».
// Première version : le modèle DESSINE la fenêtre, recule pour la cadrer, et
// rend un plat lointain à contre-jour, délavé. Sur quatre essais, un seul
// tenait. Ces modèles illustrent ce qu'on nomme — nommer la source de lumière,
// c'est la faire apparaître.
//
// ⚠️ Et il faut EXIGER le gros plan. Sans « fills the frame », l'assiette
// occupe un quart de l'image et le reste est une table vide : sur une vignette
// de carte, on ne voit plus le plat.
const AMBIANCE =
  'close-up food photography, the dish FILLS THE FRAME, shot from a 45 degree angle, '
  + 'soft diffused daylight, bright and clean, gentle highlights on the food, '
  + 'shallow depth of field with the food tack sharp and the background softly blurred, '
  + 'appetising, glistening, freshly served, steam, vivid natural colours, '
  + 'crisp texture detail, professional restaurant menu photography, '
  + 'no window in frame, no people, no text, no watermark, no cutlery in focus'

const PLATS = {
  'burger-casatasia':
    'a tall gourmet beef burger in a glossy brioche bun, melted cheese dripping down the patty, '
    + 'crisp lettuce and tomato, golden thick-cut fries in a small metal basket beside it',
  // ⚠️ Rendu plat et pâle : exiger la HAUTEUR et le fromage qui coule.
  'burger-chevre-miel':
    'a tall stacked gourmet burger, thick juicy beef patty, a grilled goat cheese medallion '
    + 'melting over it with golden honey dripping down the side, fresh rocket leaves, '
    + 'a glossy toasted brioche bun, held together by a wooden skewer, '
    + 'a pile of golden thick-cut fries beside it',
  'burger-montagnard':
    'a mountain-style burger with melted raclette cheese poured over the beef patty, '
    + 'smoked bacon, caramelised onions, brioche bun, golden fries alongside',
  'entrecote-grillee':
    'a thick grilled ribeye steak sliced to show a juicy pink medium-rare centre, '
    + 'charred crust with real grill marks, herb butter melting on top, '
    + 'golden crisp fries and a green salad on a white plate',
  'tartare-de-boeuf':
    'a hand-cut raw beef tartare shaped in a neat round, bright egg yolk in the centre, '
    + 'capers, chopped shallots and parsley around it, golden fries on a white plate',
  // ⚠️ Rendu en salade de tomates au premier essai : il faut insister sur la
  // VIANDE CRUE EN TRANCHES FINES, sinon le modèle compose une salade.
  'carpaccio-casatasia':
    'paper-thin slices of raw red beef carpaccio laid flat and overlapping, completely covering '
    + 'a large white plate, deep red raw meat clearly visible, topped with shaved parmesan curls, '
    + 'a few rocket leaves in the centre, olive oil drizzle, cracked black pepper',
  // ⚠️ Rendu en médaillon pâle : préciser la forme de SAUCISSE et le grillé.
  'andouillette-grillee':
    'a thick French andouillette sausage, clearly sausage-shaped, deeply griddled with dark '
    + 'char marks and a crackling browned skin, glossy creamy mustard sauce spooned over it, '
    + 'a generous pile of golden crisp fries beside it on a white plate',
  'tartiflette-gratinee':
    'a bubbling golden gratin of sliced potatoes, lardons and melted reblochon cheese '
    + 'in a rustic ceramic dish, browned crust, steam rising, green salad beside',
  'camembert-roti':
    'a whole camembert cheese roasted in its wooden box, the top cut open and the melted '
    + 'cheese flowing, rosemary sprig, toasted bread slices and charcuterie around it',
  'friture-de-la-mer':
    'a generous pile of golden crispy fried small fish and calamari rings, lemon wedges, '
    + 'tartare sauce in a small pot, served on a white plate',
  'gnocchis-casatasia':
    'pan-seared potato gnocchi in a creamy tomato sauce, browned edges, '
    + 'fresh basil leaves and grated parmesan, served in a shallow bowl, steam rising',
  'gnocchis-quatre-fromages':
    'baked potato gnocchi in a bubbling four-cheese cream sauce, golden gratinated top, '
    + 'in a small cast iron dish, steam rising',
  'salade-burrata':
    'a fresh salad with a whole creamy burrata torn open in the centre, ripe cherry tomatoes, '
    + 'rocket, basil leaves, olive oil and balsamic drizzle on a large white plate',
  'salade-chevre-chaud':
    'a green salad with warm grilled goat cheese toasts, honey drizzle, walnuts, '
    + 'cherry tomatoes, on a large white plate',
  'planche-de-charcuteries':
    'a wooden board of French cured meats, rolled saucisson slices, coppa, jambon cru, '
    + 'cornichons and olives, sliced baguette',
  'planche-de-fromages':
    'a wooden board of French cheeses, a wedge of blue, a round goat cheese, a slice of comté, '
    + 'grapes, walnuts and sliced baguette',
  'planche-casatasia':
    'a large sharing wooden board with both cured meats and cheeses, cornichons, olives, '
    + 'grapes, walnuts and sliced baguette',
  // ⚠️ « a bistro table set with… » faisait reculer le cadre et rendait une
  // scène lointaine avec un plat brun indistinct. On décrit UNE ASSIETTE.
  'formule-casatasia':
    'a generous bistro plate with a thick grilled steak sliced to show a pink centre, '
    + 'a large pile of golden crisp fries and a small green salad, herb butter melting, '
    + 'a glass of red wine slightly out of focus behind the plate',
  'menu-enfant':
    'a child-friendly plate with a small beef burger, golden fries and a fruit compote, '
    + 'bright cheerful colours on a light plate',
  // ⚠️ Premier essai sans tasse : le modèle avait rendu trois mignardises et
  // rien d'autre. Le CAFÉ est le sujet du plat, il doit ouvrir la description
  // et être décrit comme un objet, pas cité en passant.
  'cafe-gourmand':
    'a white espresso cup full of black coffee with golden crema, on a saucer, '
    + 'placed in the foreground at the left of a slate board, and next to it three tiny '
    + 'desserts in a row: a small chocolate fondant, a mini crème brûlée and a pink macaron, '
    + 'the espresso cup clearly visible and prominent',
}

fs.mkdirSync(DEST, { recursive: true })
const cles = SEUL ? [SEUL] : Object.keys(PLATS)
console.log(`\n${cles.length} visuel(s) → ${DEST}\n`)

let ok = 0, ko = 0
for (const [n, slug] of cles.entries()) {
  const quoi = PLATS[slug]
  if (!quoi) { console.log(`  ? ${slug} inconnu`); ko++; continue }
  // La graine est DÉRIVÉE du slug : relancer le script rend la même image,
  // et on peut en changer une seule sans toucher aux autres.
  const graine = ([...slug].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) + VARIANTE * 7919) % 100000
  const url = 'https://image.pollinations.ai/prompt/'
    + encodeURIComponent(`${quoi}. ${AMBIANCE}`)
    + `?width=1280&height=960&model=flux&nologo=true&seed=${graine}`
  process.stdout.write(`  ${String(n + 1).padStart(2)}/${cles.length} ${slug.padEnd(26)}`)
  // ⚠️ Le service renvoie des 500 passagers, surtout après une rafale. Sans
  // réessai, une image manque et on ne s'en aperçoit qu'à la planche-contact.
  // Pause entre chaque appel : on n'est pas pressé, et se faire limiter coûte
  // plus cher que d'attendre.
  let fait = false
  for (let essai = 1; essai <= 4 && !fait; essai++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(180000) })
      if (!r.ok) {
        if (essai === 4) { console.log(`✗ HTTP ${r.status}`); ko++ }
        else await new Promise(res => setTimeout(res, essai * 8000))
        continue
      }
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length < 20000) {
        if (essai === 4) { console.log(`✗ ${buf.length} o — réponse suspecte`); ko++ }
        else await new Promise(res => setTimeout(res, essai * 8000))
        continue
      }
      fs.writeFileSync(path.join(DEST, `${slug}.jpg`), buf)
      console.log(`✓ ${Math.round(buf.length / 1024)} Ko${essai > 1 ? ` (essai ${essai})` : ''}`)
      ok++; fait = true
    } catch (e) {
      if (essai === 4) { console.log(`✗ ${e instanceof Error ? e.message.slice(0, 40) : e}`); ko++ }
      else await new Promise(res => setTimeout(res, essai * 8000))
    }
  }
  await new Promise(res => setTimeout(res, 3000))
}
console.log(`\n${ok} générée(s), ${ko} en échec.`)
console.log(`⚠️ À REGARDER UNE PAR UNE avant d'installer : node scripts/photos-brasserie.mjs ${DEST}\n`)
