// Synchronisation du fichier client, dans les deux sens.
//
//   /api/cron/caisse/zelty/clients[?dry=1]
//
//   1. MIROIR    caisse → outil : les clients du comptoir rejoignent le CRM
//   2. ÉMISSION  outil → caisse : nos clients web deviennent connus en salle
//
// Il y a deux fichiers clients, donc aucun des deux n'est LE fichier client.
//
// ⚠️⚠️ AUCUN CONSENTEMENT MARKETING NE TRAVERSE CE PONT, dans aucun sens.
// C'est la règle la plus stricte du fichier, et elle prime sur l'intérêt
// commercial : un client qui a refusé les emails ici ne doit pas se retrouver
// réabonné parce que sa fiche caisse porte un `true` par défaut. Détail des
// raisons dans `zelty/clients.ts`.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { appelZelty, zeltyConfigure } from '@/lib/integrations/zelty/client'
import { journaliser } from '@/lib/integrations/journal'
import {
  reponseCustomers, normaliser, fusionner, versZelty,
  emailComparable, telephoneComparable,
} from '@/lib/integrations/zelty/clients'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) { return traiter(req) }
export async function GET(req: Request) { return traiter(req) }

async function traiter(req: Request) {
  const attendu = process.env.CRON_SECRET
  if (attendu && req.headers.get('authorization') !== `Bearer ${attendu}`) {
    return NextResponse.json({ error: 'non autorisé' }, { status: 401 })
  }

  const dry = new URL(req.url).searchParams.get('dry') === '1'
  if (!zeltyConfigure()) {
    return NextResponse.json({ configure: false, message: 'Zelty non configuré' })
  }

  const sb = await createClient()
  const avertissements: string[] = []
  const miroir = { lus: 0, crees: 0, rapproches: 0, ignores: 0 }
  const emission = { candidats: 0, envoyes: 0, refuses: 0 }

  // ─── 1. MIROIR : la caisse vers nous ────────────────────────────────────
  const rep = await appelZelty('/customers')
  if (!rep.ok) {
    avertissements.push(`lecture des clients : ${rep.erreur}`)
  } else {
    const parsed = reponseCustomers.safeParse(rep.data)
    if (!parsed.success) {
      avertissements.push(`réponse illisible : ${parsed.error.issues[0].message}`)
    } else {
      // On charge notre fichier une seule fois : rapprocher client par client
      // ferait autant d'allers-retours que de fiches, et le fichier d'un
      // village tient largement en mémoire.
      const { data: nos } = await sb.from('clients')
        .select('id, prenom, nom, email, telephone, date_naissance, notes_internes, caisse_externe_id')

      const parCaisse = new Map<string, typeof nos extends (infer T)[] ? T : never>()
      const parEmail = new Map<string, NonNullable<typeof nos>[number]>()
      const parTel = new Map<string, NonNullable<typeof nos>[number]>()
      for (const c of nos ?? []) {
        if (c.caisse_externe_id) parCaisse.set(String(c.caisse_externe_id), c as never)
        const e = emailComparable(c.email as string | null)
        if (e && !parEmail.has(e)) parEmail.set(e, c)
        const t = telephoneComparable(c.telephone as string | null)
        if (t && !parTel.has(t)) parTel.set(t, c)
      }

      for (const brut of parsed.data.customers) {
        miroir.lus++
        const n = normaliser(brut)
        if (!n.ok) { avertissements.push(n.motif); miroir.ignores++; continue }
        avertissements.push(...n.avertissements)
        const entrant = n.client

        // ⚠️ Un client sans email ni téléphone n'est rapprochable de personne.
        // L'importer remplirait le fichier de fiches muettes et de doublons
        // qu'on ne saurait jamais fusionner.
        if (!entrant.email && !entrant.telephone) { miroir.ignores++; continue }

        // Identifiant d'abord, email ensuite, téléphone en dernier : c'est
        // l'ordre de fiabilité. Un identifiant ne se trompe jamais ; un
        // téléphone peut être celui du conjoint.
        const existant =
          parCaisse.get(entrant.caisse_externe_id) ??
          (entrant.email ? parEmail.get(entrant.email) : undefined) ??
          (entrant.telephone ? parTel.get(entrant.telephone) : undefined)

        if (existant) {
          const patch = fusionner(existant as never, entrant)
          if (Object.keys(patch).length === 0) { miroir.ignores++; continue }
          if (!dry) {
            const { error } = await sb.from('clients').update(patch).eq('id', existant.id)
            if (error) { avertissements.push(`maj ${existant.id} : ${error.message}`); miroir.ignores++; continue }
          }
          miroir.rapproches++
        } else {
          if (!dry) {
            const { error } = await sb.from('clients').insert({
              prenom: entrant.prenom,
              nom: entrant.nom,
              email: entrant.email,
              telephone: entrant.telephone,
              date_naissance: entrant.date_naissance,
              notes_internes: entrant.notes_internes,
              // ⚠️ FALSE, toujours. Zelty met `accept_marketing: true` par
              // défaut sur toute fiche créée par l'API : c'est une valeur par
              // défaut, pas un consentement recueilli. Le client redonnera son
              // accord chez nous s'il le souhaite.
              opt_in_marketing: false,
              caisse_externe_systeme: entrant.caisse_externe_systeme,
              caisse_externe_id: entrant.caisse_externe_id,
              caisse_externe_at: new Date().toISOString(),
            })
            if (error) { avertissements.push(`insert ${entrant.caisse_externe_id} : ${error.message}`); miroir.ignores++; continue }
          }
          miroir.crees++
        }
      }
    }
  }

  // ─── 2. ÉMISSION : nous vers la caisse ──────────────────────────────────
  // Les clients du site que la caisse ne connaît pas : sans eux, l'équipe ne
  // voit pas qu'un habitué du click & collect se présente au comptoir.
  const { data: aEnvoyer } = await sb.from('clients')
    .select('id, prenom, nom, email, telephone')
    .is('caisse_externe_id', null)
    .limit(100)

  for (const c of aEnvoyer ?? []) {
    emission.candidats++
    const corps = versZelty({
      id: c.id as string,
      prenom: (c.prenom as string) ?? null,
      nom: (c.nom as string) ?? null,
      email: (c.email as string) ?? null,
      telephone: (c.telephone as string) ?? null,
    })
    if (!corps.ok) { avertissements.push(`client ${c.id} : ${corps.motif}`); emission.refuses++; continue }
    if (dry) { emission.envoyes++; continue }

    const r = await appelZelty('/customers', { method: 'POST', body: corps.corps })
    if (!r.ok) { avertissements.push(`envoi ${c.id} : ${r.erreur}`); emission.refuses++; continue }

    const cree = (r.data as { customer?: { id?: number } }).customer
    if (!cree?.id) {
      // Sans identifiant en retour, on ne marque rien : le prochain passage
      // réessaiera plutôt que de perdre le lien.
      avertissements.push(`envoi ${c.id} : aucun identifiant rendu`)
      emission.refuses++
      continue
    }
    await sb.from('clients').update({
      caisse_externe_systeme: 'zelty',
      caisse_externe_id: String(cree.id),
      caisse_externe_at: new Date().toISOString(),
    }).eq('id', c.id)
    emission.envoyes++
  }

  const resultat = { dry, miroir, emission, avertissements: avertissements.slice(0, 40) }
  await journaliser({
    sens: 'entrant', systeme: 'zelty', type: 'clients',
    statut: avertissements.length === 0 ? 'succes' : 'echec',
    resultat, erreur: avertissements[0] ?? null,
  })
  return NextResponse.json(resultat)
}
