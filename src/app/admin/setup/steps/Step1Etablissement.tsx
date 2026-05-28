'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type Etablissement } from '../types'

export default function Step1Etablissement({
  value, onChange,
}: {
  value: Etablissement
  onChange: (v: Etablissement) => void
}) {
  function set<K extends keyof Etablissement>(k: K, v: Etablissement[K]) {
    onChange({ ...value, [k]: v })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>🏛️ Informations de l&apos;établissement</CardTitle>
        <CardDescription>
          Ces informations apparaîtront sur les tickets de caisse, les emails clients et le site public.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="nom">Nom de l&apos;établissement <span className="text-destructive">*</span></Label>
          <Input
            id="nom"
            value={value.nom}
            onChange={e => set('nom', e.target.value)}
            placeholder="CASATASIA"
            required
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adresse">Adresse complète</Label>
          <Input
            id="adresse"
            value={value.adresse}
            onChange={e => set('adresse', e.target.value)}
            placeholder="12 Route des Vignes, 31000 Toulouse"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="telephone">Téléphone</Label>
            <Input
              id="telephone"
              type="tel"
              value={value.telephone}
              onChange={e => set('telephone', e.target.value)}
              placeholder="05 12 34 56 78"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={value.email}
              onChange={e => set('email', e.target.value)}
              placeholder="contact@casatasia.fr"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="site_web">Site web</Label>
          <Input
            id="site_web"
            type="url"
            value={value.site_web}
            onChange={e => set('site_web', e.target.value)}
            placeholder="https://casatasia.fr"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="siret">SIRET</Label>
            <Input
              id="siret"
              value={value.siret}
              onChange={e => set('siret', e.target.value)}
              placeholder="123 456 789 00012"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tva_intra">N° TVA intracommunautaire</Label>
            <Input
              id="tva_intra"
              value={value.tva_intra}
              onChange={e => set('tva_intra', e.target.value)}
              placeholder="FR12345678901"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="logo_url">URL du logo</Label>
          <Input
            id="logo_url"
            type="url"
            value={value.logo_url}
            onChange={e => set('logo_url', e.target.value)}
            placeholder="https://exemple.com/mon-logo.png"
          />
          <p className="text-xs text-muted-foreground">
            ℹ️ Pour l&apos;upload direct depuis ton ordinateur, on activera ça quand on aura le service_role_key + un bucket Storage.
            En attendant, héberge ton logo n&apos;importe où (Cloudinary, S3, ImgBB, etc.) et colle l&apos;URL ici.
          </p>
          {value.logo_url && (
            <div className="mt-3 p-3 border rounded-md bg-muted/40 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value.logo_url}
                alt="Aperçu logo"
                className="h-16 w-auto object-contain"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
