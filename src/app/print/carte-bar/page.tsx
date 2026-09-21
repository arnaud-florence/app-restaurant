// Carte des boissons imprimable — et l'affichage extérieur obligatoire.
//
// Tirée de la base à chaque ouverture : un prix changé dans l'outil (et donc
// dans la caisse) change la carte. Une carte tapée à la main dans un
// traitement de texte finit toujours par afficher un autre prix que le ticket
// — et c'est le prix AFFICHÉ que le client est en droit de payer.
//
// Page 1 : la carte, pour le comptoir et les tables.
// Page 2 : l'affichage extérieur exigé par l'arrêté du 27 mars 1987 (art. 2) :
// café, demi pression, bière bouteille, jus de fruit, soda, eau minérale,
// apéritif anisé, plat du jour et sandwich, en caractères d'au moins 1,5 cm,
// lisibles de l'extérieur. Le prix affiché est celui SUR PLACE — c'est lui
// que paie le client qui s'assoit.

import { createClient } from '@/lib/supabase/server'
import PrintButton from '@/app/print/fiche-poste/[guideId]/PrintButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Carte des boissons — CasaTasia' }

type R = { nom: string; categorie: string; prix_vente_ht: number; tva: number; prix_sur_place_ttc: number | null }

const PRESSION = ['Demi pression', 'Pinte pression', 'Demi ambrée', 'Panaché', 'Monaco', 'Picon bière']

export default async function CarteBarPage() {
  const supabase = await createClient()
  const { data } = await supabase.from('recettes')
    .select('nom, categorie, prix_vente_ht, tva, prix_sur_place_ttc')
    .eq('actif', true)
    .or('tag_destination.eq.BAR,categorie.in.("Boisson fraîche","Boisson chaude")')
    .order('nom')
  const rows = ((data ?? []) as R[])
    // Les composants de formule (« Cappuccino ou chocolat chaud ») ne se
    // commandent pas seuls.
    .filter(r => !r.nom.startsWith('Formule') && !/ ou /.test(r.nom))

  // Prix de la carte = prix SUR PLACE quand il existe (verre consigné), sinon
  // le prix de vente. C'est ce que paie le client assis.
  const prix = (r: R) => r.prix_sur_place_ttc != null
    ? Number(r.prix_sur_place_ttc)
    : Number(r.prix_vente_ht) * (1 + Number(r.tva) / 100)
  const eur = (n: number) => n.toFixed(2).replace('.', ',') + ' €'
  const trouve = (nom: string) => rows.find(r => r.nom === nom)

  const sections: Array<[string, R[]]> = [
    ['Bières pression', PRESSION.map(trouve).filter(Boolean) as R[]],
    ['Bières bouteille', rows.filter(r => r.categorie === 'Bière' && !PRESSION.includes(r.nom))],
    ['Apéritifs', rows.filter(r => r.categorie === 'Apéritif')],
    ['Vins', rows.filter(r => r.categorie === 'Vin')],
    ['Alcools', rows.filter(r => r.categorie === 'Alcool')],
    ['Sans alcool', rows.filter(r => r.categorie === 'Boisson fraîche')],
    ['Boissons chaudes', rows.filter(r => r.categorie === 'Boisson chaude')],
  ]

  // Affichage extérieur obligatoire — un produit réel par rubrique légale.
  const obligatoire: Array<[string, R | undefined]> = [
    ['Café', trouve('Café expresso')],
    ['Demi pression', trouve('Demi pression')],
    ['Bière bouteille', trouve('Bière bouteille 33 cl')],
    ['Jus de fruit', trouve("Jus d'orange 33 cl")],
    ['Soda', trouve('Coca-Cola 33 cl')],
    ['Eau minérale', trouve('Eau plate 50 cl')],
    ['Apéritif anisé', trouve('Pastis 2 cl')],
  ]
  const { data: sandwich } = await supabase.from('recettes')
    .select('nom, categorie, prix_vente_ht, tva, prix_sur_place_ttc')
    .eq('nom', 'Le Parisien').maybeSingle()

  return (
    <div className="bg-white text-zinc-900">
      <style>{`@page { size: A4; margin: 12mm } @media print { .saut { break-before: page } }`}</style>
      <div className="print:hidden p-4 border-b border-zinc-200 flex items-center gap-3">
        <PrintButton />
        <span className="text-sm text-zinc-500">Page 1 : la carte · Page 2 : l&apos;affichage extérieur obligatoire</span>
      </div>

      {/* ── Page 1 : la carte ─────────────────────────────────── */}
      <article className="mx-auto max-w-[186mm] p-6 print:p-0">
        <header className="text-center border-b-2 border-zinc-900 pb-3 mb-5">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-zinc-500">CasaTasia</p>
          <h1 className="text-4xl font-black tracking-tight mt-1">La carte du bar</h1>
          <p className="text-xs text-zinc-500 mt-1">Prix nets, service compris · Sainte-Anastasie-sur-Issole</p>
        </header>
        <div className="columns-2 gap-8 [column-fill:_balance]">
          {sections.filter(([, l]) => l.length).map(([titre, liste]) => (
            <section key={titre} className="break-inside-avoid mb-5">
              <h2 className="text-sm font-black uppercase tracking-[0.15em] border-b border-zinc-300 pb-1 mb-2">{titre}</h2>
              <ul className="space-y-1">
                {liste.map(r => (
                  <li key={r.nom} className="flex items-baseline gap-2 text-[13px]">
                    <span>{r.nom}</span>
                    <span className="flex-1 border-b border-dotted border-zinc-300 translate-y-[-3px]" />
                    <span className="tabular-nums font-semibold">{eur(prix(r))}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <footer className="mt-4 pt-3 border-t border-zinc-300 text-[10px] text-zinc-500 text-center">
          L&apos;abus d&apos;alcool est dangereux pour la santé, à consommer avec modération.
          La vente d&apos;alcool est interdite aux mineurs de moins de 18 ans.
        </footer>
      </article>

      {/* ── Page 2 : affichage extérieur obligatoire ──────────── */}
      <article className="saut mx-auto max-w-[186mm] p-6 print:p-0 mt-10 print:mt-0">
        <p className="text-center text-sm font-bold uppercase tracking-[0.2em] text-zinc-500">CasaTasia — nos prix</p>
        {/* 64 pt ≈ 2,26 cm de corps : la hauteur des capitales et des
            chiffres dépasse 1,5 cm, le minimum légal. */}
        <ul className="mt-4" style={{ fontSize: '64pt', lineHeight: 1.12 }}>
          {obligatoire.map(([rubrique, r]) => (
            <li key={rubrique} className="flex justify-between gap-6 font-black">
              <span>{rubrique}</span>
              <span className="tabular-nums">{r ? eur(prix(r)) : '—'}</span>
            </li>
          ))}
          <li className="flex justify-between gap-6 font-black">
            <span>Sandwich</span>
            <span className="tabular-nums">{sandwich ? eur(prix(sandwich as R)) : '—'}</span>
          </li>
          <li className="flex justify-between gap-6 font-black">
            <span>Plat du jour</span>
            <span className="tabular-nums text-zinc-300">____</span>
          </li>
        </ul>
        <p className="text-xs text-zinc-500 mt-4">
          Affichage extérieur — arrêté du 27 mars 1987, art. 2. Prix sur place, service compris.
          Le plat du jour se complète à la main quand la cuisine est ouverte.
        </p>
      </article>
    </div>
  )
}
