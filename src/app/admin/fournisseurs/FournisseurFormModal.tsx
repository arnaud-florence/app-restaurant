'use client'

import { useTransition } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

import { type Fournisseur, JOURS_SEMAINE, type JourSemaine } from '@/lib/fournisseurs'
import { createFournisseur, updateFournisseur } from './actions'

const formSchema = z.object({
  nom: z.string().trim().min(1, 'Nom obligatoire').max(160),
  contact: z.string().max(160),
  telephone: z.string().max(40),
  email: z.string().max(160),
  adresse: z.string().max(500),
  conditions_tarifaires: z.string().max(500),
  delai_livraison_jours: z.number().int().min(0).max(60),
  minimum_commande: z.number().min(0).max(99999),
  jours_livraison: z.array(z.enum(JOURS_SEMAINE)),
  note_qualite: z.number().int().min(0).max(5),
  note_ponctualite: z.number().int().min(0).max(5),
  actif: z.boolean(),
})
type FormData = z.infer<typeof formSchema>

const DEFAULTS: FormData = {
  nom: '', contact: '', telephone: '', email: '', adresse: '',
  conditions_tarifaires: '', delai_livraison_jours: 1, minimum_commande: 0,
  jours_livraison: [], note_qualite: 5, note_ponctualite: 5, actif: true,
}

export default function FournisseurFormModal({
  fournisseur, onClose, onSaved,
}: {
  fournisseur: Fournisseur | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!fournisseur
  const [isPending, startTransition] = useTransition()

  const defaults: FormData = fournisseur ? {
    nom: fournisseur.nom,
    contact: fournisseur.contact ?? '',
    telephone: fournisseur.telephone ?? '',
    email: fournisseur.email ?? '',
    adresse: fournisseur.adresse ?? '',
    conditions_tarifaires: fournisseur.conditions_tarifaires ?? '',
    delai_livraison_jours: fournisseur.delai_livraison_jours,
    minimum_commande: fournisseur.minimum_commande,
    jours_livraison: (fournisseur.jours_livraison.filter(j => (JOURS_SEMAINE as readonly string[]).includes(j))) as JourSemaine[],
    note_qualite: fournisseur.note_qualite,
    note_ponctualite: fournisseur.note_ponctualite,
    actif: fournisseur.actif,
  } : DEFAULTS

  const {
    register, handleSubmit, control, setError,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: defaults,
  })

  function onSubmit(data: FormData) {
    startTransition(async () => {
      try {
        if (isEdit && fournisseur) await updateFournisseur(fournisseur.id, data)
        else await createFournisseur(data)
        onSaved()
      } catch (e) {
        setError('root', { message: e instanceof Error ? e.message : 'Erreur sauvegarde' })
      }
    })
  }

  return (
    <Dialog open onClose={onClose} panelClassName="sm:max-w-2xl">
      <DialogHeader onClose={onClose}>
        <DialogTitle>{isEdit ? `✏️ ${fournisseur?.nom}` : '➕ Nouveau fournisseur'}</DialogTitle>
        <DialogDescription>
          Fiche complète : contact, conditions, délais, jours de livraison, notes qualité.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="contents">
        <DialogBody className="space-y-4">
          {/* Identité */}
          <div className="space-y-3">
            <SectionTitle>📋 Identité</SectionTitle>
            <Field label="Nom *" error={errors.nom?.message}>
              <Input {...register('nom')} placeholder="Crémerie Local" autoFocus />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Contact"><Input {...register('contact')} placeholder="Marie Dupont" /></Field>
              <Field label="Téléphone"><Input type="tel" {...register('telephone')} placeholder="05 61 23 45 67" /></Field>
            </div>
            <Field label="Email"><Input type="email" {...register('email')} placeholder="commandes@crémerie.fr" /></Field>
            <Field label="Adresse">
              <Textarea {...register('adresse')} rows={2} placeholder="15 rue du Lavoir, 31200 Toulouse" />
            </Field>
          </div>

          <Separator />

          {/* Conditions */}
          <div className="space-y-3">
            <SectionTitle>📜 Conditions commerciales</SectionTitle>
            <Field label="Conditions tarifaires">
              <Textarea {...register('conditions_tarifaires')} rows={2} placeholder="30 jours fin de mois" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Délai livraison (jours)">
                <Input type="number" min={0} max={60} {...register('delai_livraison_jours', { valueAsNumber: true })} />
              </Field>
              <Field label="Minimum commande (€)">
                <Input type="number" step="1" min={0} {...register('minimum_commande', { valueAsNumber: true })} />
              </Field>
            </div>
            <Field label="Jours de livraison">
              <Controller
                control={control}
                name="jours_livraison"
                render={({ field }) => (
                  <div className="grid grid-cols-7 gap-1">
                    {JOURS_SEMAINE.map(j => {
                      const active = field.value?.includes(j) ?? false
                      return (
                        <button
                          type="button"
                          key={j}
                          onClick={() => {
                            const current = field.value ?? []
                            field.onChange(active ? current.filter(x => x !== j) : [...current, j])
                          }}
                          className={cn(
                            'h-9 rounded-md border text-[11px] font-bold uppercase transition-colors',
                            active ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted'
                          )}
                        >
                          {j.slice(0, 3)}
                        </button>
                      )
                    })}
                  </div>
                )}
              />
            </Field>
          </div>

          <Separator />

          {/* Notes */}
          <div className="space-y-3">
            <SectionTitle>⭐ Notes qualité (1 à 5)</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <Controller
                control={control}
                name="note_qualite"
                render={({ field }) => (
                  <Field label={`Qualité — ${field.value}/5`}>
                    <input
                      type="range" min={0} max={5} step={1}
                      value={field.value} onChange={e => field.onChange(parseInt(e.target.value, 10))}
                      className="w-full"
                    />
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="note_ponctualite"
                render={({ field }) => (
                  <Field label={`Ponctualité — ${field.value}/5`}>
                    <input
                      type="range" min={0} max={5} step={1}
                      value={field.value} onChange={e => field.onChange(parseInt(e.target.value, 10))}
                      className="w-full"
                    />
                  </Field>
                )}
              />
            </div>
          </div>

          <Separator />

          {/* Actif */}
          <Controller
            control={control}
            name="actif"
            render={({ field }) => (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="min-w-0">
                  <Label htmlFor="f-actif" className="cursor-pointer text-base">Fournisseur actif</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Inactif : reste en base mais masqué dans les sélecteurs.</p>
                </div>
                <Switch id="f-actif" checked={field.value} onCheckedChange={field.onChange} />
              </div>
            )}
          />

          {errors.root?.message && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">⚠️ {errors.root.message}</p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting || isPending}>Annuler</Button>
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

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
