// Mail de bienvenue à Ambre — l'invitation à venir sur l'outil.
//
// N'ENVOIE RIEN sans --envoyer. Par défaut il AFFICHE le message, parce qu'un
// mail qui part au nom de la maison à une nouvelle salariée se relit avant,
// pas après.
//
// ⚠️ Aucun mot de passe n'est envoyé, et il n'y en a pas à envoyer : elle
// crée son compte elle-même sur /login et choisit son mot de passe. Personne
// d'autre ne le connaît, ni Arnaud, ni moi.
//
//   node scripts/mail-bienvenue-ambre.mjs              → affiche
//   node scripts/mail-bienvenue-ambre.mjs --envoyer    → envoie pour de vrai

import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const ENVOYER = process.argv.includes('--envoyer')
const DEST  = 'ambrehervet@gmail.com'
const OUTIL = 'https://app-restaurant-livid.vercel.app/login'
const FROM  = env.EMAIL_FROM || 'CASATASIA <onboarding@resend.dev>'
const REPLY = env.EMAIL_GERANT || 'infos.agentsalliance@gmail.com'

const SUJET = 'Bienvenue chez CasaTasia — ton accès à l\'outil'

const TEXTE = `Ambre,

Bienvenue chez CasaTasia. Ton accès à l'outil de gestion est prêt.

CRÉER TON COMPTE
${OUTIL}

Utilise ton adresse ${DEST}, et choisis le mot de passe que tu veux :
personne d'autre ne le connaîtra. Si tu ne peux pas te connecter tout de
suite, regarde tes mails — il y a peut-être un lien de confirmation.

Préviens Arnaud une fois inscrite : une manipulation de sa part active tes
accès.

CE QUI SE PASSE ENSUITE
À ta première connexion, une visite guidée te proposera de t'accompagner
écran par écran — une quinzaine de minutes. Tu peux l'arrêter à tout moment
et la reprendre plus tard, même depuis une autre machine.

Tu trouveras aussi tes manuels dans la rubrique Formation. Cinq guides,
environ une heure trente en tout, à étaler sur tes deux premières semaines.
Commence par « Manageuse 1 » : il explique pourquoi l'outil ne prend pas les
commandes, et sans ça le reste paraît incohérent.

TU NE PEUX RIEN CASSER
La caisse est en mode école : les tickets que tu y passes n'entrent pas dans
le chiffre d'affaires. C'est le moment d'essayer, de te tromper, de
recommencer — cette liberté disparaîtra à l'ouverture. Et dans l'outil, les
quelques écrans délicats sont en lecture seule le temps de la prise en main.

Une seule chose à ne pas faire : ne passe pas de commande de test sur
casatasia.fr. Le site prend de vraies commandes, et l'équipe ne pourrait pas
distinguer un test d'une vraie livraison à préparer.

À très vite,
Arnaud`

const HTML = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;max-width:34rem">
<p>Ambre,</p>
<p>Bienvenue chez CasaTasia. Ton accès à l'outil de gestion est prêt.</p>

<p style="margin:24px 0">
  <a href="${OUTIL}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:13px 22px;border-radius:8px;font-weight:700">Créer mon compte</a>
</p>

<p>Utilise ton adresse <strong>${DEST}</strong>, et choisis le mot de passe que tu
veux&nbsp;: personne d'autre ne le connaîtra. Si tu ne peux pas te connecter tout de
suite, regarde tes mails — il y a peut-être un lien de confirmation.</p>

<p>Préviens Arnaud une fois inscrite&nbsp;: une manipulation de sa part active tes accès.</p>

<h3 style="font-size:15px;margin:26px 0 6px">Ce qui se passe ensuite</h3>
<p>À ta première connexion, une <strong>visite guidée</strong> te proposera de
t'accompagner écran par écran — une quinzaine de minutes. Tu peux l'arrêter à tout
moment et la reprendre plus tard, même depuis une autre machine.</p>
<p>Tu trouveras aussi tes manuels dans la rubrique <strong>Formation</strong>&nbsp;:
cinq guides, environ une heure trente en tout, à étaler sur tes deux premières
semaines. Commence par «&nbsp;Manageuse&nbsp;1&nbsp;» — il explique pourquoi l'outil ne
prend pas les commandes, et sans ça le reste paraît incohérent.</p>

<h3 style="font-size:15px;margin:26px 0 6px">Tu ne peux rien casser</h3>
<p>La caisse est en <strong>mode école</strong>&nbsp;: les tickets que tu y passes
n'entrent pas dans le chiffre d'affaires. C'est le moment d'essayer, de te tromper, de
recommencer — cette liberté disparaîtra à l'ouverture. Et dans l'outil, les quelques
écrans délicats sont en lecture seule le temps de la prise en main.</p>
<p>Une seule chose à ne pas faire&nbsp;: <strong>ne passe pas de commande de test sur
casatasia.fr</strong>. Le site prend de vraies commandes, et l'équipe ne pourrait pas
distinguer un test d'une vraie livraison à préparer.</p>

<p style="margin-top:26px">À très vite,<br>Arnaud</p>
</div>`

if (!ENVOYER) {
  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('║ AUCUN MAIL N\'A ÉTÉ ENVOYÉ — relecture                    ║')
  console.log('╚══════════════════════════════════════════════════════════╝\n')
  console.log('  De     : ' + FROM)
  console.log('  À      : ' + DEST)
  console.log('  Répond : ' + REPLY)
  console.log('  Sujet  : ' + SUJET)
  console.log('\n' + '─'.repeat(60) + '\n')
  console.log(TEXTE)
  console.log('\n' + '─'.repeat(60))
  if (!env.EMAIL_FROM) {
    console.log('\n  ⚠️ EMAIL_FROM est VIDE dans .env.local — le mail partirait de')
    console.log('     onboarding@resend.dev, ce qui ressemble à du spam et sera')
    console.log('     probablement filtré. À renseigner avant d\'envoyer.')
  }
  console.log('\n  Pour envoyer : node scripts/mail-bienvenue-ambre.mjs --envoyer\n')
  process.exit(0)
}

if (!env.RESEND_API_KEY) { console.error('\n  ✗ RESEND_API_KEY absente de .env.local.\n'); process.exit(1) }

const r = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ from: FROM, to: [DEST], subject: SUJET, html: HTML, text: TEXTE, reply_to: REPLY }),
})
const j = await r.json().catch(() => ({}))
if (!r.ok) { console.error(`\n  ✗ Envoi refusé (HTTP ${r.status}) :`, JSON.stringify(j), '\n'); process.exit(1) }
console.log(`\n  ✓ Mail envoyé à ${DEST} — id ${j.id ?? '?'}\n`)
