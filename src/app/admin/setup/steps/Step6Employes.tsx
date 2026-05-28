'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { ROLES, ROLE_LABELS, type Employe, newLocalId } from '../types'

export default function Step6Employes({
  value, onChange,
}: {
  value: Employe[]
  onChange: (v: Employe[]) => void
}) {
  function ajouter() {
    onChange([...value, {
      id: newLocalId(),
      prenom: '', nom: '', email: '',
      poste: 'serveur',
    }])
  }
  function modifier(id: string, patch: Partial<Employe>) {
    onChange(value.map(e => e.id === id ? { ...e, ...patch } : e))
  }
  function supprimer(id: string) {
    onChange(value.filter(e => e.id !== id))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>👥 Comptes employés</CardTitle>
        <CardDescription>
          Ajoute ton équipe avec leur rôle. Le système de connexion (email + mot de passe + accès par rôle) sera activé dans une étape ultérieure.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
          ℹ️ Pour l&apos;instant, on enregistre juste les fiches employés (nom, email, rôle).
          La création des comptes Supabase Auth + le verrouillage par rôle viendront avec le module dédié.
        </div>

        {value.length === 0 && (
          <p className="text-sm text-muted-foreground italic text-center py-6">
            Aucun employé pour l&apos;instant — ajoutes-en un.
          </p>
        )}

        {value.map(e => (
          <div key={e.id} className="rounded-lg border p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor={`p-${e.id}`} className="text-xs">Prénom <span className="text-destructive">*</span></Label>
                <Input
                  id={`p-${e.id}`}
                  value={e.prenom}
                  onChange={ev => modifier(e.id, { prenom: ev.target.value })}
                  placeholder="Marie"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`n-${e.id}`} className="text-xs">Nom <span className="text-destructive">*</span></Label>
                <Input
                  id={`n-${e.id}`}
                  value={e.nom}
                  onChange={ev => modifier(e.id, { nom: ev.target.value })}
                  placeholder="Dupont"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor={`e-${e.id}`} className="text-xs">Email</Label>
                <Input
                  id={`e-${e.id}`}
                  type="email"
                  value={e.email}
                  onChange={ev => modifier(e.id, { email: ev.target.value })}
                  placeholder="marie@casatasia.fr"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`r-${e.id}`} className="text-xs">Rôle</Label>
                <Select
                  id={`r-${e.id}`}
                  value={e.poste}
                  onChange={ev => modifier(e.id, { poste: ev.target.value as Employe['poste'] })}
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r].icon} {ROLE_LABELS[r].label}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => supprimer(e.id)} className="text-destructive">
                🗑 Supprimer
              </Button>
            </div>
          </div>
        ))}

        <Button variant="outline" onClick={ajouter} className="w-full">
          + Ajouter un employé
        </Button>
      </CardContent>
    </Card>
  )
}
