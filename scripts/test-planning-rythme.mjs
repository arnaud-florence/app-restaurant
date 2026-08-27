// Semaine type — génération d'un planning récurrent.
//
// Le point fragile est l'arithmétique des jours : `getUTCDay()` renvoie 0 pour
// dimanche, et un décalage d'un rang planifierait toute l'équipe le mauvais
// jour sans que rien ne le signale — un planning faux ressemble à un planning.
//
// ⚠️ Ce script RECOPIE la règle de `genererRythme` (src/app/admin/rh/actions.ts,
// la source est en TS). Modifier les deux ensemble.
//
//   node scripts/test-planning-rythme.mjs
//
// Aucune écriture en base : logique pure.

let ok = 0, ko = 0
const t = (nom, cond, detail = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nom}`) }
  else { ko++; console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ''}`) }
}

// ── Règle recopiée ──────────────────────────────────────────────────
function datesDuRythme(depuis, jours, semaines) {
  const voulues = []
  // Midi UTC volontairement : à minuit, un changement d'heure d'été peut
  // faire basculer la date d'un jour.
  const depart = new Date(`${depuis}T12:00:00Z`)
  for (let j = 0; j < semaines * 7; j++) {
    const d = new Date(depart.getTime() + j * 86_400_000)
    const jourSemaine = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
    if (jours.includes(jourSemaine)) voulues.push(d.toISOString().slice(0, 10))
  }
  return voulues
}
const jourFr = (iso) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long' })
    .format(new Date(`${iso}T12:00:00Z`))

console.log('\n── Semaine type ──\n')

// 2026-09-07 est un LUNDI.
const lundi = '2026-09-07'
t('le point de départ est bien un lundi', jourFr(lundi) === 'lundi', jourFr(lundi))

// ── Lundi → vendredi sur 4 semaines ─────────────────────────────────
const semaine = datesDuRythme(lundi, [1, 2, 3, 4, 5], 4)
t('5 jours × 4 semaines = 20 journées', semaine.length === 20, `${semaine.length}`)
t('aucun samedi ni dimanche',
  semaine.every(d => !['samedi', 'dimanche'].includes(jourFr(d))),
  semaine.filter(d => ['samedi', 'dimanche'].includes(jourFr(d))).join(', '))
t('la première journée est le lundi de départ', semaine[0] === lundi, semaine[0])
t('la dernière est le vendredi de la 4ᵉ semaine',
  semaine.at(-1) === '2026-10-02' && jourFr(semaine.at(-1)) === 'vendredi',
  `${semaine.at(-1)} (${jourFr(semaine.at(-1))})`)

// ── Le dimanche, cas limite de getUTCDay() ──────────────────────────
const dimanches = datesDuRythme(lundi, [7], 3)
t('le dimanche est bien le jour 7', dimanches.length === 3, `${dimanches.length}`)
t('et ce sont vraiment des dimanches',
  dimanches.every(d => jourFr(d) === 'dimanche'),
  dimanches.map(d => `${d}=${jourFr(d)}`).join(' '))

// ── Le samedi seul ──────────────────────────────────────────────────
const samedis = datesDuRythme(lundi, [6], 2)
t('samedi seul → 2 journées', samedis.length === 2)
t('ce sont des samedis', samedis.every(d => jourFr(d) === 'samedi'),
  samedis.map(d => `${d}=${jourFr(d)}`).join(' '))

// ── Départ un dimanche : la fenêtre ne doit pas glisser ─────────────
const depuisDimanche = datesDuRythme('2026-09-13', [7], 2)
t('un départ un dimanche compte ce dimanche-là',
  depuisDimanche[0] === '2026-09-13', depuisDimanche[0])

// ── Passage à l'heure d'hiver (25 octobre 2026) ─────────────────────
// C'est le piège classique : à minuit, +24 h peut retomber sur la même date.
const autour = datesDuRythme('2026-10-19', [1, 2, 3, 4, 5, 6, 7], 2)
t('14 journées consécutives malgré le changement d\'heure',
  autour.length === 14 && new Set(autour).size === 14,
  `${autour.length} dates, ${new Set(autour).size} distinctes`)
t('le 25 octobre est présent une seule fois',
  autour.filter(d => d === '2026-10-25').length === 1)

// ── Journées déjà planifiées : jamais touchées ──────────────────────
const deja = new Set(['2026-09-08', '2026-09-09'])
const aCreer = semaine.filter(d => !deja.has(d))
t('les journées déjà planifiées sont exclues', aCreer.length === 18, `${aCreer.length}`)
t('et elles ne réapparaissent pas',
  !aCreer.some(d => deja.has(d)))

// ── Semaine complète ────────────────────────────────────────────────
t('7 jours sur 1 semaine = 7 journées', datesDuRythme(lundi, [1,2,3,4,5,6,7], 1).length === 7)
t('aucun jour coché = aucune journée', datesDuRythme(lundi, [], 4).length === 0)

console.log(`\n── ${ok} ✓   ${ko} ✗ ──\n`)
process.exit(ko === 0 ? 0 : 1)
