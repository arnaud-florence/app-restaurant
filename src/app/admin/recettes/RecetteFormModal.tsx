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

import { type Ingredient, iconAllergene, labelAllergene } from '../ingredients/types'
import {
  type RecetteWithIngredients, type RecetteIngredient,
  TAGS_DESTINATION, TAG_STYLE, CATEGORIES_RECETTE_DEFAUT,
  defaultRecette, newLocalId, isNewId,
} from './types'
import { createRecette, updateRecette } from './actions'
import {
  synthese, prixSuggerePourMarge, fmtPrix, fmtPrix4, fmtPct,
  STATUT_FOOD_COST_STYLE, alerteFoodCost,
} from '@/lib/foodCost'

// ─── Schéma form (RHF) ───────────────────────────────────────────────
const formSchema = z.object({
  nom: z.string().trim().min(1, 'Nom obligatoire').max(120),
  categorie: z.string().trim().min(1, 'Catégorie obligatoire').max(60),
  tag_destination: z.enum(TAGS_DESTINATION),
  description: z.string().max(2000),
  temps_preparation: z.number().int().min(0).max(720),
  nb_portions: z.number().int().min(1, 'Au moins 1 portion').max(200),
  prix_vente_ht: z.number().min(0).max(99999),
  cout_achat_ht: z.number().min(0).max(99999).nullable(),
  libelle_achat: z.string().max(200),
  nom_matiere: z.string().max(120),
  unites_par_achat: z.number().positive().max(1000),
  tva: z.number().min(0).max(100),
  contient_alcool: z.boolean(),
  photo_url: z.string().max(2000),
  actif: z.boolean(),
  vendable_online: z.boolean(),
  image_url: z.string().max(2000),
})
type FormData = z.infer<typeof formSchema>

const MARGES_CIBLES = [70, 72, 75] as const

export default function RecetteFormModal({
  recette, ingredients, onClose, onSaved,
}: {
  recette: RecetteWithIngredients | null
  ingredients: Ingredient[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!recette
  const [isPending, startTransition] = useTransition()

  // ─── State des ingrédients (hors RHF — c'est une liste dynamique) ──
  const [lignes, setLignes] = useState<RecetteIngredient[]>(recette?.ingredients ?? [])
  const [pickerId, setPickerId] = useState<string>(ingredients[0]?.id ?? '')
  const [pickerQty, setPickerQty] = useState<number>(1)

  const defaults: FormData = recette
    ? {
        nom: recette.nom,
        categorie: recette.categorie,
        tag_destination: recette.tag_destination,
        description: recette.description ?? '',
        temps_preparation: recette.temps_preparation,
        nb_portions: recette.nb_portions,
        prix_vente_ht: recette.prix_vente_ht,
        cout_achat_ht: recette.cout_achat_ht,
        libelle_achat: recette.libelle_achat ?? '',
        nom_matiere: recette.nom_matiere ?? '',
        unites_par_achat: recette.unites_par_achat ?? 1,
        tva: recette.tva,
        contient_alcool: recette.contient_alcool ?? false,
        photo_url: recette.photo_url ?? '',
        actif: recette.actif,
        vendable_online: recette.vendable_online ?? false,
        image_url: recette.image_url ?? '',
      }
    : { ...defaultRecette(), description: '', photo_url: '', contient_alcool: false, vendable_online: false, image_url: '' } as FormData

  const {
    register, handleSubmit, control, watch, setValue, setError,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: defaults,
  })

  const nb_portions   = watch('nb_portions')
  const prix_vente_ht = watch('prix_vente_ht')
  const tvaCourante   = watch('tva')
  const cout_achat_ht = watch('cout_achat_ht')
  const tag           = watch('tag_destination')
  const photo_url     = watch('photo_url')

  // ─── Synthèse live ─────────────────────────────────────────────────
  const synth = useMemo(
    () => synthese(
      lignes.map(li => ({ quantite: li.quantite, prix_achat_ht: li.ingredient_prix_achat_ht })),
      Number(nb_portions) || 1,
      Number(prix_vente_ht) || 0,
      Number(cout_achat_ht) || 0,
    ),
    [lignes, nb_portions, prix_vente_ht, cout_achat_ht]
  )
  const fcSty = STATUT_FOOD_COST_STYLE[synth.statut]

  // ─── Allergènes auto-dérivés ──────────────────────────────────────
  const allergenes = useMemo(() => {
    const set = new Set<string>()
    lignes.forEach(li => li.ingredient_allergenes.forEach(a => set.add(a)))
    return Array.from(set).sort()
  }, [lignes])

  // ─── Helpers ingrédients ───────────────────────────────────────────
  function ajouterIngredient() {
    if (!pickerId) return
    const ing = ingredients.find(i => i.id === pickerId)
    if (!ing) return
    if (lignes.some(li => li.ingredient_id === ing.id)) {
      setError('root', { message: `${ing.nom} est déjà dans la recette.` })
      return
    }
    setError('root', { message: '' })
    setLignes(prev => [...prev, {
      id: newLocalId(),
      ingredient_id: ing.id,
      quantite: pickerQty > 0 ? pickerQty : 1,
      unite: ing.unite,
      ingredient_nom: ing.nom,
      ingredient_categorie: ing.categorie,
      ingredient_unite: ing.unite,
      ingredient_prix_achat_ht: ing.prix_achat_ht,
      ingredient_allergenes: ing.allergenes,
      ingredient_actif: ing.actif,
    }])
    setPickerQty(1)
  }
  function modifierQuantite(lineId: string, qty: number) {
    setLignes(prev => prev.map(li => li.id === lineId ? { ...li, quantite: qty } : li))
  }
  function supprimerLigne(lineId: string) {
    setLignes(prev => prev.filter(li => li.id !== lineId))
  }
  function appliquerPrixSuggere(margeCible: number) {
    const suggere = prixSuggerePourMarge(synth.cout_portion, margeCible)
    if (suggere > 0) setValue('prix_vente_ht', Math.round(suggere * 100) / 100, { shouldValidate: true })
  }

  // Tri des ingrédients pour le picker (par catégorie)
  const ingredientsParCategorie = useMemo(() => {
    const map = new Map<string, Ingredient[]>()
    ingredients.forEach(i => {
      if (!map.has(i.categorie)) map.set(i.categorie, [])
      map.get(i.categorie)!.push(i)
    })
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'fr'))
  }, [ingredients])

  // ─── Submit ────────────────────────────────────────────────────────
  function onSubmit(data: FormData) {
    // Achat-revente (le modèle du Fournil, ~95 % de la carte) : le produit
    // est acheté fini, son coût est `cout_achat_ht`, il n'a PAS de
    // composition. Exiger un ingrédient bloquait toute modification — y
    // compris un simple changement de prix. On exige désormais l'un OU
    // l'autre : une composition, ou un coût d'achat (0 accepté si le champ a
    // été volontairement renseigné, mais vide = rien du tout → on guide).
    if (lignes.length === 0 && (data.cout_achat_ht == null || Number.isNaN(data.cout_achat_ht))) {
      setError('root', {
        message: 'Indique soit un coût d\'achat (produit revendu tel quel), soit au moins un ingrédient (produit fabriqué).',
      })
      return
    }
    startTransition(async () => {
      try {
        const payload = {
          recette: data,
          ingredients: lignes.map(li => ({
            id: li.id,
            ingredient_id: li.ingredient_id,
            quantite: li.quantite,
            unite: li.unite,
          })),
        }
        if (isEdit && recette) {
          await updateRecette(recette.id, payload)
        } else {
          await createRecette(payload)
        }
        onSaved()
      } catch (e) {
        setError('root', { message: e instanceof Error ? e.message : 'Erreur sauvegarde' })
      }
    })
  }

  const rootError = errors.root?.message

  return (
    <Dialog open onClose={onClose} panelClassName="sm:max-w-4xl">
      <DialogHeader onClose={onClose}>
        <DialogTitle>{isEdit ? `✏️ ${recette?.nom}` : '➕ Nouvelle recette'}</DialogTitle>
        <DialogDescription>
          Modifie le prix d&apos;un ingrédient → la marge se recalcule automatiquement (single source of truth = ingrédient).
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="contents">
        <DialogBody className="space-y-5 sm:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
            {/* ─── COLONNE GAUCHE — formulaire ─── */}
            <div className="space-y-5 min-w-0">
              {/* Identité */}
              <section className="space-y-3">
                <SectionTitle>📋 Identité</SectionTitle>
                <Field label="Nom *" error={errors.nom?.message}>
                  <Input {...register('nom')} placeholder="Pizza Margherita" autoFocus />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Catégorie *" error={errors.categorie?.message}>
                    <Input {...register('categorie')} list="cats-recette" placeholder="Plats" />
                    <datalist id="cats-recette">
                      {CATEGORIES_RECETTE_DEFAUT.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </Field>
                  <Field label="Poste destinataire *" hint="Vers quel écran cette recette est-elle envoyée ?">
                    <Controller
                      control={control}
                      name="tag_destination"
                      render={({ field }) => (
                        <div className="grid grid-cols-3 gap-1">
                          {TAGS_DESTINATION.map(t => (
                            <button
                              type="button"
                              key={t}
                              onClick={() => field.onChange(t)}
                              className={cn(
                                'h-10 rounded-md border text-xs font-bold flex items-center justify-center gap-1 transition-colors',
                                field.value === t
                                  ? `${TAG_STYLE[t].cls} border-current`
                                  : 'border-input hover:bg-muted'
                              )}
                            >
                              <span>{TAG_STYLE[t].emoji}</span>
                              <span>{TAG_STYLE[t].label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    />
                  </Field>
                </div>
                <Field label="Description (visible client)">
                  <Textarea {...register('description')} placeholder="Description courte présentée au client…" rows={3} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Temps de préparation (min)" error={errors.temps_preparation?.message}>
                    <Input type="number" step={1} min={0} {...register('temps_preparation', { valueAsNumber: true })} />
                  </Field>
                  <Field label="Nb portions par recette *" error={errors.nb_portions?.message}>
                    <Input type="number" step={1} min={1} {...register('nb_portions', { valueAsNumber: true })} />
                  </Field>
                </div>
                <Field label="URL de la photo" hint="L'upload Cloudinary sera activé quand on aura les credentials.">
                  <Input type="url" {...register('photo_url')} placeholder="https://exemple.com/photo.jpg" />
                </Field>
                {photo_url && (
                  <div className="rounded-md border bg-muted/40 p-2 inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo_url}
                      alt="Aperçu"
                      className="h-24 w-auto object-cover rounded"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  </div>
                )}
              </section>

              <Separator />

              {/* Ingrédients */}
              <section className="space-y-3">
                <SectionTitle>🥬 Ingrédients</SectionTitle>

                {/* Picker */}
                <div className="rounded-md border p-3 bg-muted/30 grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-2 sm:items-end">
                  <Field label="Ingrédient à ajouter" className="m-0">
                    <Select value={pickerId} onChange={e => setPickerId(e.target.value)}>
                      {ingredients.length === 0 && <option value="">Aucun ingrédient actif</option>}
                      {ingredientsParCategorie.map(([cat, items]) => (
                        <optgroup key={cat} label={cat}>
                          {items.map(i => (
                            <option key={i.id} value={i.id}>
                              {i.nom} — {fmtPrix4(i.prix_achat_ht)}/{i.unite}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Quantité" className="m-0">
                    <Input
                      type="number"
                      step="0.001"
                      min={0}
                      value={pickerQty}
                      onChange={e => setPickerQty(parseFloat(e.target.value) || 0)}
                    />
                  </Field>
                  <Button type="button" onClick={ajouterIngredient} disabled={!pickerId} className="sm:self-end">
                    + Ajouter
                  </Button>
                </div>

                {/* Liste des ingrédients */}
                {lignes.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-4">
                    Aucun ingrédient — normal pour un produit acheté-revendu :
                    renseigne son coût d&apos;achat dans « Tarification » et c&apos;est tout.
                  </p>
                ) : (
                  <ul className="divide-y border rounded-md overflow-hidden">
                    {lignes.map(li => {
                      const cout = li.quantite * li.ingredient_prix_achat_ht
                      return (
                        <li key={li.id} className="p-2.5 flex items-center gap-2 bg-background">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm truncate">{li.ingredient_nom}</p>
                            <p className="text-xs text-muted-foreground">
                              {fmtPrix4(li.ingredient_prix_achat_ht)}/{li.ingredient_unite}
                              {li.ingredient_unite !== li.unite && (
                                <span className="text-amber-700 font-bold ml-1.5">⚠ unité ≠ {li.unite}</span>
                              )}
                            </p>
                          </div>
                          <Input
                            type="number"
                            step="0.001"
                            min={0}
                            value={li.quantite}
                            onChange={e => modifierQuantite(li.id, parseFloat(e.target.value) || 0)}
                            className="w-20 text-right tabular-nums h-9"
                          />
                          <span className="text-xs text-muted-foreground w-10 truncate">{li.unite}</span>
                          <span className="text-sm font-bold tabular-nums w-20 text-right">{fmtPrix(cout)}</span>
                          <Button type="button" size="sm" variant="ghost" onClick={() => supprimerLigne(li.id)} className="text-destructive h-9 w-9 p-0">×</Button>
                        </li>
                      )
                    })}
                    <li className="p-2.5 bg-muted/40 flex items-center justify-between text-sm font-bold">
                      <span>Total HT (toutes portions)</span>
                      <span className="tabular-nums">{fmtPrix(synth.cout_total)}</span>
                    </li>
                  </ul>
                )}
              </section>

              <Separator />

              {/* Tarification */}
              <section className="space-y-3">
                <SectionTitle>💶 Tarification</SectionTitle>
                {/* Le gérant raisonne en TTC — c'est le prix du panneau et
                    celui de la caisse. On saisit donc le TTC, le HT en découle
                    (4 décimales : à 2, un TTC de 2,40 € à 5,5 % est
                    inatteignable — cf. migration 0114). Le champ HT reste
                    éditable pour les cas particuliers. */}
                <Field label="Prix de vente TTC (€) — le prix du panneau">
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={prix_vente_ht > 0 ? (Math.round(prix_vente_ht * (1 + (Number(tvaCourante) || 0) / 100) * 100) / 100).toString() : ''}
                    onChange={e => {
                      const ttc = parseFloat(e.target.value)
                      if (Number.isFinite(ttc)) {
                        setValue('prix_vente_ht',
                          Math.round(ttc / (1 + (Number(tvaCourante) || 0) / 100) * 10000) / 10000,
                          { shouldValidate: true })
                      }
                    }}
                    className="font-bold text-lg tabular-nums"
                    placeholder="ex : 1.40"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Prix de vente HT (€) — calculé" error={errors.prix_vente_ht?.message}>
                    <Input
                      type="number"
                      step="0.0001"
                      min={0}
                      {...register('prix_vente_ht', { valueAsNumber: true })}
                      className="tabular-nums"
                    />
                  </Field>
                  {/* Achat-revente (Fournil) : quasi toute la carte est achetée
                      surgelée et revendue telle quelle. Le coût, c'est ce prix
                      d'achat — pas une composition. Il s'ajoute au coût des
                      ingrédients pour les rares produits transformés. */}
                  <Field label="Coût d'achat HT (€/unité) — achat-revente" error={errors.cout_achat_ht?.message}>
                    <Input
                      type="number"
                      step="0.0001"
                      min={0}
                      placeholder="ex : 0.32 (croissant surgelé)"
                      {...register('cout_achat_ht', {
                        setValueAs: v => (v === '' || v == null ? null : Number(v)),
                      })}
                      className="tabular-nums"
                    />
                  </Field>
                  {/* Le produit vendu porte rarement le nom de la matière
                      achetée : « Panuozzi » ← « PATON A PIZZA », les deux
                      cafés ← la même capsule. Ce libellé permet au scanner de
                      factures de reconnaître la ligne et de mettre le coût à
                      jour tout seul à chaque livraison. */}
                  <Field label="Libellé sur la facture fournisseur (optionnel)" error={errors.libelle_achat?.message}>
                    <Input
                      placeholder="ex : PATON A PIZZA — si différent du nom du produit"
                      {...register('libelle_achat')}
                    />
                  </Field>
                  {/* Ce qu'on compte dans le congélateur : « Pâton à pizza »,
                      pas « PATON A PIZZA 250G C=40 ». Les produits qui
                      partagent ce nom forment UNE ligne d'inventaire. */}
                  <Field label="Nom en stock (ce qu'on compte)" error={errors.nom_matiere?.message}>
                    <Input placeholder="ex : Pâton à pizza, Dosette de café" {...register('nom_matiere')} />
                  </Field>
                  <Field label="Unités vendues par unité achetée" error={errors.unites_par_achat?.message}>
                    <Input
                      type="number" step="0.001" min={0.001}
                      placeholder="1"
                      {...register('unites_par_achat', { valueAsNumber: true })}
                      className="tabular-nums"
                    />
                  </Field>
                  <Field label="TVA (%)" error={errors.tva?.message}>
                    <Select {...register('tva', { valueAsNumber: true })}>
                      <option value={10}>10% — restauration sur place</option>
                      <option value={5.5}>5,5% — vente à emporter</option>
                      <option value={20}>20% — boissons alcoolisées</option>
                      <option value={0}>0%</option>
                    </Select>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Indicatif. La TVA réelle est calculée auto à la commande
                      (10% sur place / 5,5% emporter / 20% si alcool).
                    </p>
                  </Field>
                </div>
                {/* Flag contient alcool — détermine si TVA fixée à 20% */}
                <label className="flex items-center gap-2 text-sm cursor-pointer rounded-md border bg-amber-50/50 border-amber-200 px-3 py-2">
                  <input type="checkbox" {...register('contient_alcool')} className="h-4 w-4" />
                  <span className="font-medium">🍷 Cette recette contient de l&apos;alcool</span>
                  <span className="text-[11px] text-zinc-600 ml-auto">→ TVA forcée à 20% peu importe la consommation</span>
                </label>
                {/* Prix suggérés */}
                {synth.cout_portion > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {MARGES_CIBLES.map(m => {
                      const p = prixSuggerePourMarge(synth.cout_portion, m)
                      return (
                        <button
                          type="button"
                          key={m}
                          onClick={() => appliquerPrixSuggere(m)}
                          className="rounded-md border p-2 text-left hover:bg-muted active:scale-[0.98] transition-all"
                        >
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pour {m}% marge</p>
                          <p className="font-bold text-base tabular-nums">{fmtPrix(p)}</p>
                          <p className="text-[10px] text-muted-foreground">cliquer pour appliquer</p>
                        </button>
                      )
                    })}
                  </div>
                )}
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
                        <Label htmlFor="r-actif" className="text-base cursor-pointer">Recette active</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Inactive : reste en base mais masquée des écrans cuisine/bar/serveur.
                        </p>
                      </div>
                      <Switch id="r-actif" checked={field.value} onCheckedChange={field.onChange} />
                    </div>
                  )}
                />
              </section>

              {/* Vente en ligne (Phase 0 — préparation site web) */}
              <section className="space-y-3">
                <p className="text-xs uppercase tracking-wider text-emerald-700 font-bold">🌐 Vente en ligne</p>
                <Controller
                  control={control}
                  name="vendable_online"
                  render={({ field }) => (
                    <div className="flex items-center justify-between rounded-md border-2 border-emerald-200 bg-emerald-50 p-3">
                      <div className="min-w-0">
                        <Label htmlFor="r-online" className="text-base cursor-pointer">Vendable en ligne (site web)</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Si activé : la recette apparaîtra sur la carte du site web et sera commandable en click & collect.
                        </p>
                      </div>
                      <Switch id="r-online" checked={field.value} onCheckedChange={field.onChange} />
                    </div>
                  )}
                />
                <Field label="Photo HD pour le site (URL publique)" error={errors.image_url?.message}>
                  <input
                    type="url"
                    placeholder="https://..."
                    {...register('image_url')}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Recommandé : 1200×800px, JPG/WebP. Cloudinary, Imgur, ou ton CDN. Différente de la photo interne (photo_url).
                  </p>
                </Field>
              </section>

              {rootError && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 font-medium">
                  ⚠️ {rootError}
                </p>
              )}
            </div>

            {/* ─── COLONNE DROITE — calc card sticky ─── */}
            <aside className="lg:sticky lg:top-0 lg:self-start space-y-3">
              {/* Bandeau food cost */}
              <div className={cn('rounded-lg border p-4', fcSty.bg, fcSty.border)}>
                <p className={cn('text-xs font-bold uppercase tracking-wider', fcSty.text)}>Food cost</p>
                <p className={cn('text-4xl font-bold tabular-nums mt-1', fcSty.text)}>
                  {fmtPct(synth.food_cost_pct)}
                </p>
                <p className={cn('text-xs mt-1', fcSty.text)}>
                  Statut : <b>{fcSty.label}</b>
                </p>
                {alerteFoodCost(synth.food_cost_pct) && (
                  <div className="mt-3 rounded-md bg-red-600 text-white px-2.5 py-1.5 text-xs font-bold">
                    🚨 Alerte — food cost &gt; 30%. Augmente le prix ou réduis les coûts.
                  </div>
                )}
              </div>

              {/* Détails */}
              <div className="rounded-lg border p-3 space-y-1.5 bg-background text-sm">
                <KPILine label="Coût total HT"   value={fmtPrix(synth.cout_total)} />
                <KPILine label="Coût par portion" value={fmtPrix(synth.cout_portion)} bold />
                <KPILine label="Prix de vente HT" value={fmtPrix(Number(prix_vente_ht) || 0)} />
                <Separator className="my-2" />
                <KPILine label="Marge brute €" value={fmtPrix(synth.marge_eur)} bold />
                <KPILine label="Marge brute %" value={fmtPct(synth.marge_pct)} />
              </div>

              {/* Allergènes auto-dérivés */}
              <div className="rounded-lg border p-3 bg-background">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  ⚠️ Allergènes <span className="font-normal">(auto)</span>
                </p>
                {allergenes.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Aucun allergène détecté dans les ingrédients.</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {allergenes.map(a => (
                      <Badge key={a} variant="outline" className="gap-1">
                        <span>{iconAllergene(a)}</span>
                        <span className="text-xs">{labelAllergene(a)}</span>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Tag destination preview */}
              <div className={cn('rounded-lg border p-3', TAG_STYLE[tag].cls)}>
                <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">Routage</p>
                <p className="font-bold flex items-center gap-2">
                  <span className="text-2xl">{TAG_STYLE[tag].emoji}</span>
                  <span>{TAG_STYLE[tag].label}</span>
                </p>
                <p className="text-xs opacity-80 mt-1">
                  Cette recette ira vers l&apos;écran <b>/{tag === 'PIZZA' ? 'cuisine (col. droite)' : tag.toLowerCase()}</b>.
                </p>
              </div>
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

function Field({
  label, error, hint, children, className,
}: {
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
  className?: string
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

function KPILine({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('tabular-nums', bold ? 'font-bold' : 'font-medium')}>{value}</span>
    </div>
  )
}

// `isNewId` is intentionally re-exported by types for the actions diff;
// no use here.
export { isNewId }
