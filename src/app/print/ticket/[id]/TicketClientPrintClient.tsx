'use client'

import { useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { fmtPrix } from '@/lib/service'
import type { TicketData } from './types'

const METHODES_LABEL: Record<string, string> = {
  especes:      'ESPÈCES',
  carte:        'CARTE BANCAIRE',
  ticket_resto: 'TICKET RESTO',
  virement:     'VIREMENT',
  autre:        'AUTRE',
}

export default function TicketClientPrintClient({
  data, auto,
}: {
  data: TicketData
  auto: boolean
}) {
  useEffect(() => {
    if (!auto) return
    const t = setTimeout(() => { try { window.print() } catch { /* ignore */ } }, 250)
    return () => clearTimeout(t)
  }, [auto])

  const { commande, articles, paiements, etablissement } = data
  const totalHT  = commande.montant_total_ht
  const totalTVA = commande.tva_total
  const totalTTC = commande.montant_total_ttc || (totalHT + totalTVA)
  const ventilation = commande.ventilation_tva ?? {}
  // Détaille HT par taux pour la ligne TVA
  const htParTaux: Record<string, number> = {}
  for (const a of articles) {
    const k = String(a.tva_taux)
    htParTaux[k] = (htParTaux[k] ?? 0) + a.quantite * a.prix_unitaire_ht
  }
  const totalPaye  = paiements.reduce((s, p) => s + p.montant, 0)
  const totalTips  = paiements.reduce((s, p) => s + p.pourboire, 0)
  const isEncaisse = commande.statut === 'encaisse' || paiements.length > 0
  const enHaut = format(parseISO(commande.created_at), 'EEEE d MMM yyyy · HH:mm', { locale: fr })

  return (
    <div className="bg-zinc-100 min-h-screen text-zinc-900 print:bg-white">
      <style>{`
        @media screen {
          .ticket { margin: 1.25rem auto; box-shadow: 0 4px 16px rgba(0,0,0,.12); }
        }
        @media print {
          @page { size: 80mm auto; margin: 3mm; }
          html, body { background: white; }
          .no-print { display: none !important; }
          .ticket { box-shadow: none; margin: 0; }
        }
      `}</style>

      {/* Toolbar à l'écran uniquement */}
      <div className="no-print sticky top-0 bg-white border-b border-zinc-200 px-4 py-2 flex items-center justify-between gap-2 z-10">
        <button
          onClick={() => window.history.back()}
          className="h-10 px-4 rounded-md border border-zinc-300 bg-white hover:bg-zinc-50 text-sm font-semibold"
        >← Retour</button>
        <div className="text-sm text-zinc-600">
          Ticket <b className="font-mono">{commande.numero}</b>
        </div>
        <button
          onClick={() => window.print()}
          className="h-10 px-4 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold"
        >🖨 Imprimer</button>
      </div>

      <div className="py-4">
        <article
          className="ticket bg-white px-3 py-3 font-mono text-[12px] leading-tight text-zinc-900"
          style={{ width: '74mm' }}
        >
          {/* En-tête établissement */}
          <header className="text-center pb-2">
            <div className="text-base font-black uppercase tracking-wide">
              {etablissement.etablissement_nom || 'Établissement'}
            </div>
            {etablissement.etablissement_adresse && (
              <div className="text-[11px] whitespace-pre-line mt-0.5">{etablissement.etablissement_adresse}</div>
            )}
            {etablissement.etablissement_telephone && (
              <div className="text-[11px]">Tél : {etablissement.etablissement_telephone}</div>
            )}
            {etablissement.etablissement_siret && (
              <div className="text-[10px] mt-0.5">SIRET : {etablissement.etablissement_siret}</div>
            )}
            {etablissement.etablissement_tva_intra && (
              <div className="text-[10px]">TVA : {etablissement.etablissement_tva_intra}</div>
            )}
          </header>

          <div className="border-t-2 border-dashed border-zinc-900 my-1.5" />

          {/* Méta commande */}
          <div className="text-[11px] capitalize text-center">{enHaut}</div>
          <div className="flex justify-between text-[11px] mt-1">
            <span>Ticket : <b className="font-mono">{commande.numero}</b></span>
            {commande.numero_table && <span>Table <b>T{commande.numero_table}</b></span>}
          </div>
          {commande.serveur_nom && (
            <div className="text-[11px]">Serveur : <b>{commande.serveur_nom}</b></div>
          )}

          <div className="border-t-2 border-dashed border-zinc-900 my-1.5" />

          {/* Articles */}
          <table className="w-full text-[11px]">
            <tbody>
              {articles.map(a => {
                const lineHT = a.quantite * a.prix_unitaire_ht
                return (
                  <tr key={a.id} className="align-top">
                    <td className="pr-1.5 tabular-nums w-6">{a.quantite}×</td>
                    <td className="pr-1.5">{a.recette_nom}</td>
                    <td className="text-right tabular-nums whitespace-nowrap">{fmtPrix(lineHT)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="border-t-2 border-dashed border-zinc-900 my-1.5" />

          {/* Totaux */}
          <div className="space-y-0.5 text-[11px]">
            <div className="flex justify-between text-[10px] text-zinc-600">
              <span>Mode</span>
              <span>{commande.consommation === 'sur_place' ? '🍽 Sur place' : '🥡 À emporter'}</span>
            </div>
            <div className="flex justify-between">
              <span>Total HT</span>
              <span className="tabular-nums">{fmtPrix(totalHT)}</span>
            </div>

            {/* Ventilation TVA par taux */}
            {Object.keys(ventilation).length > 0 ? (
              <>
                {Object.entries(ventilation).sort((a, b) => Number(a[0]) - Number(b[0])).map(([taux, montant]) => (
                  <div key={taux} className="flex justify-between text-[10px]">
                    <span>TVA {Number(taux).toFixed(taux === '5.5' ? 1 : 0)}% (HT {fmtPrix(htParTaux[taux] ?? 0)})</span>
                    <span className="tabular-nums">{fmtPrix(Number(montant))}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold">
                  <span>Total TVA</span>
                  <span className="tabular-nums">{fmtPrix(totalTVA)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <span>TVA</span>
                <span className="tabular-nums">{fmtPrix(totalTVA)}</span>
              </div>
            )}

            <div className="flex justify-between text-base font-black border-t border-zinc-900 pt-1 mt-0.5">
              <span>TOTAL TTC</span>
              <span className="tabular-nums">{fmtPrix(totalTTC)}</span>
            </div>
          </div>

          {/* Paiements (si encaissée) */}
          {paiements.length > 0 && (
            <>
              <div className="border-t-2 border-dashed border-zinc-900 my-1.5" />
              <div className="text-[11px] uppercase font-bold mb-0.5">Règlement</div>
              <div className="space-y-0.5 text-[11px]">
                {paiements.map(p => {
                  const meth = METHODES_LABEL[p.methode] ?? p.methode.toUpperCase()
                  return (
                    <div key={p.id}>
                      <div className="flex justify-between">
                        <span>{meth}</span>
                        <span className="tabular-nums">{fmtPrix(p.montant)}</span>
                      </div>
                      {p.pourboire > 0 && (
                        <div className="flex justify-between text-[10px] text-zinc-700 pl-2">
                          <span>· dont pourboire</span>
                          <span className="tabular-nums">{fmtPrix(p.pourboire)}</span>
                        </div>
                      )}
                      {p.reference && (
                        <div className="text-[10px] text-zinc-700 pl-2">réf. {p.reference}</div>
                      )}
                    </div>
                  )
                })}
                {totalTips > 0 && (
                  <div className="flex justify-between border-t border-zinc-400 pt-0.5 mt-0.5 text-[11px] font-bold">
                    <span>Pourboires inclus</span>
                    <span className="tabular-nums">{fmtPrix(totalTips)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[11px] font-bold border-t border-zinc-900 pt-0.5 mt-0.5">
                  <span>Total réglé</span>
                  <span className="tabular-nums">{fmtPrix(totalPaye)}</span>
                </div>
              </div>
            </>
          )}

          <div className="border-t-2 border-dashed border-zinc-900 my-1.5" />

          {/* Bandeau fidélité (si commande couplée à un client) */}
          {commande.client_id && commande.points_credites !== null && commande.points_credites > 0 && (
            <div className="text-center text-[10px] border border-zinc-900 rounded p-2 mb-1.5">
              <p className="font-bold">⭐ +{commande.points_credites} points fidélité crédités</p>
              <p className="text-[9px] text-zinc-700">
                Consultez votre solde et historique :
              </p>
              <p className="text-[9px] font-mono break-all mt-0.5">
                /client/{commande.client_id}
              </p>
            </div>
          )}

          {/* Pied */}
          <footer className="text-center text-[10px] space-y-0.5">
            {isEncaisse ? (
              <p className="font-bold">✓ Merci de votre visite !</p>
            ) : (
              <p className="font-bold uppercase">⏳ Note non réglée — pour information</p>
            )}
            <p className="text-[9px] text-zinc-600">
              Imprimé le {format(new Date(), 'dd/MM/yyyy à HH:mm', { locale: fr })}
            </p>
            <p className="text-[9px] text-zinc-600">Document non fiscal</p>
          </footer>
        </article>
      </div>
    </div>
  )
}
