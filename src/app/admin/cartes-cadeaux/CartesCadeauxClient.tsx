'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Copy, Check, Search, X, History } from 'lucide-react'
import { PillTab } from '@/components/ui/PillTab'
import EmptyState from '@/components/ui/EmptyState'
import { creerCarteCadeau, annulerCarteCadeau, crediterCarteCadeau, supprimerCarteCadeau } from './actions'
import { createClient } from '@/lib/supabase/client'
import type { CarteCadeau, MouvementCarte } from './page'

const fmtPrix = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
const fmtDate = (iso: string | null) => iso
  ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  : '—'

function genererCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = 'GIFT-'
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

const STATUT_INFO: Record<CarteCadeau['statut'], { label: string; cls: string }> = {
  active:   { label: 'active',   cls: 'bg-emerald-500 text-white' },
  utilisee: { label: 'utilisée', cls: 'bg-zinc-100 text-zinc-700 border-zinc-300' },
  expiree:  { label: 'expirée',  cls: 'bg-red-100 text-red-800 border-red-300' },
  annulee:  { label: 'annulée',  cls: 'bg-zinc-200 text-zinc-600 border-zinc-300' },
}

export default function CartesCadeauxClient({ cartes }: { cartes: CarteCadeau[] }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [confirmDel, setConfirmDel] = useState<CarteCadeau | null>(null)
  const [annuler, setAnnuler] = useState<CarteCadeau | null>(null)
  const [crediter, setCrediter] = useState<CarteCadeau | null>(null)
  const [showHistory, setShowHistory] = useState<CarteCadeau | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filtreStatut, setFiltreStatut] = useState<'tous' | CarteCadeau['statut']>('tous')
  const [erreur, setErreur] = useState('')
  const [, startTransition] = useTransition()

  const filtered = cartes.filter(c => {
    if (filtreStatut !== 'tous' && c.statut !== filtreStatut) return false
    if (search.trim().length >= 2) {
      const q = search.toLowerCase()
      return c.code.toLowerCase().includes(q) ||
             (c.acheteur_nom ?? '').toLowerCase().includes(q) ||
             (c.acheteur_email ?? '').toLowerCase().includes(q) ||
             (c.beneficiaire_nom ?? '').toLowerCase().includes(q) ||
             (c.beneficiaire_email ?? '').toLowerCase().includes(q)
    }
    return true
  })

  const totalEmis = cartes.reduce((s, c) => s + c.montant_initial, 0)
  const totalRestant = cartes.filter(c => c.statut === 'active').reduce((s, c) => s + c.montant_restant, 0)
  const nbActives = cartes.filter(c => c.statut === 'active').length

  function copier(c: CarteCadeau) {
    navigator.clipboard.writeText(c.code).catch(() => {})
    setCopiedId(c.id)
    setTimeout(() => setCopiedId(null), 1800)
  }

  function exec(action: () => Promise<void>) {
    setErreur('')
    startTransition(async () => {
      try {
        await action()
        router.refresh()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
        aria-hidden
      />

      <main className="relative max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6">
        <AdminPageHeader
          accent="rose"
          subtitle="Clientèle"
          title="Cartes cadeaux"
          description={`${nbActives} active${nbActives > 1 ? 's' : ''} · ${fmtPrix(totalRestant)} de solde restant · ${fmtPrix(totalEmis)} émis au total.`}
          actions={
            <Button onClick={() => setCreating(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Émettre une carte
            </Button>
          }
        />


      <Card className="p-4 bg-pink-50 border-pink-200">
        <p className="text-xs uppercase tracking-wider text-pink-700 font-bold mb-2">🎁 Comment ça marche</p>
        <ul className="text-sm text-pink-900 space-y-1">
          <li>• <strong>Émission manuelle ici</strong> : pour cadeau staff, événement, sponsoring, geste commercial</li>
          <li>• <strong>Vente en ligne future</strong> : le client achètera ses cartes directement via le site (Phase 3)</li>
          <li>• <strong>Utilisation</strong> : à l&apos;encaissement (sur place ou en ligne) — débit auto du solde</li>
          <li>• <strong>Annulation</strong> : remet le solde à 0 + crée un mouvement de remboursement (audit comptable)</li>
        </ul>
      </Card>

      {/* Filtres premium tactile */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
            <Input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Code, acheteur, bénéficiaire…"
              className="pl-8 h-11"
            />
          </div>
          <span className="text-xs text-zinc-500 ml-auto">{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
          <PillTab small active={filtreStatut === 'tous'}     onClick={() => setFiltreStatut('tous')}>Tous</PillTab>
          <PillTab small active={filtreStatut === 'active'}   onClick={() => setFiltreStatut('active')}>✓ Actives</PillTab>
          <PillTab small active={filtreStatut === 'utilisee'} onClick={() => setFiltreStatut('utilisee')}>💳 Utilisées</PillTab>
          <PillTab small active={filtreStatut === 'expiree'}  onClick={() => setFiltreStatut('expiree')}>⏰ Expirées</PillTab>
          <PillTab small active={filtreStatut === 'annulee'}  onClick={() => setFiltreStatut('annulee')}>🚫 Annulées</PillTab>
        </div>
      </div>

      {erreur && <Card className="p-3 bg-red-50 border-red-200 text-sm text-red-700">⚠️ {erreur}</Card>}

      {filtered.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            emoji="🎁"
            titre="Aucune carte cadeau"
            description="Émets ta première carte cadeau pour gâter un client, récompenser le staff ou faire un geste commercial."
            action={{ label: '+ Émettre une carte', onClick: () => setCreating(true) }}
          />
        </Card>
      ) : (
        <>
        {/* Mobile : liste de cards (table 8 colonnes illisible à 375px) */}
        <ul className="md:hidden divide-y divide-zinc-100">
          {filtered.map(c => {
            const ratio = c.montant_initial > 0 ? c.montant_restant / c.montant_initial : 0
            const expiree = c.date_validite_fin && new Date(c.date_validite_fin) < new Date()
            return (
              <li key={c.id} className="py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="font-mono font-bold">{c.code}</code>
                      <button onClick={() => copier(c)} className="text-zinc-400 hover:text-emerald-600">
                        {copiedId === c.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap mt-1">
                      <Badge variant="outline" className={STATUT_INFO[c.statut].cls + ' text-[10px]'}>
                        {STATUT_INFO[c.statut].label}
                      </Badge>
                      {expiree && c.statut === 'active' && (
                        <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300 text-[10px]">expirée</Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold tabular-nums">{fmtPrix(c.montant_restant)}</p>
                    <p className="text-[10px] text-zinc-500">/ {fmtPrix(c.montant_initial)}</p>
                    <div className="h-1 bg-zinc-200 rounded mt-0.5 w-20 ml-auto">
                      <div className="h-full bg-pink-500 rounded" style={{ width: `${ratio * 100}%` }} />
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-500">
                  {c.beneficiaire_nom && <>👤 {c.beneficiaire_nom} · </>}
                  Émise {fmtDate(c.date_emission)}
                  {c.date_validite_fin ? <> · jusqu&apos;au {fmtDate(c.date_validite_fin)}</> : <> · ∞</>}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setShowHistory(c)} className="min-h-[44px] min-w-[44px]" title="Historique">
                    <History className="h-4 w-4" />
                  </Button>
                  {c.statut === 'active' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setCrediter(c)} className="min-h-[44px] px-3 text-sm">
                        + Créditer
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setAnnuler(c)} className="min-h-[44px] px-3 text-sm text-red-600">
                        Annuler
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDel(c)} className="min-h-[44px] min-w-[44px] text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>

        {/* Desktop/tablette : table complète */}
        <div className="hidden md:block overflow-x-auto">
          <table className="hidden md:table w-full text-sm">
            <thead className="text-xs text-zinc-500 uppercase border-b border-zinc-200">
              <tr>
                <th className="text-left py-2">Code</th>
                <th className="text-left">Statut</th>
                <th className="text-right">Solde</th>
                <th className="text-left">Bénéficiaire</th>
                <th className="text-left">Acheteur</th>
                <th className="text-left">Émission</th>
                <th className="text-left">Validité</th>
                <th className="text-right"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const ratio = c.montant_initial > 0 ? c.montant_restant / c.montant_initial : 0
                const expiree = c.date_validite_fin && new Date(c.date_validite_fin) < new Date()
                return (
                  <tr key={c.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <code className="font-mono font-bold">{c.code}</code>
                        <button onClick={() => copier(c)} className="text-zinc-400 hover:text-emerald-600">
                          {copiedId === c.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                    <td>
                      <Badge variant="outline" className={STATUT_INFO[c.statut].cls + ' text-[10px]'}>
                        {STATUT_INFO[c.statut].label}
                      </Badge>
                      {expiree && c.statut === 'active' && (
                        <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300 text-[10px] ml-1">expirée</Badge>
                      )}
                    </td>
                    <td className="text-right">
                      <p className="font-bold tabular-nums">{fmtPrix(c.montant_restant)}</p>
                      <p className="text-[10px] text-zinc-500">/ {fmtPrix(c.montant_initial)}</p>
                      <div className="h-1 bg-zinc-200 rounded mt-0.5 w-20 ml-auto">
                        <div className="h-full bg-pink-500 rounded" style={{ width: `${ratio * 100}%` }} />
                      </div>
                    </td>
                    <td>
                      {c.beneficiaire_nom ? (
                        <>
                          <p className="font-medium">{c.beneficiaire_nom}</p>
                          {c.beneficiaire_email && <p className="text-[11px] text-zinc-500">{c.beneficiaire_email}</p>}
                        </>
                      ) : <span className="text-zinc-400">—</span>}
                    </td>
                    <td>
                      {c.acheteur_nom ? (
                        <>
                          <p>{c.acheteur_nom}</p>
                          {c.acheteur_email && <p className="text-[11px] text-zinc-500">{c.acheteur_email}</p>}
                        </>
                      ) : <span className="text-zinc-400 text-xs">— admin</span>}
                    </td>
                    <td className="text-xs">{fmtDate(c.date_emission)}</td>
                    <td className="text-xs">{c.date_validite_fin ? fmtDate(c.date_validite_fin) : <span className="text-zinc-400">∞</span>}</td>
                    <td className="text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setShowHistory(c)} className="min-h-[44px] min-w-[44px]" title="Historique">
                          <History className="h-4 w-4" />
                        </Button>
                        {c.statut === 'active' && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setCrediter(c)} className="min-h-[44px] px-3 text-sm">
                              + Créditer
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setAnnuler(c)} className="min-h-[44px] px-3 text-sm text-red-600">
                              Annuler
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDel(c)} className="min-h-[44px] min-w-[44px] text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {creating && <CreerModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); router.refresh() }} />}

      {annuler && (
        <ActionTextareaModal
          title={`Annuler la carte « ${annuler.code} » ?`}
          description={`Le solde restant (${fmtPrix(annuler.montant_restant)}) sera mis à zéro et un mouvement de remboursement créé.`}
          inputLabel="Motif d'annulation"
          inputPlaceholder="Ex : Demande client, paiement échoué, fraude…"
          confirmLabel="Annuler la carte"
          onClose={() => setAnnuler(null)}
          onConfirm={(motif) => exec(async () => { await annulerCarteCadeau(annuler.id, motif); setAnnuler(null) })}
        />
      )}

      {crediter && (
        <CrediterModal
          carte={crediter}
          onClose={() => setCrediter(null)}
          onSaved={() => { setCrediter(null); router.refresh() }}
        />
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirmDel(null)}>
          <Card className="max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <p className="font-bold mb-1">Supprimer la carte « {confirmDel.code} » ?</p>
            <p className="text-sm text-zinc-600 mb-3">
              ⚠️ Préfère « Annuler » pour garder la trace comptable. Suppression = irréversible.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmDel(null)} className="flex-1">Garder</Button>
              <Button onClick={() => exec(async () => { await supprimerCarteCadeau(confirmDel.id); setConfirmDel(null) })} className="flex-1 bg-red-600 hover:bg-red-700">
                Supprimer
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showHistory && <HistoryModal carte={showHistory} onClose={() => setShowHistory(null)} />}
      </main>
    </div>
  )
}

// ─── Modal création ──────────────────────────────────────────
function CreerModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(genererCode())
  const [montant, setMontant] = useState('50')
  const [acheteurNom, setAcheteurNom] = useState('')
  const [acheteurEmail, setAcheteurEmail] = useState('')
  const [beneficiaireNom, setBeneficiaireNom] = useState('')
  const [beneficiaireEmail, setBeneficiaireEmail] = useState('')
  const [message, setMessage] = useState('')
  const [validite, setValidite] = useState('')
  const [erreur, setErreur] = useState('')
  const [isPending, startTransition] = useTransition()

  function valider() {
    if (!montant || Number(montant) <= 0) { setErreur('Montant > 0 obligatoire'); return }
    setErreur('')
    startTransition(async () => {
      try {
        await creerCarteCadeau({
          code: code.trim().toUpperCase(),
          montant_initial: Number(montant),
          acheteur_nom: acheteurNom.trim() || null,
          acheteur_email: acheteurEmail.trim() || null,
          beneficiaire_nom: beneficiaireNom.trim() || null,
          beneficiaire_email: beneficiaireEmail.trim() || null,
          message_personnel: message.trim() || null,
          date_validite_fin: validite || null,
        })
        onSaved()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <Card className="max-w-lg w-full p-5 my-8" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">Émettre une carte cadeau</h2>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium block mb-1">Code *</label>
            <div className="flex gap-2">
              <Input
                type="text"
                maxLength={40}
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                className="font-mono uppercase"
              />
              <Button type="button" variant="outline" onClick={() => setCode(genererCode())}>
                🎲 Aléa
              </Button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Montant (€) *</label>
            <Input
              type="number"
              step="5"
              min="1"
              value={montant}
              onChange={e => setMontant(e.target.value)}
            />
          </div>

          <div className="border-t pt-3">
            <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-2">Bénéficiaire (optionnel)</p>
            <div className="grid grid-cols-2 gap-2">
              <Input type="text" maxLength={160} placeholder="Nom" value={beneficiaireNom} onChange={e => setBeneficiaireNom(e.target.value)} />
              <Input type="email" maxLength={160} placeholder="Email" value={beneficiaireEmail} onChange={e => setBeneficiaireEmail(e.target.value)} />
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-2">Acheteur (optionnel)</p>
            <div className="grid grid-cols-2 gap-2">
              <Input type="text" maxLength={160} placeholder="Nom" value={acheteurNom} onChange={e => setAcheteurNom(e.target.value)} />
              <Input type="email" maxLength={160} placeholder="Email" value={acheteurEmail} onChange={e => setAcheteurEmail(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Message personnel (optionnel)</label>
            <Textarea
              rows={2}
              maxLength={1000}
              placeholder="Ex : Joyeux anniversaire ! 🎂"
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Date validité fin (optionnel)</label>
            <Input type="date" value={validite} onChange={e => setValidite(e.target.value)} />
            <p className="text-[11px] text-zinc-500 mt-0.5">Vide = pas de date d&apos;expiration</p>
          </div>

          {erreur && <p className="text-sm text-red-600">⚠️ {erreur}</p>}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={isPending} className="flex-1">Annuler</Button>
            <Button onClick={valider} disabled={isPending} className="flex-[2]">
              {isPending ? 'Création…' : 'Émettre la carte'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ─── Modal annuler / créditer (avec textarea motif) ──────────
function ActionTextareaModal({
  title, description, inputLabel, inputPlaceholder, confirmLabel, onClose, onConfirm,
}: {
  title: string
  description: string
  inputLabel: string
  inputPlaceholder: string
  confirmLabel: string
  onClose: () => void
  onConfirm: (motif: string) => void
}) {
  const [motif, setMotif] = useState('')
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
        <p className="font-bold mb-1">{title}</p>
        <p className="text-sm text-zinc-600 mb-3">{description}</p>
        <label className="text-xs font-medium block mb-1">{inputLabel}</label>
        <Textarea rows={2} placeholder={inputPlaceholder} value={motif} onChange={e => setMotif(e.target.value)} />
        <div className="flex gap-2 mt-3">
          <Button variant="outline" onClick={onClose} className="flex-1">Annuler</Button>
          <Button onClick={() => onConfirm(motif)} className="flex-1 bg-red-600 hover:bg-red-700">{confirmLabel}</Button>
        </div>
      </Card>
    </div>
  )
}

function CrediterModal({ carte, onClose, onSaved }: { carte: CarteCadeau; onClose: () => void; onSaved: () => void }) {
  const [montant, setMontant] = useState('')
  const [motif, setMotif] = useState('')
  const [erreur, setErreur] = useState('')
  const [isPending, startTransition] = useTransition()

  function valider() {
    if (!montant || Number(montant) <= 0) { setErreur('Montant > 0'); return }
    setErreur('')
    startTransition(async () => {
      try {
        await crediterCarteCadeau(carte.id, Number(montant), motif)
        onSaved()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
        <p className="font-bold mb-1">Créditer la carte « {carte.code} »</p>
        <p className="text-sm text-zinc-600 mb-3">Solde actuel : {fmtPrix(carte.montant_restant)}</p>
        <label className="text-xs font-medium block mb-1">Montant à ajouter (€) *</label>
        <Input type="number" step="5" min="1" value={montant} onChange={e => setMontant(e.target.value)} />
        <label className="text-xs font-medium block mb-1 mt-2">Motif</label>
        <Textarea rows={2} placeholder="Ex : Geste commercial suite réclamation" value={motif} onChange={e => setMotif(e.target.value)} />
        {erreur && <p className="text-sm text-red-600 mt-2">⚠️ {erreur}</p>}
        <div className="flex gap-2 mt-3">
          <Button variant="outline" onClick={onClose} disabled={isPending} className="flex-1">Annuler</Button>
          <Button onClick={valider} disabled={isPending || !montant} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
            {isPending ? 'Crédit…' : 'Créditer'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

// ─── Modal historique mouvements (fetch côté client à l'ouverture) ──
function HistoryModal({ carte, onClose }: { carte: CarteCadeau; onClose: () => void }) {
  const [mouvements, setMouvements] = useState<MouvementCarte[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sb = createClient()
    sb.from('mouvements_cartes_cadeaux')
      .select('*')
      .eq('carte_cadeau_id', carte.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setMouvements((data ?? []).map(m => ({
          id: m.id as string,
          carte_cadeau_id: m.carte_cadeau_id as string,
          type: m.type as MouvementCarte['type'],
          montant: Number(m.montant),
          commande_id: (m.commande_id as string) ?? null,
          motif: (m.motif as string) ?? null,
          created_at: m.created_at as string,
        })))
        setLoading(false)
      })
  }, [carte.id])

  const TYPE_INFO: Record<MouvementCarte['type'], { label: string; cls: string }> = {
    achat:         { label: '➕ Achat / crédit',  cls: 'text-emerald-700' },
    utilisation:   { label: '➖ Utilisation',      cls: 'text-amber-700' },
    remboursement: { label: '↩️ Remboursement',    cls: 'text-zinc-700' },
    expiration:    { label: '⌛ Expiration',       cls: 'text-red-700' },
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="max-w-md w-full p-5 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="font-bold">Historique « {carte.code} »</p>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <p className="text-sm text-zinc-500 text-center py-4">Chargement…</p>
          ) : mouvements.length === 0 ? (
            <EmptyState
              emoji="📜"
              titre="Aucun mouvement"
              description="Les crédits, utilisations et remboursements de cette carte apparaîtront ici au fil de son usage."
            />
          ) : (
            <ul className="divide-y divide-zinc-100">
              {mouvements.map(m => (
                <li key={m.id} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm ${TYPE_INFO[m.type].cls}`}>{TYPE_INFO[m.type].label}</span>
                    <span className={`font-bold tabular-nums ${m.montant > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {m.montant > 0 ? '+' : ''}{fmtPrix(m.montant)}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    {fmtDate(m.created_at)}
                    {m.motif && ` · ${m.motif}`}
                    {m.commande_id && ` · cmd #${m.commande_id.slice(-6)}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}
