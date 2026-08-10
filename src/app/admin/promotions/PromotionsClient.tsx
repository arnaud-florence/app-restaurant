'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Megaphone, Plus, Trash2, ExternalLink, Eye, EyeOff } from 'lucide-react'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import EmptyState from '@/components/ui/EmptyState'
import { creerPromotion, modifierPromotion, togglePromotion, supprimerPromotion } from './actions'
import type { Promotion } from './page'

const nowISO = () => new Date().toISOString().slice(0, 16)  // pour input datetime-local
const toLocal = (iso: string | null) => iso ? new Date(iso).toISOString().slice(0, 16) : ''
const fmtDate = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—'

export default function PromotionsClient({ promotions }: { promotions: Promotion[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<Promotion | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDel, setConfirmDel] = useState<Promotion | null>(null)
  const [erreur, setErreur] = useState('')
  const [, startTransition] = useTransition()

  const now = new Date()
  const aujourdhui = promotions.filter(p => {
    if (!p.actif || !p.visible_site) return false
    if (new Date(p.date_debut) > now) return false
    if (p.date_fin && new Date(p.date_fin) < now) return false
    return true
  })

  function toggle(p: Promotion) {
    setErreur('')
    startTransition(async () => {
      try {
        await togglePromotion(p.id, !p.actif)
        router.refresh()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  function supprimer() {
    if (!confirmDel) return
    setErreur('')
    startTransition(async () => {
      try {
        await supprimerPromotion(confirmDel.id)
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
          accent="rose"
          subtitle="Clientèle"
          title="Promotions"
          description={`Bannières site web, codes promo, happy hours, offres temporaires. ${aujourdhui.length} active${aujourdhui.length > 1 ? 's' : ''} aujourd'hui.`}
          actions={
            <Button onClick={() => setCreating(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Nouvelle promotion
            </Button>
          }
        />

      {/* Card explicative */}
      <Card className="p-4 bg-rose-50 border-rose-200">
        <p className="text-xs uppercase tracking-wider text-rose-700 font-bold mb-2">📣 Comment ça marche sur le site</p>
        <ul className="text-sm text-rose-900 space-y-1">
          <li>• Les promotions <strong>actives + visibles + dans la période</strong> apparaissent en bannière sur l&apos;accueil du site web</li>
          <li>• Le bouton CTA optionnel redirige vers une page interne (ex: /carte) ou externe</li>
          <li>• <strong>visible_site</strong> permet de garder la promo en base sans l&apos;afficher (brouillon)</li>
        </ul>
      </Card>

      {erreur && (
        <Card className="p-3 bg-red-50 border-red-200 text-sm text-red-700">⚠️ {erreur}</Card>
      )}

      {promotions.length === 0 ? (
        <EmptyState
          emoji="🏷️"
          titre="Aucune promotion"
          description="Crée ta première promotion pour afficher une bannière, un code promo ou une happy hour sur ton site web."
          action={{ label: '+ Nouvelle promotion', onClick: () => setCreating(true) }}
        />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {promotions.map(p => {
            const futur = new Date(p.date_debut) > now
            const passe = p.date_fin && new Date(p.date_fin) < now
            const enCours = p.actif && p.visible_site && !futur && !passe
            return (
              <Card key={p.id} className={`overflow-hidden ${!p.actif ? 'opacity-60' : ''}`}>
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image_url}
                    alt={p.titre}
                    className="w-full h-32 object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <div className="w-full h-32 bg-gradient-to-br from-rose-100 to-pink-200 flex items-center justify-center">
                    <Megaphone className="h-10 w-10 text-rose-500/60" />
                  </div>
                )}
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold truncate">{p.titre}</p>
                      <p className="text-[11px] text-zinc-500">
                        {fmtDate(p.date_debut)} {p.date_fin ? `→ ${fmtDate(p.date_fin)}` : '→ ∞'}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      {!p.actif && <Badge variant="secondary">inactif</Badge>}
                      {p.actif && !p.visible_site && <Badge className="bg-zinc-100 text-zinc-700 border-zinc-300">brouillon</Badge>}
                      {enCours && <Badge className="bg-rose-500 text-white">en cours</Badge>}
                      {p.actif && futur && <Badge className="bg-blue-100 text-blue-800 border-blue-300">à venir</Badge>}
                      {p.actif && passe && <Badge className="bg-zinc-100 text-zinc-600 border-zinc-300">passé</Badge>}
                    </div>
                  </div>
                  {p.description && (
                    <p className="text-xs text-zinc-600 mt-2 line-clamp-2">{p.description}</p>
                  )}
                  {p.cta_label && p.cta_url && (
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-zinc-500">
                      <ExternalLink className="h-3 w-3" />
                      <span className="font-medium">CTA :</span>
                      <span className="truncate">{p.cta_label} → {p.cta_url}</span>
                    </div>
                  )}
                  <div className="flex gap-1 mt-3">
                    <Button size="sm" variant="outline" onClick={() => setEditing(p)} className="flex-1">
                      Éditer
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => toggle(p)} className="flex-1">
                      {p.actif ? 'Désactiver' : 'Activer'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDel(p)} className="text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {(creating || editing) && (
        <PromoModal
          promo={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); router.refresh() }}
        />
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirmDel(null)}>
          <Card className="max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <p className="font-bold mb-1">Supprimer « {confirmDel.titre} » ?</p>
            <p className="text-sm text-zinc-600 mb-3">Cette action est irréversible.</p>
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
function PromoModal({
  promo, onClose, onSaved,
}: {
  promo: Promotion | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!promo
  const [titre, setTitre] = useState(promo?.titre ?? '')
  const [description, setDescription] = useState(promo?.description ?? '')
  const [imageUrl, setImageUrl] = useState(promo?.image_url ?? '')
  const [dateDebut, setDateDebut] = useState(toLocal(promo?.date_debut ?? null) || nowISO())
  const [dateFin, setDateFin] = useState(toLocal(promo?.date_fin ?? null))
  const [ctaLabel, setCtaLabel] = useState(promo?.cta_label ?? '')
  const [ctaUrl, setCtaUrl] = useState(promo?.cta_url ?? '')
  const [visibleSite, setVisibleSite] = useState(promo?.visible_site ?? true)
  const [actif, setActif] = useState(promo?.actif ?? true)
  const [erreur, setErreur] = useState('')
  const [isPending, startTransition] = useTransition()

  function valider() {
    if (!titre.trim()) { setErreur('Titre obligatoire'); return }
    setErreur('')
    startTransition(async () => {
      try {
        const payload = {
          titre: titre.trim(),
          description: description.trim() || null,
          image_url: imageUrl.trim() || null,
          date_debut: new Date(dateDebut).toISOString(),
          date_fin: dateFin ? new Date(dateFin).toISOString() : null,
          cta_label: ctaLabel.trim() || null,
          cta_url: ctaUrl.trim() || null,
          visible_site: visibleSite,
          actif,
        }
        if (isEdit) await modifierPromotion({ ...payload, id: promo!.id })
        else await creerPromotion(payload)
        onSaved()
      } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <Card className="max-w-lg w-full p-5 my-8" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">
          {isEdit ? 'Modifier la promotion' : 'Nouvelle promotion'}
        </h2>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium block mb-1">Titre *</label>
            <Input
              type="text"
              maxLength={160}
              placeholder="Ex : Happy Hour -20% sur les pizzas"
              value={titre}
              onChange={e => setTitre(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Description (optionnel)</label>
            <Textarea
              rows={3}
              maxLength={1000}
              placeholder="Ex : Tous les vendredis de 18h à 20h, profitez de -20% sur toutes les pizzas !"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">URL image bannière (optionnel)</label>
            <Input
              type="url"
              placeholder="https://..."
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
            />
            <p className="text-[11px] text-zinc-500 mt-0.5">Recommandé : 1920×600px, JPG/WebP</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium block mb-1">Début *</label>
              <Input
                type="datetime-local"
                value={dateDebut}
                onChange={e => setDateDebut(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Fin (optionnel)</label>
              <Input
                type="datetime-local"
                value={dateFin}
                onChange={e => setDateFin(e.target.value)}
              />
              <p className="text-[11px] text-zinc-500 mt-0.5">Vide = sans fin</p>
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-2">Bouton d&apos;action (optionnel)</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm font-medium block mb-1">Label</label>
                <Input
                  type="text"
                  maxLength={60}
                  placeholder="Ex : Voir la carte"
                  value={ctaLabel}
                  onChange={e => setCtaLabel(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">URL</label>
                <Input
                  type="text"
                  placeholder="/carte ou https://..."
                  value={ctaUrl}
                  onChange={e => setCtaUrl(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t pt-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer rounded-md border p-2">
              <input
                type="checkbox"
                checked={actif}
                onChange={e => setActif(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="font-medium">Actif</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer rounded-md border p-2">
              <input
                type="checkbox"
                checked={visibleSite}
                onChange={e => setVisibleSite(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="font-medium inline-flex items-center gap-1">
                {visibleSite ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                Visible sur le site
              </span>
            </label>
          </div>

          {erreur && <p className="text-sm text-red-600">⚠️ {erreur}</p>}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={isPending} className="flex-1">
              Annuler
            </Button>
            <Button onClick={valider} disabled={isPending || !titre.trim()} className="flex-[2]">
              {isPending ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
