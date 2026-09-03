// Fiche technique imprimable — la feuille qu'on affiche au poste.
//
// Une fiche qui vit dans un écran d'admin n'est pas respectée : personne ne
// déverrouille une tablette entre deux services pour vérifier un grammage.
// Elle est respectée quand elle est punaisée au-dessus du plan de travail.
//
// D'où une page A4, en noir sur blanc, lisible à un mètre — et qui porte les
// DEUX moitiés du sujet : ce qu'on met dedans (les quantités), et ce que ça
// coûte (la marge). Séparer les deux, c'est laisser le cuisinier ignorer
// l'effet de sa main, et le gérant ignorer pourquoi sa marge glisse.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  synthese, fmtPrix, fmtPrix4, fmtPct,
  STATUT_FOOD_COST_STYLE, type LigneCout,
} from '@/lib/foodCost'
import { ALLERGENE_INFO, type Allergene } from '@/lib/allergenes'
import PrintButton from '@/app/print/fiche-poste/[guideId]/PrintButton'

export const dynamic = 'force-dynamic'

export default async function FicheTechniquePage({
  params,
}: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: r } = await supabase
    .from('recettes')
    .select(`id, nom, categorie, tag_destination, description, procedure,
             temps_preparation, nb_portions, poids_portion_g,
             prix_vente_ht, tva, cout_achat_ht, photo_url, image_url,
             allergenes_complementaires, allergenes_valides_le,
             recette_ingredients ( quantite, unite,
               ingredient:ingredients ( nom, unite, prix_achat_ht ) )`)
    .eq('id', params.id)
    .maybeSingle()
  if (!r) notFound()

  type LigneBrute = {
    quantite: number | string | null; unite: string | null
    ingredient: { nom: string; unite: string | null; prix_achat_ht: number | string | null } | null
  }
  const brutes = (r.recette_ingredients ?? []) as unknown as LigneBrute[]
  const lignes: LigneCout[] = brutes.map(l => ({
    quantite: Number(l.quantite ?? 0),
    prix_achat_ht: Number(l.ingredient?.prix_achat_ht ?? 0),
  }))

  const nbPortions = Number(r.nb_portions ?? 1) || 1
  const prixHt = Number(r.prix_vente_ht ?? 0)
  const coutAchat = Number(r.cout_achat_ht ?? 0)
  const s = synthese(lignes, nbPortions, prixHt, coutAchat)
  const sty = STATUT_FOOD_COST_STYLE[s.statut]
  const ttc = prixHt * (1 + Number(r.tva ?? 0) / 100)

  const allergenes = (r.allergenes_complementaires ?? []) as Allergene[]
  const verifie = Boolean(r.allergenes_valides_le)

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <div className="print:hidden p-4 border-b border-zinc-200 flex items-center gap-3">
        <PrintButton />
        <span className="text-sm text-zinc-500">Fiche technique — à afficher au poste</span>
      </div>

      <article className="mx-auto max-w-[190mm] p-6 print:p-0">
        {/* ── En-tête ─────────────────────────────────────────── */}
        <header className="border-b-2 border-zinc-900 pb-3 mb-4">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-3xl font-black tracking-tight">{r.nom}</h1>
            <span className="text-sm font-bold uppercase tracking-wider text-zinc-500">
              {r.categorie}{r.tag_destination ? ` · ${r.tag_destination}` : ''}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
            <span><strong>{nbPortions}</strong> portion{nbPortions > 1 ? 's' : ''}</span>
            {r.poids_portion_g != null && (
              <span><strong>{Number(r.poids_portion_g)} g</strong> par portion</span>
            )}
            {r.temps_preparation != null && (
              <span><strong>{Number(r.temps_preparation)} min</strong> de préparation</span>
            )}
          </div>
        </header>

        {/* ── Composition ─────────────────────────────────────── */}
        <section className="mb-5">
          <h2 className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500 mb-2">
            Composition — quantités à respecter
          </h2>
          {brutes.length === 0 ? (
            <p className="border-2 border-dashed border-zinc-400 p-4 text-sm">
              <strong>Aucune composition saisie.</strong> Cette fiche ne peut ni contrôler
              les portions ni calculer une marge tant que les ingrédients et leurs
              grammages n&apos;y figurent pas.
              {coutAchat > 0 && (
                <> Le coût affiché ci-dessous est celui du <strong>produit acheté fini</strong> —
                c&apos;est correct pour un produit revendu tel quel, pas pour un plat assemblé.</>
              )}
            </p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-y border-zinc-300 text-[11px] uppercase tracking-wider text-zinc-500">
                  <th className="text-left py-1.5 font-bold">Ingrédient</th>
                  <th className="text-right py-1.5 font-bold w-24">Quantité</th>
                  <th className="text-right py-1.5 font-bold w-28">Prix unitaire</th>
                  <th className="text-right py-1.5 font-bold w-24">Coût</th>
                </tr>
              </thead>
              <tbody>
                {brutes.map((l, i) => {
                  const q = Number(l.quantite ?? 0)
                  const pu = Number(l.ingredient?.prix_achat_ht ?? 0)
                  return (
                    <tr key={i} className="border-b border-zinc-200">
                      <td className="py-1.5 font-medium">{l.ingredient?.nom ?? '— ingrédient supprimé —'}</td>
                      <td className="py-1.5 text-right tabular-nums font-bold">
                        {q.toLocaleString('fr-FR')} {l.unite ?? l.ingredient?.unite ?? ''}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-zinc-500">
                        {pu > 0 ? fmtPrix4(pu) : '—'}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {pu > 0 ? fmtPrix(q * pu) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* ── Économie ────────────────────────────────────────── */}
        <section className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-px bg-zinc-300 border border-zinc-300">
          {[
            ['Coût par portion', s.cout_portion > 0 ? fmtPrix(s.cout_portion) : '— inconnu'],
            ['Prix de vente', `${fmtPrix(ttc)} TTC`],
            ['Marge', s.cout_portion > 0 ? fmtPrix(s.marge_eur) : '—'],
            ['Food cost', s.statut === 'inconnu' ? '—' : fmtPct(s.food_cost_pct)],
          ].map(([k, v]) => (
            <div key={k} className="bg-white px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">{k}</p>
              <p className="text-lg font-black tabular-nums leading-tight">{v}</p>
            </div>
          ))}
        </section>

        <p className={`mb-5 px-3 py-2 border text-sm font-bold ${sty.bg} ${sty.text} ${sty.border}`}>
          {sty.label}
          {s.statut === 'inconnu' && (
            <span className="font-normal">
              {' '}— aucun coût connu pour ce produit. Un food cost à 0 % ne veut pas
              dire « excellent », il veut dire « on ne sait pas ».
            </span>
          )}
          {s.statut === 'rouge' && (
            <span className="font-normal"> — au-delà de 32 %, la marge ne tient pas. Revoir le grammage ou le prix.</span>
          )}
        </p>

        {/* ── Méthode ─────────────────────────────────────────── */}
        <section className="mb-5">
          <h2 className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500 mb-2">
            Méthode
          </h2>
          {r.procedure ? (
            <div className="text-sm leading-relaxed whitespace-pre-line">{r.procedure}</div>
          ) : (
            <p className="border-2 border-dashed border-zinc-400 p-4 text-sm">
              <strong>Méthode non renseignée.</strong> Sans elle, la fiche dit quoi mettre
              mais pas comment faire — et deux personnes produiront deux plats différents.
            </p>
          )}
        </section>

        {/* ── Allergènes ──────────────────────────────────────── */}
        <section className="mb-5">
          <h2 className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500 mb-2">
            Allergènes
          </h2>
          {!verifie ? (
            <p className="border border-amber-400 bg-amber-50 px-3 py-2 text-sm">
              <strong>Non vérifié.</strong> Personne n&apos;a encore contrôlé l&apos;emballage.
              Ne pas annoncer ce plat comme sans allergène.
            </p>
          ) : allergenes.length === 0 ? (
            <p className="text-sm">Aucun des 14 allergènes réglementaires. Vérifié et signé.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {allergenes.map(a => (
                <span key={a} className="text-sm border border-zinc-400 px-2 py-0.5 font-medium">
                  {ALLERGENE_INFO[a].emoji} {ALLERGENE_INFO[a].label}
                </span>
              ))}
            </div>
          )}
        </section>

        <footer className="border-t border-zinc-300 pt-2 text-[10px] text-zinc-500 flex justify-between">
          <span>CasaTasia — fiche technique</span>
          <span>Éditée le {new Date().toLocaleDateString('fr-FR')}</span>
        </footer>
      </article>
    </div>
  )
}
