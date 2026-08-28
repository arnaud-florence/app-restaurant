// ─── Import initial du catalogue : outil → Zelty ─────────────────────────
//
// Zelty arrive vide. Plutôt que de saisir 85 produits à la main — avec les
// fautes de frappe et les prix mal recopiés que ça implique — on pousse la
// carte que nous avons déjà, prix et photos compris.
//
//   GET|POST /api/cron/caisse/zelty/import[?dry=1][&tag=FOURNIL]
//   Authorization: Bearer ${CRON_SECRET}
//
// ⚠️ `?dry=1` PAR DÉFAUT dans l'esprit : cet appel CRÉE des plats dans une
// caisse. On regarde toujours la liste avant. Un import lancé deux fois sans
// garde-fou doublonnerait toute la carte.
//
// Le garde-fou : on n'envoie QUE les produits qui n'ont pas encore de
// correspondance. Après l'appel, les identifiants rendus par Zelty sont
// enregistrés — un second lancement ne repasse donc sur rien.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lireConfig } from '@/lib/integrations/zelty/client'
import { construireImport, type ProduitLocalComplet } from '@/lib/integrations/zelty/import-catalogue'
import { chargerCorrespondances, noterCorrespondance } from '@/lib/integrations/correspondances'
import { journaliser } from '@/lib/integrations/journal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authCron(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return (req.headers.get('authorization') ?? '') === `Bearer ${expected}`
}

async function traiter(req: Request) {
  if (!authCron(req)) return new NextResponse('Unauthorized', { status: 401 })
  const url = new URL(req.url)
  const dry = url.searchParams.get('dry') === '1'
  const tag = url.searchParams.get('tag')

  // Le mode à blanc ne contacte personne : il n'a donc pas besoin de clé.
  // C'est ce qui permet de relire toute la carte AVANT d'avoir un compte.
  const cfg = lireConfig()
  if (!cfg.pret && !dry) {
    return NextResponse.json({ ok: true, configure: false, manquants: cfg.manquants })
  }

  const t0 = Date.now()
  try {
    const sb = await createClient()
    let q = sb.from('recettes')
      .select('id, nom, description, prix_vente_ht, prix_sur_place_ttc, tva, contient_alcool, image_url, actif, tag_destination')
      .eq('actif', true)
      .order('categorie').order('nom')
    if (tag) q = q.eq('tag_destination', tag)
    const { data } = await q
    const produits = (data ?? []) as unknown as ProduitLocalComplet[]

    // Correspondances existantes, dans le sens recette → Zelty.
    const correspondances = await chargerCorrespondances('zelty').catch(() => new Map<string, string>())
    const dejaLies = new Set([...correspondances.values()])

    const { aCreer, ecartes, dejaLies: nbDejaLies } = construireImport(produits, dejaLies)

    const bilan = {
      configure: true,
      produits_lus: produits.length,
      a_creer: aCreer.length,
      deja_lies: nbDejaLies,
      ecartes,
    }

    if (dry) {
      return NextResponse.json({
        ...bilan, ok: true, ecrit: false,
        configure: cfg.pret,
        apercu: aCreer.slice(0, 5),
      })
    }
    if (!cfg.pret) {
      return NextResponse.json({ ok: true, configure: false, manquants: cfg.manquants })
    }
    if (aCreer.length === 0) return NextResponse.json({ ...bilan, ok: true, ecrit: false })

    const r = await fetch(`${cfg.config.baseUrl.replace(/\/+$/, '')}${cfg.config.cheminCatalogue}?lang=fr`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.config.cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(aCreer),
    })
    const rep = await r.json().catch(() => null) as
      { dishes?: Array<{ id?: number; remote_id?: string; name?: string }>; errmsg?: string; errors?: unknown } | null
    if (!r.ok) {
      throw new Error(`HTTP ${r.status} ${rep?.errmsg ?? ''} ${JSON.stringify(rep?.errors ?? {})}`.slice(0, 500))
    }

    // Enregistrer les liens IMMÉDIATEMENT : sans ça, un second lancement
    // recréerait toute la carte en double, et rien ne le signalerait.
    let liens = 0
    const sansRetour: string[] = []
    for (const d of rep?.dishes ?? []) {
      if (d.id != null && d.remote_id) {
        await noterCorrespondance({
          systeme: 'zelty', identifiant_externe: String(d.id),
          recette_id: d.remote_id, libelle_externe: d.name ?? null,
        })
        liens++
      } else if (d.name) sansRetour.push(d.name)
    }

    const resultat = { ...bilan, crees: rep?.dishes?.length ?? 0, liens_enregistres: liens, sans_retour: sansRetour }
    await journaliser({
      sens: 'sortant', systeme: 'zelty', type: 'import_catalogue',
      reference: `${aCreer.length} plat(s)`, payload: aCreer, resultat,
      statut: sansRetour.length === 0 && ecartes.length === 0 ? 'succes' : 'echec',
      erreur: [
        ...ecartes.map(e => `${e.nom} : ${e.raison}`),
        sansRetour.length ? `sans identifiant en retour : ${sansRetour.join(', ')}` : '',
      ].filter(Boolean).join(' | ').slice(0, 2000) || null,
      duree_ms: Date.now() - t0,
    })

    return NextResponse.json({ ...resultat, ok: true, ecrit: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await journaliser({
      sens: 'sortant', systeme: 'zelty', type: 'import_catalogue',
      statut: 'echec', erreur: message, duree_ms: Date.now() - t0,
    })
    return NextResponse.json({ ok: false, configure: true, error: message }, { status: 502 })
  }
}

export const GET = traiter
export const POST = traiter
