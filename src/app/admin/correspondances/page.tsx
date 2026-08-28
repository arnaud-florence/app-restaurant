// Les lignes de facture que rien n'a reconnu.
//
// 127 sur 134 au 28/08/2026. Chacune est un prix d'achat perdu : sans
// rattachement, ni le stock théorique, ni la démarque, ni la commande
// conseillée, ni la marge du produit ne savent qu'elle existe.

import { createClient } from '@/lib/supabase/server'
import { fmtPrix } from '@/lib/foodCost'
import CorrespondancesClient from './CorrespondancesClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Correspondances d’achat' }

/** Comparaison tolérante aux accents, à la casse et à la ponctuation. */
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const MOTS_VIDES = new Set(['de','du','la','le','les','a','au','aux','et','en','sur','cm','g','kg','cl','ml','c','pce','col','x'])
const jetons = (s: string) => norm(s).split(' ').filter(m => m.length > 2 && !MOTS_VIDES.has(m))

export default async function CorrespondancesPage() {
  const sb = await createClient()

  const [{ data: lignes }, { data: recs }, { data: ings }] = await Promise.all([
    sb.from('facture_lignes')
      .select('id, description, reference, quantite, unite, prix_unitaire_ht, total_ht, facture_id')
      .is('ingredient_id', null).is('recette_id', null).eq('ignoree', false)
      .order('description'),
    // ⚠️ Les composants « Formule — … » sont exclus : ils ne s'achètent pas.
    // Sans ça ils sortaient EN TÊTE des suggestions pour les lignes croissant
    // et pain au chocolat — leur nom contient les deux mots — et un
    // rattachement sur eux aurait écrit un prix d'achat sur un produit qui
    // n'existe pas dans le monde réel.
    sb.from('recettes').select('id, nom, nom_caisse, libelle_achat, categorie, reference_fournisseur')
      .eq('actif', true).not('nom', 'like', 'Formule — %').order('nom'),
    sb.from('ingredients').select('id, nom, unite, reference_fournisseur')
      .eq('actif', true).eq('stocke', true).order('nom'),
  ])

  const cibles = [
    ...(recs ?? []).map(r => ({
      cle: `rec:${r.id}`, label: r.nom as string, sous: (r.categorie as string) ?? 'produit',
      dejaRef: Boolean((r.reference_fournisseur as string | null)?.trim()),
      jetons: [...jetons(r.nom as string), ...jetons((r.libelle_achat as string) ?? ''), ...jetons((r.nom_caisse as string) ?? '')],
    })),
    ...(ings ?? []).map(i => ({
      cle: `ing:${i.id}`, label: i.nom as string, sous: `matière · ${(i.unite as string) ?? ''}`.trim(),
      dejaRef: Boolean((i.reference_fournisseur as string | null)?.trim()),
      jetons: jetons(i.nom as string),
    })),
  ]

  // Une suggestion par recouvrement de mots. Volontairement modeste : trois
  // propositions au plus, et jamais de présélection. Une suggestion trop sûre
  // d'elle se fait valider en bloc, et un faux rattachement écrit un faux prix
  // — pire que pas de prix du tout.
  const avecSuggestions = (lignes ?? []).map(l => {
    const j = jetons(l.description as string)
    const notes = cibles.map(c => {
      const uniques = [...new Set(c.jetons)]
      const communs = uniques.filter(x => j.includes(x)).length
      // Le nombre de mots communs ne suffit pas à départager : « Pain au
      // chocolat » et « Cappuccino ou chocolat chaud » en partagent autant
      // avec une ligne « PAIN AU CHOCOLAT PREPOUSSE ». La COUVERTURE tranche —
      // une cible dont tous les mots sont retrouvés vaut mieux qu'une cible
      // qui n'en partage qu'une partie.
      const couverture = uniques.length ? communs / uniques.length : 0
      return { cle: c.cle, label: c.label, sous: c.sous, score: communs, couverture }
    }).filter(x => x.score > 0)
      .sort((a, b) => (b.score - a.score) || (b.couverture - a.couverture))
      .slice(0, 3)
    return { ...l, suggestions: notes }
  })

  const avecPiste = avecSuggestions.filter(l => l.suggestions.length > 0).length
  const valeur = (lignes ?? []).reduce((s, l) => s + Number(l.total_ht ?? 0), 0)

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-black text-zinc-900">Correspondances d’achat</h1>
      <p className="mt-2 text-sm text-zinc-600 max-w-2xl">
        Ces lignes de facture ne sont rattachées à rien. Chacune est un prix d’achat
        perdu&nbsp;: sans elle, le stock théorique, la démarque, la commande conseillée
        et la marge du produit ignorent qu’elle existe.
      </p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {[['À rattacher', String(lignes?.length ?? 0)],
          ['Avec une piste', String(avecPiste)],
          ['Valeur concernée', fmtPrix(valeur)]].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-white ring-1 ring-zinc-200 p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">{k}</p>
            <p className="text-2xl font-black tabular-nums mt-1 text-zinc-900">{v}</p>
          </div>
        ))}
      </div>

      {(lignes?.length ?? 0) === 0 ? (
        <p className="mt-8 rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 p-5 text-emerald-900">
          Aucune ligne en attente. Tout ce qui a été facturé est rattaché.
        </p>
      ) : (
        <CorrespondancesClient lignes={avecSuggestions} cibles={cibles.map(({ jetons: _j, ...c }) => c)} />
      )}
    </main>
  )
}
