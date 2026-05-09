'use client'

import { useEffect, useMemo } from 'react'
import { Printer, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

type Props = {
  moisIso: string
  etablissement: { nom: string; adresse: string; siret: string; tva_intra: string }
  ca: {
    nb_commandes: number
    ht: number; tva: number; ttc: number
    ventilation: Array<{ taux: string; montant: number }>
  }
  masseSalariale: {
    employes: Array<{ id: string; prenom: string; nom: string; poste: string; type_contrat: string; heures: number; brut: number; cout_emp: number; avantages: number; total: number }>
    total: number
  }
  chargesFixes: {
    lignes: Array<{ categorie: string; libelle: string; fournisseur: string | null; montant: number }>
    total: number
  }
  zReports: {
    nb: number
    ecart_total: number
    sessions: Array<{ date: string; fond_init: number; fond_final: number; ca_attendu: number; ca_compte: number; ecart: number; fermee: boolean }>
  }
  ndfs: {
    rembourse: number; en_attente: number; total: number
    lignes: Array<{ date: string; employe_nom: string; libelle: string; montant: number; statut: string }>
  }
  synthese: {
    ca_ht: number; tva_a_reverser: number; masse_salariale: number; charges_fixes: number; ndfs: number
    resultat_estime: number
  }
}

export default function BilanClient(p: Props) {
  const router = useRouter()
  const params = useSearchParams()

  const moisLabel = useMemo(
    () => new Date(p.moisIso + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
    [p.moisIso],
  )

  function changerMois(delta: number) {
    const d = new Date(p.moisIso + '-01')
    d.setMonth(d.getMonth() + delta)
    const newMois = d.toISOString().slice(0, 7)
    const sp = new URLSearchParams(params?.toString() ?? '')
    sp.set('mois', newMois)
    router.push(`?${sp.toString()}`)
  }

  // Auto-print on ?print=1
  useEffect(() => {
    if (params?.get('print') === '1') {
      const t = setTimeout(() => { try { window.print() } catch { /* ignore */ } }, 400)
      return () => clearTimeout(t)
    }
  }, [params])

  return (
    <div className="min-h-screen bg-zinc-100 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
          .bilan-section { page-break-inside: avoid; }
          .bilan-table { font-size: 9.5pt; }
          h1 { font-size: 18pt; }
          h2 { font-size: 13pt; margin-top: 8mm; margin-bottom: 2mm; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Toolbar (cachée à l'impression) */}
      <div className="print:hidden sticky top-0 bg-white border-b z-10 px-4 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href="/admin/finances" className="text-sm text-zinc-600 hover:text-zinc-900 inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Finances
          </Link>
          <span className="text-zinc-300">|</span>
          <button onClick={() => changerMois(-1)} className="p-1.5 rounded hover:bg-zinc-100" aria-label="Mois précédent">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-bold capitalize">{moisLabel}</span>
          <button onClick={() => changerMois(1)} className="p-1.5 rounded hover:bg-zinc-100" aria-label="Mois suivant">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
        >
          <Printer className="h-4 w-4" /> Imprimer / Sauver PDF
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-4 md:p-8 bg-white print:p-0 print:shadow-none shadow-md print:my-0 my-4 rounded-md">
        {/* En-tête */}
        <header className="border-b-2 pb-4 mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{p.etablissement.nom}</h1>
              {p.etablissement.adresse && <p className="text-sm text-zinc-600">{p.etablissement.adresse}</p>}
              <p className="text-xs text-zinc-500 mt-1">
                {p.etablissement.siret && <>SIRET : {p.etablissement.siret}</>}
                {p.etablissement.siret && p.etablissement.tva_intra && ' · '}
                {p.etablissement.tva_intra && <>N° TVA : {p.etablissement.tva_intra}</>}
              </p>
            </div>
            <div className="text-right">
              <h2 className="text-lg font-bold capitalize">Bilan comptable</h2>
              <p className="text-base capitalize">{moisLabel}</p>
              <p className="text-[10px] text-zinc-400">Émis le {new Date().toLocaleDateString('fr-FR')}</p>
            </div>
          </div>
        </header>

        {/* Synthèse */}
        <section className="bilan-section mb-6">
          <h2 className="font-bold text-lg mb-2">📊 Synthèse</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <Tile label="CA HT" value={p.synthese.ca_ht} />
            <Tile label="TVA à reverser" value={p.synthese.tva_a_reverser} accent="amber" />
            <Tile label="Masse salariale" value={p.synthese.masse_salariale} accent="red" />
            <Tile label="Charges fixes" value={p.synthese.charges_fixes} accent="red" />
            <Tile label="Notes de frais" value={p.synthese.ndfs} accent="red" />
            <Tile label="Résultat estimé" value={p.synthese.resultat_estime} accent={p.synthese.resultat_estime >= 0 ? 'green' : 'red'} bold />
          </div>
          <p className="text-[11px] text-zinc-500 italic mt-2">
            Résultat = CA HT − masse sal. − charges fixes − notes de frais. Estimation hors charges variables (food cost, commissions CB) et hors charges sociales/impôts.
          </p>
        </section>

        {/* CA & TVA */}
        <section className="bilan-section mb-6">
          <h2 className="font-bold text-lg mb-2">💰 Chiffre d&apos;affaires & TVA</h2>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <Tile label="Commandes encaissées" value={p.ca.nb_commandes} unit="" />
            <Tile label="HT" value={p.ca.ht} />
            <Tile label="TTC" value={p.ca.ttc} />
          </div>
          <table className="w-full text-sm border-collapse bilan-table">
            <thead className="bg-zinc-100">
              <tr><th className="text-left px-2 py-1 border">Taux TVA</th><th className="text-right px-2 py-1 border">TVA collectée</th></tr>
            </thead>
            <tbody>
              {p.ca.ventilation.length === 0 ? (
                <tr><td colSpan={2} className="text-center py-2 text-zinc-500 italic border">Aucune ventilation</td></tr>
              ) : p.ca.ventilation.map(v => (
                <tr key={v.taux}><td className="px-2 py-1 border">{v.taux}%</td><td className="text-right tabular-nums px-2 py-1 border">{eur(v.montant)}</td></tr>
              ))}
              <tr className="bg-zinc-50 font-bold"><td className="px-2 py-1 border">TOTAL</td><td className="text-right tabular-nums px-2 py-1 border">{eur(p.ca.tva)}</td></tr>
            </tbody>
          </table>
        </section>

        {/* Masse salariale */}
        <section className="bilan-section mb-6">
          <h2 className="font-bold text-lg mb-2">👥 Masse salariale (heures pointées × tarif × coef)</h2>
          {p.masseSalariale.employes.length === 0 ? (
            <p className="text-zinc-500 italic text-sm">Aucun employé actif.</p>
          ) : (
            <table className="w-full text-sm border-collapse bilan-table">
              <thead className="bg-zinc-100">
                <tr>
                  <th className="text-left px-2 py-1 border">Employé</th>
                  <th className="text-left px-2 py-1 border">Poste</th>
                  <th className="text-left px-2 py-1 border">Contrat</th>
                  <th className="text-right px-2 py-1 border">Heures</th>
                  <th className="text-right px-2 py-1 border">Brut</th>
                  <th className="text-right px-2 py-1 border">+ Charges</th>
                  <th className="text-right px-2 py-1 border">+ Avantages</th>
                  <th className="text-right px-2 py-1 border">Total mois</th>
                </tr>
              </thead>
              <tbody>
                {p.masseSalariale.employes.map(e => (
                  <tr key={e.id}>
                    <td className="px-2 py-1 border">{e.prenom} {e.nom}</td>
                    <td className="px-2 py-1 border">{e.poste}</td>
                    <td className="px-2 py-1 border">{e.type_contrat}</td>
                    <td className="px-2 py-1 border text-right tabular-nums">{e.heures.toFixed(1)}</td>
                    <td className="px-2 py-1 border text-right tabular-nums">{eur(e.brut)}</td>
                    <td className="px-2 py-1 border text-right tabular-nums">{eur(e.cout_emp - e.brut)}</td>
                    <td className="px-2 py-1 border text-right tabular-nums">{eur(e.avantages)}</td>
                    <td className="px-2 py-1 border text-right tabular-nums font-bold">{eur(e.total)}</td>
                  </tr>
                ))}
                <tr className="bg-zinc-50 font-bold">
                  <td colSpan={7} className="px-2 py-1 border">TOTAL équipe</td>
                  <td className="px-2 py-1 border text-right tabular-nums">{eur(p.masseSalariale.total)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </section>

        {/* Charges fixes */}
        <section className="bilan-section mb-6">
          <h2 className="font-bold text-lg mb-2">🌳 Charges fixes mensuelles</h2>
          {p.chargesFixes.lignes.length === 0 ? (
            <p className="text-zinc-500 italic text-sm">Aucune charge récurrente saisie.</p>
          ) : (
            <table className="w-full text-sm border-collapse bilan-table">
              <thead className="bg-zinc-100">
                <tr>
                  <th className="text-left px-2 py-1 border">Catégorie</th>
                  <th className="text-left px-2 py-1 border">Libellé</th>
                  <th className="text-left px-2 py-1 border">Fournisseur</th>
                  <th className="text-right px-2 py-1 border">Montant</th>
                </tr>
              </thead>
              <tbody>
                {p.chargesFixes.lignes.map((c, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1 border capitalize">{c.categorie}</td>
                    <td className="px-2 py-1 border">{c.libelle}</td>
                    <td className="px-2 py-1 border">{c.fournisseur ?? '—'}</td>
                    <td className="px-2 py-1 border text-right tabular-nums">{eur(c.montant)}</td>
                  </tr>
                ))}
                <tr className="bg-zinc-50 font-bold">
                  <td colSpan={3} className="px-2 py-1 border">TOTAL</td>
                  <td className="px-2 py-1 border text-right tabular-nums">{eur(p.chargesFixes.total)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </section>

        {/* Z-reports */}
        <section className="bilan-section mb-6">
          <h2 className="font-bold text-lg mb-2">🧾 Z-reports caisse ({p.zReports.nb} session{p.zReports.nb > 1 ? 's' : ''})</h2>
          {p.zReports.sessions.length === 0 ? (
            <p className="text-zinc-500 italic text-sm">Aucune session caisse ce mois.</p>
          ) : (
            <table className="w-full text-sm border-collapse bilan-table">
              <thead className="bg-zinc-100">
                <tr>
                  <th className="text-left px-2 py-1 border">Date</th>
                  <th className="text-right px-2 py-1 border">Fond initial</th>
                  <th className="text-right px-2 py-1 border">Fond final</th>
                  <th className="text-right px-2 py-1 border">CA attendu</th>
                  <th className="text-right px-2 py-1 border">CA compté</th>
                  <th className="text-right px-2 py-1 border">Écart</th>
                </tr>
              </thead>
              <tbody>
                {p.zReports.sessions.map(s => (
                  <tr key={s.date}>
                    <td className="px-2 py-1 border">{s.date}</td>
                    <td className="px-2 py-1 border text-right tabular-nums">{eur(s.fond_init)}</td>
                    <td className="px-2 py-1 border text-right tabular-nums">{s.fermee ? eur(s.fond_final) : '—'}</td>
                    <td className="px-2 py-1 border text-right tabular-nums">{eur(s.ca_attendu)}</td>
                    <td className="px-2 py-1 border text-right tabular-nums">{s.fermee ? eur(s.ca_compte) : '—'}</td>
                    <td className={'px-2 py-1 border text-right tabular-nums ' + (Math.abs(s.ecart) > 5 ? 'text-red-700 font-bold' : '')}>{s.fermee ? eur(s.ecart) : '—'}</td>
                  </tr>
                ))}
                <tr className="bg-zinc-50 font-bold">
                  <td colSpan={5} className="px-2 py-1 border">Écart cumulé du mois</td>
                  <td className={'px-2 py-1 border text-right tabular-nums ' + (Math.abs(p.zReports.ecart_total) > 50 ? 'text-red-700' : '')}>{eur(p.zReports.ecart_total)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </section>

        {/* Notes de frais */}
        {p.ndfs.lignes.length > 0 && (
          <section className="bilan-section mb-6">
            <h2 className="font-bold text-lg mb-2">📋 Notes de frais ({eur(p.ndfs.total)} dont remboursé {eur(p.ndfs.rembourse)})</h2>
            <table className="w-full text-sm border-collapse bilan-table">
              <thead className="bg-zinc-100">
                <tr>
                  <th className="text-left px-2 py-1 border">Date</th>
                  <th className="text-left px-2 py-1 border">Employé</th>
                  <th className="text-left px-2 py-1 border">Libellé</th>
                  <th className="text-right px-2 py-1 border">Montant</th>
                  <th className="text-left px-2 py-1 border">Statut</th>
                </tr>
              </thead>
              <tbody>
                {p.ndfs.lignes.map((n, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1 border">{n.date}</td>
                    <td className="px-2 py-1 border">{n.employe_nom}</td>
                    <td className="px-2 py-1 border">{n.libelle}</td>
                    <td className="px-2 py-1 border text-right tabular-nums">{eur(n.montant)}</td>
                    <td className="px-2 py-1 border capitalize">{n.statut}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Pied */}
        <footer className="border-t pt-3 text-[10px] text-zinc-500">
          Document généré automatiquement par App-Restaurant. Données extraites en temps réel depuis la base de production.
          {' '}Document à archiver pour la comptabilité (durée légale : 10 ans).
        </footer>
      </div>
    </div>
  )
}

function Tile({ label, value, accent = 'default', bold = false, unit = '€' }: { label: string; value: number; accent?: 'default' | 'green' | 'red' | 'amber'; bold?: boolean; unit?: string }) {
  const cls = {
    default: 'bg-zinc-100 border-zinc-200',
    green:   'bg-emerald-100 border-emerald-300',
    red:     'bg-red-100 border-red-300',
    amber:   'bg-amber-100 border-amber-300',
  }[accent]
  return (
    <div className={'rounded-md border p-2 ' + cls}>
      <p className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</p>
      <p className={'text-base tabular-nums ' + (bold ? 'font-black' : 'font-bold')}>
        {unit === '€' ? eur(value) : `${value} ${unit}`}
      </p>
    </div>
  )
}

function eur(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}
