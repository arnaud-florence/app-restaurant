// Card "Alertes stock seuil bas" — affiche les ingrédients dont stock_actuel <= stock_minimum.
// Bouton "Email fournisseur" génère un mailto: pré-rempli avec liste à commander groupée par fournisseur.

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { AlertTriangle, Mail, Package } from 'lucide-react'
import AutoBdcButton from './AutoBdcButton'

export default async function AlertesStockCard() {
  const sb = await createClient()
  const { data } = await sb.from('ingredients')
    .select('id, nom, categorie, unite, stock_actuel, stock_minimum, stock_maximum, prix_achat_ht, fournisseur_principal, fournisseur_secondaire')
    .eq('actif', true)

  type IngRow = {
    id: string; nom: string; categorie: string; unite: string;
    stock_actuel: number; stock_minimum: number; stock_maximum: number;
    prix_achat_ht: number;
    fournisseur_principal: string | null; fournisseur_secondaire: string | null;
  }
  const all = (data ?? []) as IngRow[]
  const alertes = all.filter(i => Number(i.stock_actuel) <= Number(i.stock_minimum))

  if (alertes.length === 0) {
    return (
      <Card className="p-4 bg-emerald-50 border-emerald-200">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-emerald-600" />
          <p className="text-sm text-emerald-900 font-medium">
            ✨ Aucune alerte stock — tous les ingrédients sont au-dessus du seuil minimum.
          </p>
        </div>
      </Card>
    )
  }

  // Groupe par fournisseur principal pour générer 1 email/fournisseur
  const parFournisseur = new Map<string, IngRow[]>()
  for (const i of alertes) {
    const f = i.fournisseur_principal?.trim() || 'Sans fournisseur'
    if (!parFournisseur.has(f)) parFournisseur.set(f, [])
    parFournisseur.get(f)!.push(i)
  }

  return (
    <Card className="p-3 sm:p-5 bg-amber-50 border-amber-300">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          {alertes.length} ingrédient{alertes.length > 1 ? 's' : ''} sous seuil minimum
        </h3>
        <p className="text-xs text-amber-800">À commander pour éviter rupture de stock.</p>
      </div>

      <div className="mb-3">
        <AutoBdcButton />
        <p className="text-[11px] text-amber-900 italic mt-1">
          1 clic = 1 brouillon de bon de commande par fournisseur. Quantité = stock_max − stock_actuel. Édite ensuite dans /admin/fournisseurs avant envoi.
        </p>
      </div>

      <div className="space-y-3">
        {Array.from(parFournisseur.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([fournisseur, lignes]) => {
          const totalEstime = lignes.reduce((s, i) => {
            const qty = Math.max(0, Number(i.stock_maximum) - Number(i.stock_actuel))
            return s + qty * Number(i.prix_achat_ht ?? 0)
          }, 0)
          const subject = `Bon de commande — ${lignes.length} produit${lignes.length > 1 ? 's' : ''}`
          const body = buildEmailBody(fournisseur, lignes)
          const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

          return (
            <div key={fournisseur} className="rounded-md bg-white border border-amber-200 p-3">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div>
                  <p className="font-bold">🚚 {fournisseur}</p>
                  <p className="text-xs text-zinc-500">{lignes.length} produit{lignes.length > 1 ? 's' : ''} · estimation {fmtEur(totalEstime)}</p>
                </div>
                <Link
                  href={mailto}
                  className="inline-flex items-center gap-1.5 text-xs px-3 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium min-h-[40px]"
                >
                  <Mail className="h-3.5 w-3.5" /> Préparer l&apos;email
                </Link>
              </div>

              {/* Mobile : liste cards (table illisible à 375px) */}
              <ul className="md:hidden space-y-1.5 text-xs">
                {lignes.map(i => {
                  const qty = Math.max(0, Number(i.stock_maximum) - Number(i.stock_actuel))
                  const estime = qty * Number(i.prix_achat_ht ?? 0)
                  return (
                    <li key={i.id} className="rounded border border-amber-100 bg-amber-50/40 p-2">
                      <div className="font-medium">{i.nom} <span className="text-zinc-500">({i.categorie})</span></div>
                      <div className="flex items-center justify-between mt-1 tabular-nums">
                        <span className="text-red-700 font-bold">{Number(i.stock_actuel).toFixed(2)} / min {Number(i.stock_minimum).toFixed(2)} {i.unite}</span>
                        <span className="font-bold">+{qty.toFixed(2)} {i.unite}</span>
                      </div>
                      <div className="text-right text-zinc-500">{fmtEur(estime)}</div>
                    </li>
                  )
                })}
              </ul>

              {/* Desktop/tablette : table */}
              <div className="hidden md:block -mx-1 sm:mx-0 overflow-x-auto">
              <table className="w-full text-xs min-w-[520px]">
                <thead className="bg-amber-50/50">
                  <tr>
                    <th className="text-left px-2 py-1">Produit</th>
                    <th className="text-right px-2 py-1">Stock actuel</th>
                    <th className="text-right px-2 py-1">Seuil min</th>
                    <th className="text-right px-2 py-1">Quantité à cmder</th>
                    <th className="text-right px-2 py-1">Estimation €</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map(i => {
                    const qty = Math.max(0, Number(i.stock_maximum) - Number(i.stock_actuel))
                    const estime = qty * Number(i.prix_achat_ht ?? 0)
                    return (
                      <tr key={i.id} className="border-t border-amber-100">
                        <td className="px-2 py-1">{i.nom} <span className="text-zinc-500">({i.categorie})</span></td>
                        <td className="text-right tabular-nums px-2 py-1 text-red-700 font-bold">{Number(i.stock_actuel).toFixed(2)} {i.unite}</td>
                        <td className="text-right tabular-nums px-2 py-1 text-zinc-500">{Number(i.stock_minimum).toFixed(2)} {i.unite}</td>
                        <td className="text-right tabular-nums px-2 py-1 font-bold">{qty.toFixed(2)} {i.unite}</td>
                        <td className="text-right tabular-nums px-2 py-1">{fmtEur(estime)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-[11px] text-amber-900 italic">
        💡 « Préparer l&apos;email » ouvre ton client mail avec le contenu pré-rempli. « Créer les BDC » génère un brouillon par fournisseur en base, à valider/imprimer ensuite.
      </p>
    </Card>
  )
}

function buildEmailBody(fournisseur: string, lignes: Array<{ nom: string; unite: string; stock_actuel: number; stock_maximum: number; prix_achat_ht: number }>): string {
  const date = new Date().toLocaleDateString('fr-FR')
  const ligneRows = lignes.map(i => {
    const qty = Math.max(0, Number(i.stock_maximum) - Number(i.stock_actuel))
    return `- ${i.nom} : ${qty.toFixed(2)} ${i.unite}`
  }).join('\n')
  return `Bonjour,\n\nMerci de nous livrer dès que possible les produits suivants :\n\n${ligneRows}\n\nLivraison souhaitée : à confirmer.\n\nCordialement,\nL'équipe ${fournisseur === 'Sans fournisseur' ? '' : ''}\n\n--\nBon de commande généré le ${date} via App-Restaurant.`
}

function fmtEur(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}
