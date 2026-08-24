// Commande fournisseur conseillée — Fournil, achat-revente.
//
// Croise les ventes des 14 derniers jours, la casse (invendus du soir) et
// les conditionnements lus sur les factures scannées (« C=96 ») pour
// proposer les quantités de la prochaine commande Gineys, produit par
// produit. La suggestion se copie en une liste prête à envoyer.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { extraireConditionnement, nomsCorrespondent, suggererCommande } from '@/lib/commande-fournisseur'
import CommandeFournilClient, { type LigneSuggestion } from './CommandeFournilClient'

export const metadata = { title: 'Commande conseillée — Fournil' }
export const dynamic = 'force-dynamic'

const JOURS_OBSERVES = 14

export default async function CommandeFournilPage({
  searchParams,
}: { searchParams: { jours?: string } }) {
  const joursACouvrir = [2, 3, 7].includes(Number(searchParams.jours)) ? Number(searchParams.jours) : 3
  const sb = await createClient()
  const debut = new Date(Date.now() - JOURS_OBSERVES * 86_400_000)

  const [prodRes, cmdRes, invRes, lignesRes] = await Promise.all([
    // Le périmètre de la commande Gineys : le frais. Boissons industrielles
    // et cafés en dosettes se commandent ailleurs (Brake / grossiste
    // boissons) et n'ont rien à faire dans cette liste.
    sb.from('recettes')
      .select('id, nom, nom_caisse, categorie, cout_achat_ht, libelle_achat, unites_par_achat, nom_matiere')
      .eq('tag_destination', 'FOURNIL').eq('actif', true)
      .not('categorie', 'in', '("Boisson fraîche","Boisson chaude","Formule","À classer")')
      .order('categorie').order('nom'),
    sb.from('commandes').select('id')
      .eq('statut', 'encaisse').gte('created_at', debut.toISOString()),
    sb.from('invendus').select('recette_id, quantite')
      .gte('date_invendu', debut.toISOString().slice(0, 10)),
    sb.from('facture_lignes').select('description').order('created_at', { ascending: false }),
  ])

  const produits = prodRes.data ?? []

  // ── Ventes 14 j par produit ─────────────────────────────────────────
  const ids = (cmdRes.data ?? []).map(c => String(c.id))
  const ventes = new Map<string, number>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data: arts } = await sb.from('commande_articles')
      .select('recette_id, quantite')
      .in('commande_id', ids.slice(i, i + 200)).neq('statut', 'annule')
    for (const a of arts ?? []) {
      if (!a.recette_id) continue
      ventes.set(a.recette_id as string,
        (ventes.get(a.recette_id as string) ?? 0) + Number(a.quantite ?? 0))
    }
  }

  // ── Casse 14 j par produit ──────────────────────────────────────────
  const casse = new Map<string, number>()
  for (const l of invRes.data ?? []) {
    casse.set(l.recette_id as string,
      (casse.get(l.recette_id as string) ?? 0) + Number(l.quantite ?? 0))
  }

  // ── Conditionnement : la ligne de facture la plus récente qui matche ──
  const descriptions = (lignesRes.data ?? []).map(l => String(l.description))
  function conditionnementDe(nom: string, nomCaisse: string | null): number | null {
    for (const d of descriptions) {
      if (nomsCorrespondent(d, nom) || (nomCaisse && nomsCorrespondent(d, nomCaisse))) {
        const c = extraireConditionnement(d)
        if (c != null) return c
      }
    }
    return null
  }

  // ── On commande des MATIÈRES, pas des produits vendus ───────────────
  // Gineys livre des pâtons, pas « Pizza ronde Reine » et « Panuozzi »
  // séparément. Les produits partageant un `libelle_achat` (0131) fusionnent
  // en une ligne, et leurs ventes S'ADDITIONNENT : trois pizzas et un panuozzi
  // vendus, ce sont quatre pâtons à racheter.
  type Groupe = {
    id: string; nom: string; categorie: string; nomCaisse: string | null
    ventes: number; casse: number; parAchat: number
  }
  const groupes = new Map<string, Groupe>()
  for (const p of produits) {
    const cle = ((p.nom_matiere as string) ?? '').trim()
      || ((p.libelle_achat as string) ?? '').trim()
      || (p.nom as string)
    const parAchat = Number(p.unites_par_achat ?? 1) || 1
    const g = groupes.get(cle) ?? {
      id: p.id as string, nom: cle, categorie: (p.categorie as string) ?? 'Autre',
      nomCaisse: ((p.libelle_achat as string) ?? '').trim() || (p.nom_caisse as string) || null,
      ventes: 0, casse: 0, parAchat,
    }
    // Ventes en unités VENDUES → converties en unités ACHETÉES (10 parts de
    // flan vendues = 1 flan à racheter).
    g.ventes += (ventes.get(p.id as string) ?? 0) / parAchat
    g.casse += (casse.get(p.id as string) ?? 0) / parAchat
    groupes.set(cle, g)
  }

  const lignes: LigneSuggestion[] = Array.from(groupes.values()).map(p => {
    const v = p.ventes
    const j = p.casse
    const cond = conditionnementDe(p.nom, p.nomCaisse)
    const sug = suggererCommande({
      ventesPeriode: v, cassePeriode: j,
      joursObserves: JOURS_OBSERVES, joursACouvrir,
      conditionnement: cond,
    })
    return {
      nom: p.nom,
      categorie: p.categorie,
      ventesJour: Math.round(v / JOURS_OBSERVES * 10) / 10,
      casseJour: Math.round(j / JOURS_OBSERVES * 10) / 10,
      conditionnement: cond,
      pieces: sug.pieces,
      colis: sug.colis,
      piecesLivrees: sug.piecesLivrees,
      surCommande: sug.surCommande,
    }
  }).filter(l => l.ventesJour > 0 || l.casseJour > 0)

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-zinc-900">🧮 Commande conseillée</h1>
            <p className="text-sm text-zinc-500 max-w-xl">
              Ventes des {JOURS_OBSERVES} derniers jours + casse du soir + colisage lu sur vos
              factures. La suggestion couvre <b>{joursACouvrir} jour{joursACouvrir > 1 ? 's' : ''}</b> avec
              10 % de sécurité — sauf quand la casse dit déjà « trop ».
            </p>
          </div>
          <Link href="/admin/ventes" className="text-sm text-zinc-500 hover:text-zinc-800 shrink-0">← Ventes</Link>
        </header>

        <div className="flex gap-2">
          {[2, 3, 7].map(j => (
            <Link key={j} href={`/admin/commande-fournil?jours=${j}`}
              className={`min-h-[40px] px-4 inline-flex items-center rounded-md text-sm font-bold border ${
                j === joursACouvrir ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white border-zinc-300 hover:border-zinc-500'
              }`}>
              Couvrir {j} j
            </Link>
          ))}
        </div>

        <CommandeFournilClient lignes={lignes} joursACouvrir={joursACouvrir} />
      </div>
    </div>
  )
}
