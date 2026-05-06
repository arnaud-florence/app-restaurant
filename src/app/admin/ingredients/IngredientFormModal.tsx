'use client'

import { useTransition } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'

import { type Ingredient, ALLERGENES, CATEGORIES_DEFAUT, UNITES_DEFAUT, defaultIngredient } from './types'
import { createIngredient, updateIngredient } from './actions'

// Schéma client (miroir du schéma serveur dans actions.ts).
// On reste sur z.number() ici (pas .coerce) parce que les inputs RHF sont
// déjà numériques grâce à `valueAsNumber: true`. Le serveur a son propre
// schéma avec .coerce pour la défense en profondeur.
const formSchema = z.object({
  nom: z.string().trim().min(1, 'Nom obligatoire').max(120),
  categorie: z.string().trim().min(1, 'Catégorie obligatoire').max(60),
  unite: z.string().trim().min(1, 'Unité obligatoire').max(20),
  prix_achat_ht: z.number().min(0, 'Prix ≥ 0').max(99999),
  fournisseur_principal: z.string().max(120).optional().nullable(),
  fournisseur_secondaire: z.string().max(120).optional().nullable(),
  stock_actuel:  z.number().min(0),
  stock_minimum: z.number().min(0),
  stock_maximum: z.number().min(0),
  dlc_moyenne_jours: z.number().int().min(0).max(3650),
  allergenes: z.array(z.string()),
  actif: z.boolean(),
})

type FormData = z.infer<typeof formSchema>

export default function IngredientFormModal({
  ingredient, onClose, onSaved,
}: {
  ingredient: Ingredient | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!ingredient
  const [isPending, startTransition] = useTransition()

  const defaults: FormData = ingredient
    ? {
        nom: ingredient.nom,
        categorie: ingredient.categorie,
        unite: ingredient.unite,
        prix_achat_ht: ingredient.prix_achat_ht,
        fournisseur_principal: ingredient.fournisseur_principal ?? '',
        fournisseur_secondaire: ingredient.fournisseur_secondaire ?? '',
        stock_actuel: ingredient.stock_actuel,
        stock_minimum: ingredient.stock_minimum,
        stock_maximum: ingredient.stock_maximum,
        dlc_moyenne_jours: ingredient.dlc_moyenne_jours,
        allergenes: ingredient.allergenes,
        actif: ingredient.actif,
      }
    : { ...defaultIngredient() } as FormData

  const {
    register, handleSubmit, control, watch, setError,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: defaults,
  })

  const allergenes = watch('allergenes')

  function toggleAllergene(key: string, current: string[]): string[] {
    return current.includes(key) ? current.filter(a => a !== key) : [...current, key]
  }

  function onSubmit(data: FormData) {
    startTransition(async () => {
      try {
        if (isEdit && ingredient) {
          await updateIngredient(ingredient.id, data)
        } else {
          await createIngredient(data)
        }
        onSaved()
      } catch (e) {
        setError('root', { message: e instanceof Error ? e.message : 'Erreur sauvegarde' })
      }
    })
  }

  const rootError = errors.root?.message

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader onClose={onClose}>
        <DialogTitle>{isEdit ? `✏️ Modifier ${ingredient?.nom}` : '➕ Nouvel ingrédient'}</DialogTitle>
        <DialogDescription>
          Tous les champs sont enregistrés directement dans Supabase. La modification du prix logge automatiquement l&apos;historique.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="contents">
        <DialogBody className="space-y-5">
          {/* ─── Identité ─── */}
          <section className="space-y-3">
            <SectionTitle>📋 Identité</SectionTitle>

            <Field label="Nom *" error={errors.nom?.message}>
              <Input {...register('nom')} placeholder="Tomate San Marzano" autoFocus />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Catégorie *" error={errors.categorie?.message}>
                <Input {...register('categorie')} list="cats-list" placeholder="Légumes" />
                <datalist id="cats-list">
                  {CATEGORIES_DEFAUT.map(c => <option key={c} value={c} />)}
                </datalist>
              </Field>
              <Field label="Unité *" error={errors.unite?.message}>
                <Select {...register('unite')}>
                  {UNITES_DEFAUT.map(u => <option key={u} value={u}>{u}</option>)}
                </Select>
              </Field>
            </div>
          </section>

          <Separator />

          {/* ─── Prix & fournisseurs ─── */}
          <section className="space-y-3">
            <SectionTitle>💶 Prix & fournisseurs</SectionTitle>

            <Field label="Prix d'achat HT (4 décimales) *" error={errors.prix_achat_ht?.message}>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  {...register('prix_achat_ht', { valueAsNumber: true })}
                  className="font-bold text-lg"
                />
                <span className="text-sm font-semibold text-muted-foreground whitespace-nowrap">€ / unité</span>
              </div>
            </Field>

            <Field label="Fournisseur principal">
              <Input {...register('fournisseur_principal')} placeholder="Maraîcher du coin" />
            </Field>

            <Field label="Fournisseur secondaire">
              <Input {...register('fournisseur_secondaire')} placeholder="Fournisseur de secours" />
            </Field>
          </section>

          <Separator />

          {/* ─── Stock ─── */}
          <section className="space-y-3">
            <SectionTitle>📦 Stock</SectionTitle>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Actuel *" error={errors.stock_actuel?.message}>
                <Input type="number" step="0.001" min="0" {...register('stock_actuel', { valueAsNumber: true })} />
              </Field>
              <Field label="Min." error={errors.stock_minimum?.message}>
                <Input type="number" step="0.001" min="0" {...register('stock_minimum', { valueAsNumber: true })} />
              </Field>
              <Field label="Max." error={errors.stock_maximum?.message}>
                <Input type="number" step="0.001" min="0" {...register('stock_maximum', { valueAsNumber: true })} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              ⚠ ROUGE quand actuel = 0 · ORANGE quand actuel ≤ minimum · VERT au-dessus.
            </p>

            <Field label="DLC moyenne (jours)" error={errors.dlc_moyenne_jours?.message}>
              <Input type="number" step="1" min="0" {...register('dlc_moyenne_jours', { valueAsNumber: true })} />
            </Field>
          </section>

          <Separator />

          {/* ─── Allergènes ─── */}
          <section className="space-y-3">
            <SectionTitle>⚠️ Allergènes <span className="text-xs font-normal text-muted-foreground">(14 majeurs UE)</span></SectionTitle>
            <Controller
              control={control}
              name="allergenes"
              render={({ field }) => (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ALLERGENES.map(a => {
                    const active = field.value?.includes(a.key) ?? false
                    return (
                      <label
                        key={a.key}
                        className={`flex items-center gap-2 rounded-md border p-2.5 cursor-pointer transition-colors ${
                          active ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                        }`}
                      >
                        <Checkbox
                          checked={active}
                          onCheckedChange={() => field.onChange(toggleAllergene(a.key, field.value ?? []))}
                          aria-label={a.label}
                        />
                        <span className="text-base">{a.icon}</span>
                        <span className="text-sm font-medium select-none">{a.label}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            />
            {allergenes && allergenes.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {allergenes.length} allergène{allergenes.length > 1 ? 's' : ''} déclaré{allergenes.length > 1 ? 's' : ''}.
              </p>
            )}
          </section>

          <Separator />

          {/* ─── Statut ─── */}
          <section>
            <Controller
              control={control}
              name="actif"
              render={({ field }) => (
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div className="min-w-0">
                    <Label htmlFor="actif" className="text-base cursor-pointer">Ingrédient actif</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Désactivé : reste en base mais masqué des nouvelles recettes.
                    </p>
                  </div>
                  <Switch id="actif" checked={field.value} onCheckedChange={field.onChange} />
                </div>
              )}
            />
          </section>

          {rootError && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 font-medium">
              ⚠️ {rootError}
            </p>
          )}
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{children}</h3>
}

function Field({
  label, error, children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
