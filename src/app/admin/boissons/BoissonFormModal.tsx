'use client'

import { useMemo, useState, useTransition } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import {
  type Boisson, TYPE_LABEL, COULEUR_LABEL,
  margeBouteille, margeVerre, margePinte, rendementFut,
  suggererAccordsPour, type RecetteShort,
  fmtPrix, fmtPct,
} from '@/lib/boissons'
import { createBoisson, updateBoisson, ajouterAccord, retirerAccord } from './actions'

// ─── Schéma ──────────────────────────────────────────────────────────
const TYPES = ['vin','champagne','biere_pression','biere_bouteille','soft','eau','spiritueux','cafe_the','cocktail','autre'] as const
const COULEURS = ['rouge','blanc','rose','champagne','liquoreux','autre'] as const

const formSchema = z.object({
  nom: z.string().trim().min(1, 'Nom obligatoire').max(160),
  type: z.enum(TYPES),
  appellation: z.string().max(120),
  millesime: z.number().int().min(1900).max(2100).nullable(),
  region: z.string().max(120),
  cepage: z.string().max(160),
  couleur: z.union([z.enum(COULEURS), z.literal('')]),

  fournisseur_principal: z.string().max(160),
  fournisseur_secondaire: z.string().max(160),

  prix_achat_ht_bouteille: z.number().min(0).max(99999),
  contenance_bouteille_cl: z.number().int().min(0).max(10000),
  prix_achat_ht_fut: z.number().min(0).max(99999),
  contenance_fut_cl: z.number().int().min(0).max(100000),

  prix_vente_ht_verre: z.number().min(0).max(9999),
  contenance_verre_cl: z.number().int().min(0).max(1000),
  prix_vente_ht_bouteille: z.number().min(0).max(99999),
  prix_vente_ht_pinte: z.number().min(0).max(9999),
  contenance_pinte_cl: z.number().int().min(0).max(1000),
  tva: z.number().min(0).max(100),

  stock_actuel_bouteilles: z.number().min(0),
  stock_minimum_bouteilles: z.number().min(0),
  stock_actuel_futs: z.number().min(0),
  stock_minimum_futs: z.number().min(0),

  description: z.string().max(2000),
  photo_url: z.string().max(2000),
  actif: z.boolean(),
  ordre: z.number().int().min(0).max(9999),
})

type FormData = z.infer<typeof formSchema>

const DEFAULT_FORM: FormData = {
  nom: '', type: 'vin',
  appellation: '', millesime: null, region: '', cepage: '', couleur: '',
  fournisseur_principal: '', fournisseur_secondaire: '',
  prix_achat_ht_bouteille: 0, contenance_bouteille_cl: 75,
  prix_achat_ht_fut: 0, contenance_fut_cl: 0,
  prix_vente_ht_verre: 0, contenance_verre_cl: 12,
  prix_vente_ht_bouteille: 0, prix_vente_ht_pinte: 0, contenance_pinte_cl: 50,
  tva: 20,
  stock_actuel_bouteilles: 0, stock_minimum_bouteilles: 0,
  stock_actuel_futs: 0, stock_minimum_futs: 0,
  description: '', photo_url: '', actif: true, ordre: 0,
}

export default function BoissonFormModal({
  boisson, recettes, accordsExplicites, onClose, onSaved,
}: {
  boisson: Boisson | null
  recettes: RecetteShort[]
  accordsExplicites: { recette_id: string; note: string | null }[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!boisson
  const [isPending, startTransition] = useTransition()

  const defaults: FormData = boisson
    ? {
        nom: boisson.nom,
        type: boisson.type,
        appellation: boisson.appellation ?? '',
        millesime: boisson.millesime,
        region: boisson.region ?? '',
        cepage: boisson.cepage ?? '',
        couleur: boisson.couleur ?? '',
        fournisseur_principal: boisson.fournisseur_principal ?? '',
        fournisseur_secondaire: boisson.fournisseur_secondaire ?? '',
        prix_achat_ht_bouteille: boisson.prix_achat_ht_bouteille,
        contenance_bouteille_cl: boisson.contenance_bouteille_cl,
        prix_achat_ht_fut: boisson.prix_achat_ht_fut,
        contenance_fut_cl: boisson.contenance_fut_cl,
        prix_vente_ht_verre: boisson.prix_vente_ht_verre,
        contenance_verre_cl: boisson.contenance_verre_cl,
        prix_vente_ht_bouteille: boisson.prix_vente_ht_bouteille,
        prix_vente_ht_pinte: boisson.prix_vente_ht_pinte,
        contenance_pinte_cl: boisson.contenance_pinte_cl,
        tva: boisson.tva,
        stock_actuel_bouteilles: boisson.stock_actuel_bouteilles,
        stock_minimum_bouteilles: boisson.stock_minimum_bouteilles,
        stock_actuel_futs: boisson.stock_actuel_futs,
        stock_minimum_futs: boisson.stock_minimum_futs,
        description: boisson.description ?? '',
        photo_url: boisson.photo_url ?? '',
        actif: boisson.actif,
        ordre: boisson.ordre,
      }
    : DEFAULT_FORM

  const {
    register, handleSubmit, watch, setError, control,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: defaults,
  })

  const all = watch()
  // Boisson "live" pour les calculs : merge defaults + form actuel
  const liveBoisson = useMemo<Boisson>(() => ({
    ...(boisson ?? makeFakeBoisson(defaults)),
    nom: all.nom,
    type: all.type,
    appellation: all.appellation || null,
    millesime: all.millesime,
    region: all.region || null,
    cepage: all.cepage || null,
    couleur: (all.couleur || null) as Boisson['couleur'],
    fournisseur_principal: all.fournisseur_principal || null,
    fournisseur_secondaire: all.fournisseur_secondaire || null,
    prix_achat_ht_bouteille: Number(all.prix_achat_ht_bouteille) || 0,
    contenance_bouteille_cl: Number(all.contenance_bouteille_cl) || 0,
    prix_achat_ht_fut: Number(all.prix_achat_ht_fut) || 0,
    contenance_fut_cl: Number(all.contenance_fut_cl) || 0,
    prix_vente_ht_verre: Number(all.prix_vente_ht_verre) || 0,
    contenance_verre_cl: Number(all.contenance_verre_cl) || 0,
    prix_vente_ht_bouteille: Number(all.prix_vente_ht_bouteille) || 0,
    prix_vente_ht_pinte: Number(all.prix_vente_ht_pinte) || 0,
    contenance_pinte_cl: Number(all.contenance_pinte_cl) || 0,
    tva: Number(all.tva) || 0,
    stock_actuel_bouteilles: Number(all.stock_actuel_bouteilles) || 0,
    stock_minimum_bouteilles: Number(all.stock_minimum_bouteilles) || 0,
    stock_actuel_futs: Number(all.stock_actuel_futs) || 0,
    stock_minimum_futs: Number(all.stock_minimum_futs) || 0,
    description: all.description || null,
    photo_url: all.photo_url || null,
    actif: all.actif,
    ordre: Number(all.ordre) || 0,
  }), [all, boisson, defaults])

  const mb = margeBouteille(liveBoisson)
  const mv = margeVerre(liveBoisson)
  const mp = margePinte(liveBoisson)
  const rf = rendementFut(liveBoisson)

  const isVin       = liveBoisson.type === 'vin' || liveBoisson.type === 'champagne'
  const isPression  = liveBoisson.type === 'biere_pression'

  // Suggestions d'accords pour la boisson actuelle
  const suggestions = useMemo(
    () => suggererAccordsPour(liveBoisson, recettes),
    [liveBoisson, recettes]
  )
  const top5Suggestions = suggestions.slice(0, 5)

  // Set d'accords explicites (recette_id) — local pour réagir aux clics
  const [accordsLocaux, setAccordsLocaux] = useState<Set<string>>(
    new Set(accordsExplicites.map(a => a.recette_id))
  )

  function onSubmit(data: FormData) {
    startTransition(async () => {
      try {
        const payload = {
          ...data,
          appellation: data.appellation || null,
          region: data.region || null,
          cepage: data.cepage || null,
          couleur: data.couleur || null,
          fournisseur_principal: data.fournisseur_principal || null,
          fournisseur_secondaire: data.fournisseur_secondaire || null,
          description: data.description || null,
          photo_url: data.photo_url || null,
        }
        if (isEdit && boisson) {
          await updateBoisson(boisson.id, payload)
        } else {
          await createBoisson(payload)
        }
        onSaved()
      } catch (e) {
        setError('root', { message: e instanceof Error ? e.message : 'Erreur sauvegarde' })
      }
    })
  }

  async function toggleAccord(recetteId: string) {
    if (!boisson) {
      setError('root', { message: 'Sauvegarde la boisson avant d\'ajouter des accords.' })
      return
    }
    const isExplicite = accordsLocaux.has(recetteId)
    try {
      if (isExplicite) {
        await retirerAccord(boisson.id, recetteId)
        setAccordsLocaux(prev => { const s = new Set(prev); s.delete(recetteId); return s })
      } else {
        await ajouterAccord(boisson.id, recetteId)
        setAccordsLocaux(prev => new Set(prev).add(recetteId))
      }
    } catch (e) {
      setError('root', { message: e instanceof Error ? e.message : 'Erreur accord' })
    }
  }

  const rootError = errors.root?.message

  return (
    <Dialog open onClose={onClose} panelClassName="sm:max-w-4xl">
      <DialogHeader onClose={onClose}>
        <DialogTitle>{isEdit ? `🍷 ${boisson?.nom}` : '➕ Nouvelle boisson'}</DialogTitle>
        <DialogDescription>
          Prix d&apos;achat et de vente saisis séparément par format. Les marges et le rendement fût se calculent en direct à droite.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="contents">
        <DialogBody className="space-y-5 sm:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
            {/* ─── Colonne gauche : formulaire ─── */}
            <div className="space-y-5 min-w-0">
              {/* Identité */}
              <section className="space-y-3">
                <SectionTitle>📋 Identité</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
                  <Field label="Nom *" error={errors.nom?.message}>
                    <Input {...register('nom')} placeholder="Cahors Malbec — Château Cèdre" autoFocus />
                  </Field>
                  <Field label="Type *">
                    <Select {...register('type')}>
                      {TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t].emoji} {TYPE_LABEL[t].label}</option>)}
                    </Select>
                  </Field>
                </div>

                {isVin && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-[2fr_120px_1fr] gap-3">
                      <Field label="Appellation">
                        <Input {...register('appellation')} placeholder="Cahors AOC" />
                      </Field>
                      <Field label="Millésime">
                        <Input
                          type="number"
                          {...register('millesime', {
                            setValueAs: v => v === '' || v == null ? null : Number(v),
                          })}
                          placeholder="2022"
                        />
                      </Field>
                      <Field label="Couleur">
                        <Select {...register('couleur')}>
                          <option value="">—</option>
                          {COULEURS.map(c => <option key={c} value={c}>{COULEUR_LABEL[c]?.label ?? c}</option>)}
                        </Select>
                      </Field>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Région"><Input {...register('region')} placeholder="Sud-Ouest" /></Field>
                      <Field label="Cépage"><Input {...register('cepage')} placeholder="Malbec" /></Field>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Fournisseur principal"><Input {...register('fournisseur_principal')} /></Field>
                  <Field label="Fournisseur secondaire"><Input {...register('fournisseur_secondaire')} /></Field>
                </div>

                <Field label="Description">
                  <Textarea rows={2} {...register('description')} placeholder="Notes de dégustation, conseil de service…" />
                </Field>
              </section>

              <Separator />

              {/* Bouteille */}
              <section className="space-y-3">
                <SectionTitle>🍾 Format bouteille</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Achat HT bouteille (€)" hint="0 si non vendu en bouteille.">
                    <Input type="number" step="0.0001" min={0} {...register('prix_achat_ht_bouteille', { valueAsNumber: true })} />
                  </Field>
                  <Field label="Contenance bouteille (cl)">
                    <Input type="number" step={1} min={0} {...register('contenance_bouteille_cl', { valueAsNumber: true })} />
                  </Field>
                  <Field label="Vente HT verre (€)">
                    <Input type="number" step="0.01" min={0} {...register('prix_vente_ht_verre', { valueAsNumber: true })} />
                  </Field>
                  <Field label="Contenance verre (cl)">
                    <Input type="number" step={1} min={0} {...register('contenance_verre_cl', { valueAsNumber: true })} />
                  </Field>
                  <Field label="Vente HT bouteille (€)" className="col-span-2">
                    <Input type="number" step="0.01" min={0} {...register('prix_vente_ht_bouteille', { valueAsNumber: true })} />
                  </Field>
                </div>
              </section>

              {/* Pression / Fût */}
              <section className="space-y-3">
                <SectionTitle>🍺 Format fût {isPression ? '' : <span className="text-xs font-normal text-muted-foreground">(uniquement pour bières pression)</span>}</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Achat HT fût (€)">
                    <Input type="number" step="0.0001" min={0} {...register('prix_achat_ht_fut', { valueAsNumber: true })} />
                  </Field>
                  <Field label="Contenance fût (cl)" hint="3000 cl = 30 L.">
                    <Input type="number" step={100} min={0} {...register('contenance_fut_cl', { valueAsNumber: true })} />
                  </Field>
                  <Field label="Vente HT pinte (€)">
                    <Input type="number" step="0.01" min={0} {...register('prix_vente_ht_pinte', { valueAsNumber: true })} />
                  </Field>
                  <Field label="Contenance pinte (cl)">
                    <Input type="number" step={1} min={0} {...register('contenance_pinte_cl', { valueAsNumber: true })} />
                  </Field>
                </div>
              </section>

              <Separator />

              {/* TVA */}
              <section className="space-y-3">
                <SectionTitle>🧾 TVA</SectionTitle>
                <Field label="Taux de TVA (%)" hint="Alcool 20% · soft 10% · eau 5,5%">
                  <Select {...register('tva', { valueAsNumber: true })}>
                    <option value={20}>20% — alcool</option>
                    <option value={10}>10% — soft / café</option>
                    <option value={5.5}>5,5% — eau</option>
                    <option value={0}>0%</option>
                  </Select>
                </Field>
              </section>

              <Separator />

              {/* Stock */}
              <section className="space-y-3">
                <SectionTitle>📦 Stock <span className="text-xs font-normal text-muted-foreground">(séparé du stock cuisine)</span></SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Bouteilles en stock">
                    <Input type="number" step="1" min={0} {...register('stock_actuel_bouteilles', { valueAsNumber: true })} />
                  </Field>
                  <Field label="Bouteilles min.">
                    <Input type="number" step="1" min={0} {...register('stock_minimum_bouteilles', { valueAsNumber: true })} />
                  </Field>
                  <Field label="Fûts en stock">
                    <Input type="number" step="1" min={0} {...register('stock_actuel_futs', { valueAsNumber: true })} />
                  </Field>
                  <Field label="Fûts min.">
                    <Input type="number" step="1" min={0} {...register('stock_minimum_futs', { valueAsNumber: true })} />
                  </Field>
                </div>
              </section>

              <Separator />

              {/* Statut */}
              <section>
                <Controller
                  control={control}
                  name="actif"
                  render={({ field }) => (
                    <div className="flex items-center justify-between rounded-md border p-3">
                      <div className="min-w-0">
                        <Label htmlFor="b-actif" className="text-base cursor-pointer">Boisson active</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Inactive : reste en base mais masquée sur la carte.
                        </p>
                      </div>
                      <Switch id="b-actif" checked={field.value} onCheckedChange={field.onChange} />
                    </div>
                  )}
                />
              </section>

              {rootError && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 font-medium">
                  ⚠️ {rootError}
                </p>
              )}
            </div>

            {/* ─── Colonne droite : calc card sticky ─── */}
            <aside className="lg:sticky lg:top-0 lg:self-start space-y-3">
              <div className="rounded-lg border p-3 bg-background space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Marges live</p>
                <MargeRow label={`Verre ${liveBoisson.contenance_verre_cl}cl`} m={mv} />
                <MargeRow label={`Bouteille ${liveBoisson.contenance_bouteille_cl}cl`} m={mb} />
                <MargeRow label={`Pinte ${liveBoisson.contenance_pinte_cl}cl`} m={mp} />
              </div>

              {rf.applicable && (
                <div className="rounded-lg border p-3 bg-yellow-50 border-yellow-200 space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-yellow-900">🍺 Rendement fût</p>
                  <Line label="Pintes par fût" value={`${rf.nb_pintes_par_fut.toFixed(0)}`} />
                  <Line label="Achat / pinte" value={fmtPrix(rf.prix_achat_par_pinte)} />
                  <Line label="CA potentiel / fût" value={fmtPrix(rf.ca_potentiel_par_fut)} bold />
                  <Line label="Marge potentielle" value={fmtPrix(rf.marge_potentielle_par_fut)} bold />
                </div>
              )}

              {/* Suggestions d'accords */}
              {(liveBoisson.type === 'vin' || liveBoisson.type === 'champagne') && (
                <div className="rounded-lg border p-3 bg-background space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    🍽️ Accords mets/vins
                  </p>
                  {top5Suggestions.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      Aucune suggestion auto pour cette couleur ou cette base de recettes.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {top5Suggestions.map(s => {
                        const explicit = accordsLocaux.has(s.recette_id)
                        return (
                          <li key={s.recette_id} className="text-xs">
                            <button
                              type="button"
                              onClick={() => toggleAccord(s.recette_id)}
                              className={cn(
                                'w-full text-left rounded-md border px-2 py-1.5 transition-colors',
                                explicit
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                  : 'hover:bg-muted'
                              )}
                              title={isEdit ? 'Cliquer pour épingler / retirer' : 'Sauvegarde d\'abord la boisson'}
                              disabled={!isEdit}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold truncate">{s.recette_nom}</span>
                                <span className="shrink-0 inline-flex items-center gap-1">
                                  <Badge variant={s.score >= 70 ? 'success' : s.score >= 40 ? 'secondary' : 'outline'} className="text-[10px]">
                                    {s.score}/100
                                  </Badge>
                                  {explicit && <span title="Épinglé">📌</span>}
                                </span>
                              </div>
                              {s.raison && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{s.raison}</p>}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {!isEdit && (
                    <p className="text-[10px] text-muted-foreground italic">
                      Sauvegarde d&apos;abord la boisson pour épingler des accords.
                    </p>
                  )}
                </div>
              )}
            </aside>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting || isPending}>
            Annuler
          </Button>
          <Button type="submit" disabled={isSubmitting || isPending}>
            {(isSubmitting || isPending) ? 'Sauvegarde…' : (isEdit ? 'Enregistrer' : 'Créer')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}

// ─── Helpers UI ──────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{children}</h3>
}

function Field({ label, error, hint, className, children }: {
  label: string; error?: string; hint?: string; className?: string; children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function MargeRow({ label, m }: {
  label: string
  m: { applicable: boolean; prix_vente_ht: number; marge_eur: number; marge_pct: number; food_cost_pct: number; statut: 'vert' | 'orange' | 'rouge' }
}) {
  if (!m.applicable) return (
    <div className="flex items-center justify-between text-xs text-muted-foreground italic">
      <span>{label}</span><span>—</span>
    </div>
  )
  const tone =
    m.statut === 'vert' ? 'text-emerald-700' :
    m.statut === 'orange' ? 'text-amber-700' :
    'text-red-700'
  return (
    <div className="flex items-center justify-between text-xs gap-2">
      <span className="text-muted-foreground truncate">{label}</span>
      <span className="text-right shrink-0">
        <span className="font-bold tabular-nums">{fmtPrix(m.prix_vente_ht)}</span>
        <span className={cn('ml-1.5 font-semibold tabular-nums', tone)}>marge {fmtPct(m.marge_pct)}</span>
      </span>
    </div>
  )
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-yellow-900/70">{label}</span>
      <span className={cn('text-yellow-900 tabular-nums', bold && 'font-bold')}>{value}</span>
    </div>
  )
}

// Construit une Boisson "fictive" pour le mode création (live calc avant save)
function makeFakeBoisson(d: FormData): Boisson {
  return {
    id: 'tmp', nom: d.nom, type: d.type,
    appellation: d.appellation || null, millesime: d.millesime, region: d.region || null,
    cepage: d.cepage || null, couleur: (d.couleur || null) as Boisson['couleur'],
    fournisseur_principal: d.fournisseur_principal || null,
    fournisseur_secondaire: d.fournisseur_secondaire || null,
    prix_achat_ht_bouteille: d.prix_achat_ht_bouteille,
    contenance_bouteille_cl: d.contenance_bouteille_cl,
    prix_achat_ht_fut: d.prix_achat_ht_fut,
    contenance_fut_cl: d.contenance_fut_cl,
    prix_vente_ht_verre: d.prix_vente_ht_verre,
    contenance_verre_cl: d.contenance_verre_cl,
    prix_vente_ht_bouteille: d.prix_vente_ht_bouteille,
    prix_vente_ht_pinte: d.prix_vente_ht_pinte,
    contenance_pinte_cl: d.contenance_pinte_cl,
    tva: d.tva,
    stock_actuel_bouteilles: d.stock_actuel_bouteilles,
    stock_minimum_bouteilles: d.stock_minimum_bouteilles,
    stock_actuel_futs: d.stock_actuel_futs,
    stock_minimum_futs: d.stock_minimum_futs,
    description: d.description || null, photo_url: d.photo_url || null,
    actif: d.actif, ordre: d.ordre,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}
