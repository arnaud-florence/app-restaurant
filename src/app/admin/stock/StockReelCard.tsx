import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { chargerLignesReassort } from '@/lib/reassort-donnees'
import { sansComptagePerime, PEREMPTION_COMPTAGE_JOURS } from '@/lib/reassort'

/**
 * LE STOCK RÉEL, à jour après chaque livraison.
 *
 * ⚠️ Il se CALCULE, il ne se stocke pas : comptage + entrées (bons de
 * livraison et factures) − ce qui est sorti. `ingredients.stock_actuel`, le
 * compteur du module 7 affiché plus bas, n'est plus alimenté depuis la 0135 —
 * il dérivait au premier oubli, et un stock auquel personne ne croit ne sert
 * à rien. Une facture scannée en retard corrige ce chiffre-ci toute seule.
 *
 * ⚠️ MÊME SOURCE QUE LE RÉASSORT ET QUE L'AGENT STOCK (`chargerLignesReassort`).
 * Deux écrans qui calculent le stock chacun de leur côté finissent par
 * afficher deux chiffres, et personne ne sait lequel croire.
 */
export default async function StockReelCard() {
  const sb = await createClient()
  const lignes = sansComptagePerime(await chargerLignesReassort(sb))

  const comptees = lignes.filter(l => l.tenu !== null)
  const livrees = lignes.filter(l => l.entrees !== 0)
  const valeur = comptees.reduce((s, l) => s + (l.cout_unitaire_ht == null ? 0 : l.tenu! * l.cout_unitaire_ht), 0)
  const sansPrix = comptees.filter(l => l.cout_unitaire_ht == null).length
  const jamais = lignes.length - comptees.length

  // ⚠️⚠️ « RIEN » NE DOIT PAS SE LIRE « ZÉRO ». Le gérant a signalé un stock à
  // zéro : en réalité 237 références sur 273 n'ont AUCUN comptage valide — le
  // Fournil n'a pas été compté depuis le 24 août. L'outil ne peut pas
  // inventer un stock, mais il doit dire ce qui manque et où le faire, au
  // lieu de laisser une liste courte ressembler à une réserve vide.
  const jours = (d: string) => Math.round((Date.now() - Date.parse(d)) / 864e5)
  const dernierParPoste = new Map<string, string>()
  for (const l of lignes) {
    if (!l.compte_le) continue
    const k = l.etablissement ?? 'Matières premières'
    const d = dernierParPoste.get(k)
    if (!d || l.compte_le > d) dernierParPoste.set(k, l.compte_le)
  }
  const aCompter = lignes.filter(l => l.tenu === null).length

  const parEtage = new Map<string, typeof lignes>()
  for (const l of comptees.filter(x => x.tenu !== 0 || x.entrees !== 0)) {
    const k = l.etablissement ?? 'Matières premières'
    if (!parEtage.has(k)) parEtage.set(k, [])
    parEtage.get(k)!.push(l)
  }
  const eur = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

  return (
    <section className="rounded-xl border-2 border-zinc-300 bg-white">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 px-5 py-3">
        <div>
          <h2 className="text-base font-black text-zinc-900">📦 Stock à jour</h2>
          <p className="text-xs text-zinc-600">
            Dernier comptage + les livraisons enregistrées depuis. Recalculé à chaque ouverture.
          </p>
        </div>
        <p className="text-lg font-black tabular-nums text-zinc-900">
          {eur(valeur)}
          {sansPrix > 0 && (
            <span className="ml-2 text-xs font-semibold text-amber-700">
              + {sansPrix} réf. sans prix connu, non chiffrée{sansPrix > 1 ? 's' : ''}
            </span>
          )}
        </p>
      </header>

      {aCompter > 0 && (
        <div className="border-b border-amber-300 bg-amber-50 px-5 py-3">
          <p className="text-sm font-bold text-amber-900">
            ⚠️ {aCompter} référence{aCompter > 1 ? 's' : ''} sans stock connu — ce n’est pas zéro, c’est « personne n’a compté »
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Un stock ne s’invente pas : il part d’un comptage, auquel s’ajoutent les livraisons.
            {dernierParPoste.size > 0 && (
              <> Dernier comptage par poste —{' '}
                {[...dernierParPoste.entries()].map(([k, d]) => `${k} : il y a ${jours(d)} j`).join(' · ')}.
              </>
            )}{' '}
            Au-delà de {PEREMPTION_COMPTAGE_JOURS} jours, un comptage ne décrit plus rien et n’est plus utilisé.
          </p>
          <p className="mt-2">
            <Link href="/inventaire?poste=fournil"
              className="inline-block rounded-md bg-amber-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-amber-700">
              Compter le Fournil →
            </Link>
            <Link href="/inventaire?poste=bar"
              className="ml-2 inline-block rounded-md border border-amber-600 px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100">
              Compter le bar
            </Link>
          </p>
        </div>
      )}

      {livrees.length > 0 && (
        <p className="border-b border-emerald-200 bg-emerald-50 px-5 py-2 text-sm font-semibold text-emerald-900">
          ✓ {livrees.length} référence{livrees.length > 1 ? 's' : ''} mise{livrees.length > 1 ? 's' : ''} à jour
          par les dernières livraisons.
        </p>
      )}

      <div className="max-h-[32rem] overflow-y-auto">
        {[...parEtage.entries()].map(([etage, l]) => (
          <div key={etage}>
            <h3 className="sticky top-0 bg-zinc-100 px-5 py-1.5 text-xs font-black uppercase tracking-wide text-zinc-700">
              {etage} — {l.length}
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {l.sort((a, b) => a.nom.localeCompare(b.nom, 'fr')).map(x => (
                  <tr key={x.cle} className="border-b border-zinc-100 last:border-0">
                    <td className="px-5 py-1.5 text-zinc-900">{x.nom}</td>
                    <td className="w-28 whitespace-nowrap px-2 py-1.5 text-right text-xs text-zinc-500 tabular-nums">
                      {/* D'où vient le chiffre : on montre la décomposition
                          plutôt qu'un total opaque. */}
                      {x.compte}{x.entrees ? <span className="text-emerald-700 font-semibold"> + {x.entrees}</span> : null}
                    </td>
                    <td className="w-20 px-5 py-1.5 text-right font-bold tabular-nums text-zinc-900">
                      {x.tenu}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {parEtage.size === 0 && (
          <p className="px-5 py-6 text-sm text-zinc-600">
            Rien en stock. Un stock n’apparaît ici qu’à partir d’un comptage :
            une livraison seule dit un mouvement, pas un stock.
          </p>
        )}
      </div>

      <footer className="space-y-1 border-t border-zinc-200 bg-zinc-50 px-5 py-2.5 text-xs text-zinc-600">
        <p>
          Les <b>sorties</b> ne sont pas déduites ici — elles le sont à l’inventaire,
          où la caisse les donne produit par produit. Ce chiffre est donc un
          maximum entre deux comptages.
        </p>
        <p className="pt-1">
          <Link href="/inventaire" className="font-semibold text-emerald-800 underline">Compter le stock →</Link>
          <span className="mx-2 text-zinc-400">·</span>
          <Link href="/admin/reassort" className="font-semibold text-emerald-800 underline">Ce qu’il faut commander →</Link>
          <span className="mx-2 text-zinc-400">·</span>
          <Link href="/admin/fournisseurs" className="font-semibold text-emerald-800 underline">Enregistrer une livraison →</Link>
        </p>
      </footer>
    </section>
  )
}
