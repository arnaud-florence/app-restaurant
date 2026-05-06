import { createClient } from '@/lib/supabase/server'
import TicketClientPrintClient from './TicketClientPrintClient'
import type { TicketData } from './types'

export const metadata = { title: 'Ticket de caisse', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ auto?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const auto = sp.auto === '1'

  const supabase = await createClient()

  const [cmdRes, paiementsRes, paramsRes] = await Promise.all([
    supabase
      .from('commandes')
      .select(`
        id, numero, source, numero_table, statut, notes, created_at,
        montant_total_ht, montant_total_ttc, pourboire_total,
        serveur:employes!serveur_id(prenom, nom),
        commande_articles(id, quantite, prix_unitaire_ht, recette:recettes(nom))
      `)
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('paiements_caisse')
      .select('id, methode, montant, pourboire, reference, encaisse_at')
      .eq('commande_id', id)
      .order('encaisse_at'),
    supabase
      .from('parametres')
      .select('cle, valeur')
      .in('cle', [
        'etablissement_nom',
        'etablissement_adresse',
        'etablissement_telephone',
        'etablissement_email',
        'etablissement_siret',
        'etablissement_tva_intra',
      ]),
  ])

  const cmd = cmdRes.data
  if (!cmd) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-zinc-900 p-8">
        <p className="text-center">Commande introuvable.</p>
      </div>
    )
  }

  const etablissement: Record<string, string> = {}
  for (const p of paramsRes.data ?? []) etablissement[p.cle as string] = (p.valeur as string) ?? ''

  const serv = cmd.serveur as { prenom?: string; nom?: string } | null
  type ArticleRow = {
    id: string
    quantite: number | null
    prix_unitaire_ht: number | null
    recette?: { nom?: string } | null
  }
  const articles = ((cmd.commande_articles ?? []) as ArticleRow[]).map(a => ({
    id: a.id,
    recette_nom: a.recette?.nom ?? '— recette supprimée —',
    quantite: Number(a.quantite ?? 1),
    prix_unitaire_ht: Number(a.prix_unitaire_ht ?? 0),
  }))

  const data: TicketData = {
    commande: {
      id: cmd.id as string,
      numero: cmd.numero as string,
      source: cmd.source as 'ONLINE' | 'TABLE' | 'COMPTOIR',
      numero_table: (cmd.numero_table as string) ?? null,
      statut: cmd.statut as string,
      notes: (cmd.notes as string) ?? null,
      created_at: cmd.created_at as string,
      montant_total_ht: Number(cmd.montant_total_ht ?? 0),
      montant_total_ttc: Number(cmd.montant_total_ttc ?? 0),
      pourboire_total: Number(cmd.pourboire_total ?? 0),
      serveur_nom: serv ? `${serv.prenom ?? ''} ${serv.nom ?? ''}`.trim() : null,
    },
    articles,
    paiements: (paiementsRes.data ?? []).map(p => ({
      id: p.id as string,
      methode: p.methode as string,
      montant: Number(p.montant ?? 0),
      pourboire: Number(p.pourboire ?? 0),
      reference: (p.reference as string) ?? null,
      encaisse_at: p.encaisse_at as string,
    })),
    etablissement,
  }

  return <TicketClientPrintClient data={data} auto={auto} />
}
