'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Copy, Check } from 'lucide-react'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import EmptyState from '@/components/ui/EmptyState'
import { creerCodePromo, modifierCodePromo, toggleCodePromo, supprimerCodePromo } from './actions'
import type { CodePromo } from './page'
import { NIVEAU_INFO, type NiveauFidelite } from '@/lib/clients'

const todayISO = () => new Date().toISOString().slice(0, 10)
const fmtDate = (iso: string | null) => iso
  ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  : '—'

// Génère un code aléatoire lisible (sans 0/O/1/I pour éviter confusion)
function genererCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

const NIVEAUX: Array<NiveauFidelite> = ['standard','bronze','argent','or','platine']

export default function CodesPromoClient({ codes }: { codes: CodePromo[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<CodePromo | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDel, setConfirmDel] = useState<CodePromo | null>(null)
  const [erreur, setErreur] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const today = todayISO()
  const actifsAujourdhui = codes.filter(c => {
    if (!c.actif) return false
    if (c.date_debut > today) return false
    if (c.date_fin && c.date_fin < today) return false
    if (c.usage_max && c.usage_actuel >= c.usage_max) return false
    return true
  })

  function copier(c: CodePromo) {
    navigator.clipboard.writeText(c.code).catch(() => {})
    setCopiedId(c.id)
    setTimeout(() => setCopiedId(null), 1800)
  }

  function toggle(c: CodePromo) {
    setErreur('')
    startTransition(async () => {
      try {
        await toggleCodePromo(c.id, !c.actif)
        router.refresh()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  function supprimer() {
    if (!confirmDel) return
    setErreur('')
    startTransition(async () => {
      try {
        await supprimerCodePromo(confirmDel.id)
        setConfirmDel(null)
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
          accent="emerald"
          subtitle="Clientèle"
          title="Codes promo"
          description={`Réductions commande/réservation en ligne · ${actifsAujourdhui.length} utilisable${actifsAujourdhui.length > 1 ? 's' : ''} aujourd'hui.`}
          actions={
            <Button onClick={() => setCreating(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Nouveau code promo
            </Button>
          }
        />

      <Card className="p-4 bg-amber-50 border-amber-200">
        <p className="text-xs uppercase tracking-wider text-amber-700 font-bold mb-2">🎟 Comment ça marche</p>
        <ul className="text-sm text-amber-900 space-y-1">
          <li>• Le client saisit le code au panier en ligne → réduction calculée auto (% ou € fixe)</li>
          <li>• <strong>Conditions vérifiées</strong> : dates, usage max, panier &gt; montant min, niveau fidélité requis</li>
          <li>• Tu peux <strong>réserver un code à un palier fidélité</strong> (ex: réservé Or et Platine pour fidéliser les VIP)</li>
        </ul>
      </Card>

      {erreur && (
        <Card className="p-3 bg-red-50 border-red-200 text-sm text-red-700">⚠️ {erreur}</Card>
      )}

      {codes.length === 0 ? (
        <EmptyState
          emoji="🏷️"
          titre="Aucun code promo"
          description="Crée ton premier code promo pour offrir une réduction au panier en ligne et lancer une campagne."
          action={{ label: '+ Nouveau code promo', onClick: () => setCreating(true) }}
        />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {codes.map(c => {
            const futur = c.date_debut > today
            const passe = c.date_fin && c.date_fin < today
            const epuise = c.usage_max !== null && c.usage_actuel >= c.usage_max
            const utilisable = c.actif && !futur && !passe && !epuise
            const progression = c.usage_max ? Math.min(100, (c.usage_actuel / c.usage_max) * 100) : 0
            const niveauKey = c.reserve_fidelite_niveau as NiveauFidelite | null
            const niveauInfo = niveauKey ? NIVEAU_INFO[niveauKey] : null

            return (
              <Card key={c.id} className={`p-4 ${!c.actif ? 'opacity-60' : ''}`}>
                {/* Code en gros + bouton copier */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <code className="text-lg font-bold tracking-wider bg-zinc-100 px-2 py-1 rounded border-2 border-dashed border-zinc-400">
                      {c.code}
                    </code>
                    <button onClick={() => copier(c)} className="text-zinc-500 hover:text-emerald-600" title="Copier">
                      {copiedId === c.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  <div>
                    {utilisable && <Badge className="bg-emerald-500 text-white">utilisable</Badge>}
                    {!c.actif && <Badge variant="secondary">inactif</Badge>}
                    {c.actif && futur && <Badge className="bg-blue-100 text-blue-800 border-blue-300">à venir</Badge>}
                    {c.actif && passe && <Badge className="bg-zinc-100 text-zinc-600 border-zinc-300">expiré</Badge>}
                    {c.actif && epuise && <Badge className="bg-red-100 text-red-800 border-red-300">épuisé</Badge>}
                  </div>
                </div>

                {/* Réduction en gros */}
                <div className="text-2xl font-bold text-amber-700 mb-2">
                  {c.type === 'pourcentage' ? `-${c.valeur}%` : `-${c.valeur.toFixed(2)} €`}
                  {c.montant_min > 0 && (
                    <span className="text-xs text-zinc-500 font-normal ml-2">dès {c.montant_min.toFixed(0)} € de commande</span>
                  )}
                </div>

                {c.description && (
                  <p className="text-xs text-zinc-600 mb-2 line-clamp-2">{c.description}</p>
                )}

                {/* Validité */}
                <p className="text-[11px] text-zinc-500 mb-2">
                  📅 {fmtDate(c.date_debut)} {c.date_fin ? `→ ${fmtDate(c.date_fin)}` : '→ ∞'}
                </p>

                {/* Niveau fidélité réservé */}
                {niveauInfo && (
                  <Badge variant="outline" className={niveauInfo.cls + ' text-[10px] mb-2'}>
                    Réservé {niveauInfo.emoji} {niveauInfo.label}+
                  </Badge>
                )}

                {/* Usage */}
                <div className="text-xs mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-zinc-600">Utilisations</span>
                    <span className="font-bold tabular-nums">
                      {c.usage_actuel}{c.usage_max ? ` / ${c.usage_max}` : ' (illimité)'}
                    </span>
                  </div>
                  {c.usage_max && (
                    <div className="h-1.5 bg-zinc-200 rounded overflow-hidden">
                      <div
                        className={progression >= 100 ? 'h-full bg-red-500' : 'h-full bg-emerald-500'}
                        style={{ width: `${progression}%` }}
                      />
                    </div>
                  )}
                </div>

                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing(c)} className="flex-1">
                    Éditer
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toggle(c)} className="flex-1">
                    {c.actif ? 'Désactiver' : 'Activer'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDel(c)} className="text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {(creating || editing) && (
        <CodeModal
          code={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); router.refresh() }}
        />
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirmDel(null)}>
          <Card className="max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <p className="font-bold mb-1">Supprimer le code « {confirmDel.code} » ?</p>
            <p className="text-sm text-zinc-600 mb-3">
              {confirmDel.usage_actuel > 0 && `Ce code a déjà été utilisé ${confirmDel.usage_actuel} fois. `}
              Cette action est irréversible.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmDel(null)} className="flex-1">Annuler</Button>
              <Button onClick={supprimer} className="flex-1 bg-red-600 hover:bg-red-700">Supprimer</Button>
            </div>
          </Card>
        </div>
      )}
      </main>
    </div>
  )
}

// ─── Modal création / édition ────────────────────────────────
function CodeModal({
  code, onClose, onSaved,
}: {
  code: CodePromo | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!code
  const [codeStr, setCodeStr] = useState(code?.code ?? genererCode())
  const [type, setType] = useState<'pourcentage' | 'euros'>(code?.type ?? 'pourcentage')
  const [valeur, setValeur] = useState<string>(code?.valeur?.toString() ?? '10')
  const [montantMin, setMontantMin] = useState<string>(code?.montant_min?.toString() ?? '0')
  const [dateDebut, setDateDebut] = useState(code?.date_debut?.slice(0, 10) ?? todayISO())
  const [dateFin, setDateFin] = useState(code?.date_fin?.slice(0, 10) ?? '')
  const [usageMax, setUsageMax] = useState<string>(code?.usage_max?.toString() ?? '')
  const [niveauReserve, setNiveauReserve] = useState<string>(code?.reserve_fidelite_niveau ?? '')
  const [description, setDescription] = useState(code?.description ?? '')
  const [actif, setActif] = useState(code?.actif ?? true)
  const [erreur, setErreur] = useState('')
  const [isPending, startTransition] = useTransition()

  function valider() {
    if (!codeStr.trim()) { setErreur('Code obligatoire'); return }
    if (!valeur || Number(valeur) <= 0) { setErreur('Valeur > 0 obligatoire'); return }
    if (type === 'pourcentage' && Number(valeur) > 100) { setErreur('% maximum = 100'); return }
    setErreur('')
    startTransition(async () => {
      try {
        const payload = {
          code: codeStr.trim().toUpperCase(),
          type,
          valeur: Number(valeur),
          montant_min: Number(montantMin) || 0,
          date_debut: dateDebut,
          date_fin: dateFin || null,
          usage_max: usageMax ? Number(usageMax) : null,
          reserve_fidelite_niveau: niveauReserve || null,
          description: description.trim() || null,
          actif,
        }
        if (isEdit) await modifierCodePromo({ ...payload, id: code!.id })
        else await creerCodePromo(payload)
        onSaved()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <Card className="max-w-lg w-full p-5 my-8" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">
          {isEdit ? 'Modifier le code promo' : 'Nouveau code promo'}
        </h2>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium block mb-1">Code *</label>
            <div className="flex gap-2">
              <Input
                type="text"
                maxLength={40}
                placeholder="EX: BIENVENUE10"
                value={codeStr}
                onChange={e => setCodeStr(e.target.value.toUpperCase())}
                className="font-mono uppercase"
              />
              {!isEdit && (
                <Button type="button" variant="outline" onClick={() => setCodeStr(genererCode())}>
                  🎲 Aléa
                </Button>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 mt-0.5">Lettres maj/chiffres/_/- uniquement</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium block mb-1">Type *</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as typeof type)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              >
                <option value="pourcentage">% (pourcentage)</option>
                <option value="euros">€ (montant fixe)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">
                Valeur * {type === 'pourcentage' ? '(0-100)' : '(€)'}
              </label>
              <Input
                type="number"
                step={type === 'pourcentage' ? '1' : '0.10'}
                min="0.01"
                max={type === 'pourcentage' ? '100' : '100000'}
                value={valeur}
                onChange={e => setValeur(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Panier minimum (€)</label>
            <Input
              type="number"
              step="0.10"
              min="0"
              placeholder="0 = pas de minimum"
              value={montantMin}
              onChange={e => setMontantMin(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium block mb-1">Date début *</label>
              <Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Date fin (optionnel)</label>
              <Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} />
              <p className="text-[11px] text-zinc-500 mt-0.5">Vide = sans expiration</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium block mb-1">Usage max (optionnel)</label>
              <Input
                type="number"
                min="0"
                placeholder="Vide = illimité"
                value={usageMax}
                onChange={e => setUsageMax(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Réservé niveau fidélité</label>
              <select
                value={niveauReserve}
                onChange={e => setNiveauReserve(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              >
                <option value="">Tous (pas de restriction)</option>
                {NIVEAUX.map(n => (
                  <option key={n} value={n}>{NIVEAU_INFO[n].emoji} {NIVEAU_INFO[n].label} et +</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Description interne (optionnel)</label>
            <Textarea
              rows={2}
              maxLength={500}
              placeholder="Ex : Code de bienvenue pour la campagne Instagram"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer rounded-md border p-2">
            <input
              type="checkbox"
              checked={actif}
              onChange={e => setActif(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="font-medium">Actif</span>
            <span className="text-xs text-zinc-500 ml-auto">décoche pour suspendre temporairement</span>
          </label>

          {erreur && <p className="text-sm text-red-600">⚠️ {erreur}</p>}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={isPending} className="flex-1">
              Annuler
            </Button>
            <Button onClick={valider} disabled={isPending || !codeStr.trim()} className="flex-[2]">
              {isPending ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
