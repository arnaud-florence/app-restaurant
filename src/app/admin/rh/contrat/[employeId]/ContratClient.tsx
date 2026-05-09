'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Printer, ArrowLeft, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'

type TypeContrat = 'CDI' | 'CDD' | 'EXTRA' | 'STAGE' | 'APPRENTISSAGE'

const TYPE_LABEL: Record<TypeContrat, { label: string; description: string }> = {
  CDI:           { label: 'CDI',           description: 'Contrat à durée indéterminée' },
  CDD:           { label: 'CDD',           description: 'Contrat à durée déterminée (date de fin obligatoire)' },
  EXTRA:         { label: 'Extra',         description: 'Contrat à la mission (occasionnel, < 60j/an)' },
  STAGE:         { label: 'Stage',         description: 'Convention de stage (durée encadrée par le tuteur)' },
  APPRENTISSAGE: { label: 'Apprentissage', description: 'Contrat d\'apprentissage (alternance)' },
}

type Props = {
  employe: {
    id: string; prenom: string; nom: string; poste: string;
    email: string | null; telephone: string | null;
    salaire_horaire: number; heures_contrat: number;
    date_embauche: string | null
  }
  etablissement: {
    nom: string; adresse: string; siret: string; tva_intra: string;
    telephone: string; email: string; code_naf: string;
    convention: string; representant: string; rep_fonction: string
  }
  typeContrat: TypeContrat
  dateDebut: string
  dateFin: string
  periodeEssaiJours: number
  smic: number
}

export default function ContratClient({ employe, etablissement, typeContrat, dateDebut, dateFin, periodeEssaiJours, smic }: Props) {
  const [type, setType] = useState<TypeContrat>(typeContrat)
  const [debut, setDebut] = useState(dateDebut)
  const [fin, setFin] = useState(dateFin)
  const [essai, setEssai] = useState(periodeEssaiJours)
  const [adresseEmp, setAdresseEmp] = useState('')
  const [naissanceEmp, setNaissanceEmp] = useState('')
  const [lieuNaissanceEmp, setLieuNaissanceEmp] = useState('')
  const [nationaliteEmp, setNationaliteEmp] = useState('Française')
  const [secuEmp, setSecuEmp] = useState('')

  const salaireMensuelBrut = employe.heures_contrat * 4.33 * employe.salaire_horaire
  const horaireRespecteSmic = employe.salaire_horaire >= smic

  const today = new Date().toLocaleDateString('fr-FR')

  return (
    <div className="min-h-screen bg-zinc-100 print:bg-white">
      <style>{`
        @media print {
          @page { size: A4; margin: 18mm 15mm; }
          body { background: white !important; font-size: 11pt; }
          .print\\:hidden { display: none !important; }
          .article { page-break-inside: avoid; margin-bottom: 5mm; }
          h1 { font-size: 18pt; }
          h2 { font-size: 12pt; }
        }
      `}</style>

      {/* Toolbar (cachée à l'impression) */}
      <div className="print:hidden sticky top-0 bg-white border-b z-10 px-4 py-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Link href="/admin/rh" className="text-sm text-zinc-600 hover:text-zinc-900 inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> RH
          </Link>
          <span className="text-zinc-300">|</span>
          <FileText className="h-4 w-4 text-emerald-600" />
          <span className="text-sm font-bold">Contrat — {employe.prenom} {employe.nom}</span>
        </div>
        <Button onClick={() => window.print()} className="gap-1.5">
          <Printer className="h-4 w-4" /> Imprimer / PDF
        </Button>
      </div>

      {/* Form de paramétrage (caché à l'impression) */}
      <div className="print:hidden bg-amber-50 border-b border-amber-200 px-4 py-3">
        <p className="text-xs font-bold text-amber-900 mb-2">⚠ Paramètres du contrat (vérifie avant impression)</p>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-xs">
          <label className="block">
            <span className="block text-zinc-600 mb-0.5">Type</span>
            <select value={type} onChange={e => setType(e.target.value as TypeContrat)} className="w-full border rounded h-8 px-2">
              {(Object.keys(TYPE_LABEL) as TypeContrat[]).map(k => (
                <option key={k} value={k}>{TYPE_LABEL[k].label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-zinc-600 mb-0.5">Date début</span>
            <input type="date" value={debut} onChange={e => setDebut(e.target.value)} className="w-full border rounded h-8 px-2" />
          </label>
          {(type === 'CDD' || type === 'STAGE' || type === 'APPRENTISSAGE') && (
            <label className="block">
              <span className="block text-zinc-600 mb-0.5">Date fin</span>
              <input type="date" value={fin} onChange={e => setFin(e.target.value)} className="w-full border rounded h-8 px-2" />
            </label>
          )}
          <label className="block">
            <span className="block text-zinc-600 mb-0.5">Période essai (jours)</span>
            <input type="number" value={essai} min="0" onChange={e => setEssai(Number(e.target.value))} className="w-full border rounded h-8 px-2" />
          </label>
        </div>
        <p className="text-xs font-bold text-amber-900 mb-1 mt-3">Données salarié à compléter (à remplir manuellement)</p>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-xs">
          <label className="block md:col-span-2"><span className="block text-zinc-600 mb-0.5">Adresse</span><input value={adresseEmp} onChange={e => setAdresseEmp(e.target.value)} className="w-full border rounded h-8 px-2" placeholder="N° rue, code postal, ville" /></label>
          <label className="block"><span className="block text-zinc-600 mb-0.5">Né(e) le</span><input type="date" value={naissanceEmp} onChange={e => setNaissanceEmp(e.target.value)} className="w-full border rounded h-8 px-2" /></label>
          <label className="block"><span className="block text-zinc-600 mb-0.5">Lieu de naissance</span><input value={lieuNaissanceEmp} onChange={e => setLieuNaissanceEmp(e.target.value)} className="w-full border rounded h-8 px-2" /></label>
          <label className="block"><span className="block text-zinc-600 mb-0.5">Nationalité</span><input value={nationaliteEmp} onChange={e => setNationaliteEmp(e.target.value)} className="w-full border rounded h-8 px-2" /></label>
          <label className="block md:col-span-2"><span className="block text-zinc-600 mb-0.5">N° Sécurité Sociale</span><input value={secuEmp} onChange={e => setSecuEmp(e.target.value)} className="w-full border rounded h-8 px-2" placeholder="13 chiffres + 2 clé" /></label>
        </div>
      </div>

      {/* Document contrat A4 */}
      <div className="max-w-4xl mx-auto p-4 md:p-8 bg-white print:p-0 print:shadow-none shadow-md print:my-0 my-4 rounded-md">
        <header className="text-center border-b-2 pb-3 mb-5">
          <h1 className="text-2xl font-bold uppercase">Contrat de travail — {TYPE_LABEL[type].label}</h1>
          <p className="text-sm text-zinc-600 mt-1">{TYPE_LABEL[type].description}</p>
        </header>

        <p className="text-sm mb-4"><strong>Entre les soussignés :</strong></p>

        <div className="article mb-4">
          <p className="text-sm leading-relaxed">
            <strong>L&apos;Employeur :</strong> <strong>{etablissement.nom}</strong>
            {etablissement.adresse && <>, dont le siège est situé au {etablissement.adresse}</>}
            {etablissement.siret && <>, immatriculé sous le numéro SIRET {etablissement.siret}</>}
            {etablissement.code_naf && <>, code NAF {etablissement.code_naf}</>},
            {etablissement.representant && <> représenté par <strong>{etablissement.representant}</strong>{etablissement.rep_fonction && <>, en qualité de {etablissement.rep_fonction}</>}</>},
            {' '}ci-après dénommé «&nbsp;<strong>l&apos;Employeur</strong>&nbsp;»,
          </p>
          <p className="mt-2 text-sm">D&apos;une part,</p>
        </div>

        <div className="article mb-4">
          <p className="text-sm leading-relaxed">
            <strong>Et le/la salarié(e) :</strong> <strong>{employe.prenom} {employe.nom}</strong>
            {naissanceEmp && <>, né(e) le {new Date(naissanceEmp).toLocaleDateString('fr-FR')}</>}
            {lieuNaissanceEmp && <> à {lieuNaissanceEmp}</>}
            {nationaliteEmp && <>, de nationalité {nationaliteEmp}</>}
            {adresseEmp && <>, demeurant {adresseEmp}</>}
            {secuEmp && <>, n° SS {secuEmp}</>},
            {' '}ci-après dénommé(e) «&nbsp;<strong>le/la Salarié(e)</strong>&nbsp;»,
          </p>
          <p className="mt-2 text-sm">D&apos;autre part.</p>
        </div>

        <p className="text-sm mb-4 text-center font-bold">IL A ÉTÉ CONVENU CE QUI SUIT :</p>

        {/* Article 1 — Engagement */}
        <section className="article mb-4">
          <h2 className="font-bold text-base mb-1">ARTICLE 1 — Engagement</h2>
          <p className="text-sm leading-relaxed">
            Sous réserve du résultat de la visite médicale d&apos;embauche, l&apos;Employeur engage le/la Salarié(e), qui accepte,
            en qualité de <strong>{employe.poste}</strong>, à compter du <strong>{new Date(debut).toLocaleDateString('fr-FR')}</strong>
            {(type === 'CDD' || type === 'STAGE' || type === 'APPRENTISSAGE') && fin && (
              <> et jusqu&apos;au <strong>{new Date(fin).toLocaleDateString('fr-FR')}</strong></>
            )}.
          </p>
          {type === 'CDD' && (
            <p className="text-sm mt-1 italic">Motif du recours au CDD : surcroît temporaire d&apos;activité / remplacement de salarié absent / autre (à préciser).</p>
          )}
          {type === 'EXTRA' && (
            <p className="text-sm mt-1 italic">Le présent contrat est conclu pour la durée d&apos;une mission ponctuelle. Il est conclu en application des usages du secteur de l&apos;hôtellerie-restauration (article D.1242-1 du Code du travail).</p>
          )}
        </section>

        {/* Article 2 — Période d'essai */}
        {essai > 0 && (
          <section className="article mb-4">
            <h2 className="font-bold text-base mb-1">ARTICLE 2 — Période d&apos;essai</h2>
            <p className="text-sm leading-relaxed">
              Le présent contrat est conclu sous réserve d&apos;une période d&apos;essai de <strong>{essai} jour{essai > 1 ? 's' : ''}</strong>,
              renouvelable une fois en accord entre les parties. Pendant cette période, chaque partie pourra
              rompre le contrat sans préavis ni indemnité, sous réserve du respect du délai de prévenance légal.
            </p>
          </section>
        )}

        {/* Article 3 — Rémunération */}
        <section className="article mb-4">
          <h2 className="font-bold text-base mb-1">ARTICLE {essai > 0 ? '3' : '2'} — Rémunération</h2>
          <p className="text-sm leading-relaxed">
            En contrepartie de son travail, le/la Salarié(e) percevra une rémunération brute horaire de
            <strong> {employe.salaire_horaire.toFixed(2)} € / heure</strong>
            {!horaireRespecteSmic && (
              <span className="text-red-700 font-bold"> ⚠ inférieur au SMIC horaire en vigueur ({smic.toFixed(2)} €) — à corriger</span>
            )},
            soit pour {employe.heures_contrat} heures hebdomadaires une rémunération mensuelle brute moyenne de
            <strong> {salaireMensuelBrut.toFixed(2)} €</strong>.
          </p>
          <p className="text-sm mt-1">Cette rémunération sera versée mensuellement à terme échu, par virement bancaire.</p>
        </section>

        {/* Article 4 — Durée du travail */}
        <section className="article mb-4">
          <h2 className="font-bold text-base mb-1">ARTICLE {essai > 0 ? '4' : '3'} — Durée du travail</h2>
          <p className="text-sm leading-relaxed">
            La durée du travail est fixée à <strong>{employe.heures_contrat} heures par semaine</strong>, réparties selon
            le planning de service communiqué chaque semaine. Les heures supplémentaires éventuelles seront rémunérées
            conformément aux dispositions légales et conventionnelles en vigueur.
          </p>
        </section>

        {/* Article 5 — Lieu de travail */}
        <section className="article mb-4">
          <h2 className="font-bold text-base mb-1">ARTICLE {essai > 0 ? '5' : '4'} — Lieu de travail</h2>
          <p className="text-sm leading-relaxed">
            Le/la Salarié(e) exercera ses fonctions principalement au siège de l&apos;établissement,
            {etablissement.adresse ? <> situé au {etablissement.adresse}</> : <> dont l&apos;adresse est précisée par l&apos;Employeur</>}.
          </p>
        </section>

        {/* Article 6 — Convention collective */}
        <section className="article mb-4">
          <h2 className="font-bold text-base mb-1">ARTICLE {essai > 0 ? '6' : '5'} — Convention collective</h2>
          <p className="text-sm leading-relaxed">
            Le/la Salarié(e) sera soumis(e) aux dispositions de la convention collective applicable :
            <strong> {etablissement.convention}</strong>.
          </p>
        </section>

        {/* Article 7 — Confidentialité & loyauté */}
        <section className="article mb-4">
          <h2 className="font-bold text-base mb-1">ARTICLE {essai > 0 ? '7' : '6'} — Obligation de loyauté et confidentialité</h2>
          <p className="text-sm leading-relaxed">
            Le/la Salarié(e) s&apos;engage à respecter une obligation de loyauté envers l&apos;Employeur, à respecter la
            discrétion la plus stricte concernant les informations dont il/elle aura connaissance dans le cadre de
            ses fonctions (recettes, fournisseurs, clientèle, données financières, etc.).
          </p>
        </section>

        {/* Article 8 — Hygiène & sécurité */}
        <section className="article mb-4">
          <h2 className="font-bold text-base mb-1">ARTICLE {essai > 0 ? '8' : '7'} — Hygiène, sécurité et HACCP</h2>
          <p className="text-sm leading-relaxed">
            Le/la Salarié(e) s&apos;engage à respecter strictement les règles d&apos;hygiène alimentaire et de sécurité applicables
            dans le cadre du Plan de Maîtrise Sanitaire (HACCP), à suivre les formations obligatoires
            (manipulation des denrées, allergènes, premiers secours), et à signaler immédiatement à l&apos;Employeur
            toute non-conformité constatée.
          </p>
        </section>

        {/* Article 9 — Rupture */}
        <section className="article mb-4">
          <h2 className="font-bold text-base mb-1">ARTICLE {essai > 0 ? '9' : '8'} — Rupture du contrat</h2>
          <p className="text-sm leading-relaxed">
            {type === 'CDI' && <>La rupture du présent contrat pourra intervenir à l&apos;initiative de l&apos;une ou l&apos;autre des parties, dans le respect des règles légales (préavis, motifs, formalités) et conventionnelles applicables au secteur de l&apos;hôtellerie-restauration.</>}
            {type === 'CDD' && <>Le présent CDD prend fin de plein droit à la date prévue. Une rupture anticipée n&apos;est possible que dans les cas prévus par la loi (accord des parties, faute grave, force majeure, embauche en CDI).</>}
            {type === 'EXTRA' && <>Le présent contrat extra prend fin à l&apos;issue de la mission. Aucun préavis n&apos;est requis du fait de la nature ponctuelle de l&apos;engagement.</>}
            {type === 'STAGE' && <>La convention de stage prend fin à la date prévue. Toute rupture anticipée doit être motivée et notifiée à l&apos;établissement de formation.</>}
            {type === 'APPRENTISSAGE' && <>La rupture du contrat d&apos;apprentissage est encadrée par les articles L.6222-18 et suivants du Code du travail.</>}
          </p>
        </section>

        {/* Article final — Acceptation */}
        <section className="article mb-6">
          <h2 className="font-bold text-base mb-1">ARTICLE {essai > 0 ? '10' : '9'} — Acceptation</h2>
          <p className="text-sm leading-relaxed">
            Le présent contrat est établi en deux exemplaires originaux, dont un est remis à chaque partie.
            Le/la Salarié(e) reconnaît avoir reçu un exemplaire signé et avoir pris connaissance de l&apos;intégralité
            de ses clauses.
          </p>
        </section>

        {/* Signatures */}
        <section className="article">
          <p className="text-sm">Fait à <strong>{etablissement.adresse ? extractVille(etablissement.adresse) : '___________________'}</strong>, le <strong>{today}</strong>.</p>
          <div className="grid grid-cols-2 gap-6 mt-6">
            <div className="border-t pt-2">
              <p className="text-sm font-bold">L&apos;Employeur</p>
              <p className="text-xs text-zinc-600">{etablissement.representant || '_________________'}</p>
              <p className="text-[10px] text-zinc-500">Signature précédée de la mention « Lu et approuvé »</p>
              <div className="h-16"></div>
            </div>
            <div className="border-t pt-2">
              <p className="text-sm font-bold">Le/la Salarié(e)</p>
              <p className="text-xs text-zinc-600">{employe.prenom} {employe.nom}</p>
              <p className="text-[10px] text-zinc-500">Signature précédée de la mention « Lu et approuvé »</p>
              <div className="h-16"></div>
            </div>
          </div>
        </section>

        <footer className="border-t mt-6 pt-3 text-[9px] text-zinc-500 text-center">
          Contrat généré automatiquement par App-Restaurant le {today} · Modèle indicatif, à valider avec votre expert-comptable.
        </footer>
      </div>
    </div>
  )
}

function extractVille(adresse: string): string {
  // Extraction naïve : prend le dernier mot après une virgule ou la fin
  const parts = adresse.split(',').map(s => s.trim())
  if (parts.length >= 2) return parts[parts.length - 1].replace(/^\d+\s*/, '')
  const m = adresse.match(/(\d{5})\s+(.+)$/)
  return m ? m[2] : adresse
}
