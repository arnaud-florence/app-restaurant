// ─── Récepteur de webhooks Zelty ─────────────────────────────────────────
//
//   POST /api/integrations/zelty/webhook
//
// Le sondage toutes les heures a deux défauts : les écrans de préparation
// voient les commandes avec du retard, et une heure creuse coûte un appel
// pour rien. Un webhook supprime les deux.
//
// Événements traités (docs.zelty.fr, liste lue le 28/08/2026) :
//   · order.ended                → le ticket entre dans le CA immédiatement
//   · till.close                 → la clôture de caisse, pièce du rapprochement
//   · dish.availability_update   → une rupture décidée en caisse coupe la
//                                  vente en ligne dans la minute
// Tout le reste est journalisé sans agir : on saura quoi brancher ensuite.
//
// ⚠️ SIGNATURE OBLIGATOIRE. Cet endpoint écrit des VENTES : accepter un corps
// non authentifié permettrait à n'importe qui de gonfler le chiffre
// d'affaires. En l'absence de signature valide, on répond 401.
//
// ⚠️ Le nom de l'en-tête de signature n'est pas encore connu (la page de la
// documentation ne se charge pas). On teste donc tous les en-têtes
// vraisemblables, en hexadécimal comme en base64, et on ENREGISTRE les noms
// d'en-têtes reçus — jamais leurs valeurs — pour identifier le bon au premier
// appel réel. `ZELTY_WEBHOOK_HEADER` permet de le figer ensuite.

import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { journaliser } from '@/lib/integrations/journal'
import { mapperCommandes } from '@/lib/integrations/zelty/mapper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** En-têtes plausibles, du plus au moins probable. */
const ENTETES = [
  'x-zelty-signature', 'zelty-signature', 'x-signature', 'x-hub-signature-256',
  'x-webhook-signature', 'signature',
]

function signatureValide(brut: string, secret: string, req: Request): boolean {
  const attendu = crypto.createHmac('sha256', secret).update(brut, 'utf8')
  const hex = attendu.digest('hex')
  const b64 = crypto.createHmac('sha256', secret).update(brut, 'utf8').digest('base64')

  const fige = process.env.ZELTY_WEBHOOK_HEADER
  const noms = fige ? [fige.toLowerCase()] : ENTETES

  for (const nom of noms) {
    const recu = req.headers.get(nom)
    if (!recu) continue
    // `sha256=…` est une convention répandue (GitHub, Shopify…).
    const v = recu.replace(/^sha256=/i, '').trim()
    // Comparaison à temps constant : une comparaison naïve laisse fuiter la
    // signature octet par octet.
    for (const ref of [hex, b64]) {
      if (v.length === ref.length &&
          crypto.timingSafeEqual(Buffer.from(v), Buffer.from(ref))) return true
    }
  }
  return false
}

export async function POST(req: Request) {
  const secret = process.env.ZELTY_WEBHOOK_SECRET
  // Le corps BRUT est indispensable : re-sérialiser un JSON change les espaces
  // et invalide la signature.
  const brut = await req.text()

  if (!secret) {
    await journaliser({
      sens: 'entrant', systeme: 'zelty', type: 'webhook', statut: 'echec',
      erreur: 'ZELTY_WEBHOOK_SECRET absent — webhook refusé', payload: { taille: brut.length },
    })
    return new NextResponse('Not configured', { status: 503 })
  }

  if (!signatureValide(brut, secret, req)) {
    // On garde les NOMS d'en-têtes, jamais leurs valeurs : c'est ce qui permet
    // d'identifier l'en-tête de signature sans jamais l'écrire en base.
    await journaliser({
      sens: 'entrant', systeme: 'zelty', type: 'webhook', statut: 'echec',
      erreur: 'signature invalide ou en-tête inconnu',
      payload: { entetes_recus: [...req.headers.keys()], taille: brut.length },
    })
    return new NextResponse('Invalid signature', { status: 401 })
  }

  let corps: Record<string, unknown>
  try { corps = JSON.parse(brut) } catch {
    return NextResponse.json({ ok: false, error: 'JSON invalide' }, { status: 400 })
  }

  const evenement = String(corps.event ?? corps.type ?? corps.name ?? 'inconnu')
  const donnees = (corps.data ?? corps.payload ?? corps) as Record<string, unknown>

  try {
    if (evenement === 'order.ended') {
      // On repasse par le connecteur normalisé plutôt que d'écrire ici :
      // c'est lui qui rapproche, crée les fiches manquantes et tient le
      // miroir. Le dupliquer serait le laisser diverger.
      const commande = (donnees.order ?? donnees) as unknown
      const centimes = process.env.ZELTY_MONTANTS_EN_CENTIMES !== 'false'
      const m = mapperCommandes([commande], {
        montantsEnCentimes: centimes,
        etablissementSlug: process.env.ZELTY_ETABLISSEMENT_SLUG ?? 'fournil',
      })
      if (m.encaissements.length > 0) {
        const rep = await fetch(new URL('/api/integrations/caisse/encaissements', req.url), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.CRON_SECRET}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ source_caisse: 'zelty', encaissements: m.encaissements }),
        })
        const bilan = await rep.json().catch(() => null)
        await journaliser({
          sens: 'entrant', systeme: 'zelty', type: 'webhook',
          reference: evenement, payload: corps, resultat: bilan,
          statut: rep.ok ? 'succes' : 'echec',
          erreur: rep.ok ? null : `connecteur HTTP ${rep.status}`,
        })
      } else {
        await journaliser({
          sens: 'entrant', systeme: 'zelty', type: 'webhook',
          reference: evenement, payload: corps, resultat: { rejets: m.rejets },
          statut: 'echec', erreur: m.rejets.map(r => r.raison).join(' | ') || 'rien à traduire',
        })
      }
    } else {
      // Les autres événements sont tracés avec leur charge brute : le jour où
      // on branche `till.close` ou `dish.availability_update`, on aura des
      // exemples réels sous la main au lieu d'une hypothèse.
      await journaliser({
        sens: 'entrant', systeme: 'zelty', type: 'webhook',
        reference: evenement, payload: corps, statut: 'succes',
      })
    }
  } catch (e) {
    await journaliser({
      sens: 'entrant', systeme: 'zelty', type: 'webhook',
      reference: evenement, payload: corps, statut: 'echec',
      erreur: e instanceof Error ? e.message : String(e),
    })
    // On répond 200 quand même : un webhook en erreur chez nous ne doit pas
    // faire réessayer Zelty indéfiniment. Le journal garde le brut, on rejoue.
    return NextResponse.json({ ok: false, recu: true })
  }

  return NextResponse.json({ ok: true, evenement })
}
