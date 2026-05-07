'use client'

import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

const fmtPrix = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
const fmtDate = (iso: string) => format(parseISO(iso), 'EEEE d MMMM yyyy', { locale: fr })

export default function ContratPrintClient({
  evt, etablissement, numero_contrat,
}: {
  evt: { id: string; titre: string; date_evenement: string; heure_debut: string | null; heure_fin: string | null; nb_personnes: number; taux_tva: number; montant_devis: number; acompte_verse: number; client_nom: string | null; client_email: string | null; client_telephone: string | null; lieu: string | null; materiel_demande: string | null; besoins_techniques: string | null }
  etablissement: Record<string, string>
  numero_contrat: string
}) {
  const acompteRequis = Math.round(evt.montant_devis * 0.30 * 100) / 100

  return (
    <div className="min-h-screen bg-zinc-100 print:bg-white text-zinc-900 py-6 px-4 print:p-0">
      <style>{`@media print { @page { size: A4; margin: 1.5cm } body { background: white } .no-print { display: none !important } }`}</style>
      <div className="max-w-3xl mx-auto bg-white shadow-lg p-8 print:shadow-none">
        <div className="no-print flex justify-between mb-4 gap-2">
          <button onClick={() => window.history.back()} className="h-10 px-4 rounded-md border border-zinc-300 bg-white hover:bg-zinc-50 text-sm font-semibold">← Retour</button>
          <button onClick={() => window.print()} className="h-10 px-4 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold">🖨 Imprimer / PDF</button>
        </div>

        <header className="text-center pb-6 border-b-2 border-zinc-900">
          <h1 className="text-2xl font-bold uppercase tracking-wider">Contrat de privatisation</h1>
          <p className="text-sm text-zinc-600 mt-1">N° {numero_contrat}</p>
        </header>

        <section className="my-6 text-sm">
          <p><b>Entre les soussignés :</b></p>
          <div className="ml-4 mt-2 space-y-2">
            <div>
              <p className="font-bold">{etablissement.etablissement_nom || 'Établissement'}</p>
              {etablissement.etablissement_adresse && <p className="text-xs whitespace-pre-line">{etablissement.etablissement_adresse}</p>}
              {etablissement.etablissement_siret && <p className="text-xs">SIRET : {etablissement.etablissement_siret}</p>}
              <p className="text-xs italic mt-1">Ci-après désigné « le Prestataire »</p>
            </div>
            <p className="text-center font-bold">ET</p>
            <div>
              <p className="font-bold">{evt.client_nom ?? '—'}</p>
              {evt.client_email && <p className="text-xs">{evt.client_email}</p>}
              {evt.client_telephone && <p className="text-xs">{evt.client_telephone}</p>}
              <p className="text-xs italic mt-1">Ci-après désigné « le Client »</p>
            </div>
          </div>
        </section>

        <section className="my-6 text-sm">
          <p><b>Il a été convenu ce qui suit :</b></p>
          <article className="mt-3 space-y-3">
            <div>
              <h3 className="font-bold uppercase tracking-wider text-xs text-zinc-700">Article 1 — Objet</h3>
              <p>Le Prestataire s&apos;engage à mettre à disposition du Client ses locaux pour la privatisation totale de l&apos;établissement à l&apos;occasion de l&apos;événement intitulé <b>« {evt.titre} »</b>.</p>
            </div>

            <div>
              <h3 className="font-bold uppercase tracking-wider text-xs text-zinc-700">Article 2 — Date et durée</h3>
              <p className="capitalize">L&apos;événement se déroulera le <b>{fmtDate(evt.date_evenement)}</b>{evt.heure_debut && <> de <b>{evt.heure_debut.slice(0, 5)}</b> à <b>{evt.heure_fin?.slice(0, 5) ?? '?'}</b></>}.</p>
              {evt.lieu && <p>Lieu : {evt.lieu}.</p>}
              <p>Capacité d&apos;accueil : <b>{evt.nb_personnes} personnes</b> maximum.</p>
            </div>

            <div>
              <h3 className="font-bold uppercase tracking-wider text-xs text-zinc-700">Article 3 — Tarif</h3>
              <p>Le Client s&apos;acquittera de la somme de <b className="tabular-nums">{fmtPrix(evt.montant_devis)}</b> TTC (TVA {evt.taux_tva}%).</p>
              <p>Acompte de 30% (<b className="tabular-nums">{fmtPrix(acompteRequis)}</b>) à la signature du présent contrat.</p>
              <p>Solde à régler le jour de l&apos;événement, avant ouverture des portes.</p>
            </div>

            <div>
              <h3 className="font-bold uppercase tracking-wider text-xs text-zinc-700">Article 4 — Prestations incluses</h3>
              <p>{evt.materiel_demande ?? 'Mise à disposition des locaux et personnel de service standard.'}</p>
              {evt.besoins_techniques && <p className="mt-1">Besoins techniques particuliers : {evt.besoins_techniques}.</p>}
            </div>

            <div>
              <h3 className="font-bold uppercase tracking-wider text-xs text-zinc-700">Article 5 — Annulation</h3>
              <p>En cas d&apos;annulation par le Client :</p>
              <ul className="list-disc list-inside ml-2 text-xs">
                <li>Plus de 30 jours avant : remboursement intégral de l&apos;acompte.</li>
                <li>Entre 15 et 30 jours : 50% de l&apos;acompte conservé.</li>
                <li>Moins de 15 jours : acompte intégralement conservé.</li>
              </ul>
              <p className="mt-1">En cas d&apos;annulation par le Prestataire (force majeure, sinistre), remboursement intégral de toute somme versée.</p>
            </div>

            <div>
              <h3 className="font-bold uppercase tracking-wider text-xs text-zinc-700">Article 6 — Responsabilité</h3>
              <p>Le Client est responsable des dommages causés aux locaux et matériels durant la privatisation. Une caution pourra être demandée au moment de l&apos;événement.</p>
              <p className="mt-1">Le Prestataire décline toute responsabilité en cas de vol ou perte d&apos;effets personnels des invités.</p>
            </div>

            <div>
              <h3 className="font-bold uppercase tracking-wider text-xs text-zinc-700">Article 7 — Sonorisation et nuisances</h3>
              <p>Toute amplification sonore est limitée à 100 dB(A) (Décret 98-1143). Le Client s&apos;engage à respecter le voisinage et l&apos;arrêté préfectoral en vigueur.</p>
            </div>

            <div>
              <h3 className="font-bold uppercase tracking-wider text-xs text-zinc-700">Article 8 — Litiges</h3>
              <p>Tout litige relatif au présent contrat sera de la compétence des tribunaux du ressort du siège social du Prestataire. Droit français applicable.</p>
            </div>
          </article>
        </section>

        <section className="mt-10 pt-4 border-t border-zinc-300">
          <p className="text-sm">Fait en deux exemplaires à <span className="inline-block border-b border-dashed border-zinc-400 w-32"></span>, le <span className="inline-block border-b border-dashed border-zinc-400 w-32"></span></p>
          <div className="grid grid-cols-2 gap-6 mt-8">
            <div>
              <p className="font-bold text-sm">Le Prestataire</p>
              <p className="text-[10px] italic">Précédé de "Bon pour accord"</p>
              <div className="mt-12 border-b border-zinc-400 w-48" />
            </div>
            <div className="text-right">
              <p className="font-bold text-sm">Le Client</p>
              <p className="text-[10px] italic">Précédé de "Bon pour accord"</p>
              <div className="mt-12 border-b border-zinc-400 w-48 ml-auto" />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
