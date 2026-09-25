// ─── Borne de commande : RETIRÉE le 25/09/2026 ───────────────────────────
//
// La prise de commande et l'encaissement se font sur les caisses
// (cf. src/lib/frontiere-caisse.ts). Le code complet — 1 788 lignes de
// catalogue, panier, paiement et gestion du PIN — est dans l'historique git.
//
// ⚠️ Elle aurait dû partir le 24 août avec /serveur, /caisse et /emporter.
// Elle est passée entre les mailles alors que c'était l'écran de vente le
// plus complet de l'outil : elle créait des `commandes` ET écrivait dans
// `paiements_caisse`.
//
// ⚠️⚠️ Et elle était PUBLIQUE. `/borne` répondait 200 en production, sans la
// moindre authentification — le middleware ne protège que `/admin/*`.
// N'importe qui connaissant l'adresse pouvait créer des commandes et des
// paiements qui entraient dans le chiffre d'affaires. Un CA parallèle sans
// valeur fiscale, c'est-à-dire précisément ce que la frontière du 24 août
// existe pour empêcher.
//
// ⚠️ Le remplacement garde une PAGE, pas un 404 : quelqu'un a pu mettre
// l'adresse en favori, ou une tablette est restée dessus au comptoir. Un 404
// laisse croire à une panne ; une explication dit où aller.

import { notFound } from 'next/navigation'
import EcranRemplace from '@/components/ops/EcranRemplace'
import { infoRemplacement } from '@/lib/frontiere-caisse'

export const metadata = {
  title: 'Sur la caisse — Borne',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

export default function Page() {
  const info = infoRemplacement('/borne')
  if (!info) notFound()
  return <EcranRemplace titre={info.titre} remplacePar={info.remplacePar} />
}
