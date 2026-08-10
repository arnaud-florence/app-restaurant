'use client'

import { useState, useTransition } from 'react'
import type { Etablissement } from './page'
import { updateEtablissement, createEtablissement } from './actions'

const TYPE_LABEL: Record<string, { emoji: string; label: string }> = {
  restaurant: { emoji: '🍽', label: 'Restaurant' },
  fournil:    { emoji: '🥖', label: 'Fournil' },
  autre:      { emoji: '🏢', label: 'Autre' },
}

export default function EtablissementsClient({ initial }: { initial: Etablissement[] }) {
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900">🏪 Points de vente</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Les points de vente de <b>CASATASIA</b> (une seule entité, CA consolidé) : restauration, bar,
          fournil, snack, et les services tiers (FDJ, tabac, colis).
        </p>
      </header>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        ℹ️ Tout est rattaché à l'entité <b>CASATASIA</b> (CA consolidé). Les <b>services tiers</b> (FDJ,
        tabac, colis) sont marqués « hors CA principal » → suivis en commissions, jamais dans le CA.
        Le filtrage opérationnel complet s'activera une fois la migration de scoping exécutée.
      </div>

      <CreateForm />

      <div className="space-y-4">
        {initial.map(e => <EtablissementCard key={e.id} etab={e} />)}
      </div>
    </div>
  )
}

function CreateForm() {
  const [nom, setNom] = useState('')
  const [type, setType] = useState<'restaurant' | 'fournil' | 'autre'>('fournil')
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function submit() {
    if (!nom.trim()) return
    start(async () => {
      const r = await createEtablissement({ nom: nom.trim(), type })
      if (r.ok) { setNom(''); setMsg('✓ Établissement créé') }
      else setMsg(`Erreur : ${r.error}`)
      setTimeout(() => setMsg(null), 3000)
    })
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-zinc-700 mb-2">Ajouter un point de vente</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-zinc-500 mb-1">Nom</label>
          <input
            value={nom}
            onChange={e => setNom(e.target.value)}
            placeholder="Ex : Bar, Snack, FDJ…"
            className="w-full h-11 px-3 rounded-md border border-zinc-300 text-sm focus:border-blue-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Type</label>
          <select
            value={type}
            onChange={e => setType(e.target.value as typeof type)}
            className="h-11 px-3 rounded-md border border-zinc-300 text-sm bg-white"
          >
            <option value="restaurant">🍽 Restaurant</option>
            <option value="fournil">🥖 Fournil</option>
            <option value="autre">🏢 Autre</option>
          </select>
        </div>
        <button
          onClick={submit}
          disabled={pending || !nom.trim()}
          className="h-11 px-4 rounded-md bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-700 disabled:opacity-40"
        >
          {pending ? 'Création…' : 'Ajouter'}
        </button>
      </div>
      {msg && <p className="text-xs mt-2 text-zinc-600">{msg}</p>}
    </div>
  )
}

function EtablissementCard({ etab }: { etab: Etablissement }) {
  const [form, setForm] = useState({
    nom: etab.nom,
    type: (etab.type ?? 'restaurant') as 'restaurant' | 'fournil' | 'autre',
    categorie: (etab.categorie ?? 'autre') as 'restauration' | 'boulangerie' | 'tabac_presse' | 'service_tiers' | 'autre',
    inclus_ca_principal: etab.inclus_ca_principal,
    mode_fiscal: (etab.mode_fiscal ?? 'rattache') as 'rattache' | 'autonome',
    adresse: etab.adresse ?? '',
    telephone: etab.telephone ?? '',
    email: etab.email ?? '',
    siret: etab.siret ?? '',
    tva_intra: etab.tva_intra ?? '',
    actif: etab.actif,
  })
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const t = TYPE_LABEL[form.type] ?? TYPE_LABEL.autre

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function save() {
    start(async () => {
      const r = await updateEtablissement({
        id: etab.id,
        nom: form.nom,
        type: form.type,
        categorie: form.categorie,
        inclus_ca_principal: form.inclus_ca_principal,
        mode_fiscal: form.mode_fiscal,
        adresse: form.adresse || null,
        telephone: form.telephone || null,
        email: form.email || null,
        siret: form.siret || null,
        tva_intra: form.tva_intra || null,
        actif: form.actif,
      })
      setMsg(r.ok ? '✓ Enregistré' : `Erreur : ${r.error}`)
      setTimeout(() => setMsg(null), 3000)
    })
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xl">{t.emoji}</span>
          <div className="min-w-0">
            <p className="font-bold text-zinc-900 truncate">{form.nom || '(sans nom)'}</p>
            <p className="text-xs text-zinc-400 font-mono">{etab.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {etab.is_principal && (
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">Principal</span>
          )}
          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${form.inclus_ca_principal ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {form.inclus_ca_principal ? 'CA principal' : 'Hors CA (tiers)'}
          </span>
          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${form.actif ? 'bg-blue-100 text-blue-700' : 'bg-zinc-100 text-zinc-500'}`}>
            {form.actif ? 'Actif' : 'Inactif'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nom"><input className={inputCls} value={form.nom} onChange={e => set('nom', e.target.value)} /></Field>
        <Field label="Type">
          <select className={inputCls} value={form.type} onChange={e => set('type', e.target.value as typeof form.type)}>
            <option value="restaurant">🍽 Restaurant</option>
            <option value="fournil">🥖 Fournil</option>
            <option value="autre">🏢 Autre</option>
          </select>
        </Field>
        <Field label="Catégorie d'activité">
          <select className={inputCls} value={form.categorie} onChange={e => set('categorie', e.target.value as typeof form.categorie)}>
            <option value="restauration">🍽 Restauration</option>
            <option value="boulangerie">🥖 Boulangerie</option>
            <option value="tabac_presse">🚬 Tabac / Presse</option>
            <option value="service_tiers">🤝 Service tiers (commissions)</option>
            <option value="autre">🏢 Autre</option>
          </select>
        </Field>
        <Field label="Mode fiscal">
          <select className={inputCls} value={form.mode_fiscal} onChange={e => set('mode_fiscal', e.target.value as typeof form.mode_fiscal)}>
            <option value="rattache">Rattaché (CA consolidé)</option>
            <option value="autonome">Autonome (entité séparée)</option>
          </select>
        </Field>
        <Field label="Adresse"><input className={inputCls} value={form.adresse} onChange={e => set('adresse', e.target.value)} /></Field>
        <Field label="Téléphone"><input className={inputCls} value={form.telephone} onChange={e => set('telephone', e.target.value)} /></Field>
        <Field label="Email"><input className={inputCls} value={form.email} onChange={e => set('email', e.target.value)} /></Field>
        <Field label="SIRET"><input className={inputCls} value={form.siret} onChange={e => set('siret', e.target.value)} /></Field>
        <Field label="TVA intracommunautaire"><input className={inputCls} value={form.tva_intra} onChange={e => set('tva_intra', e.target.value)} /></Field>
        <Field label="Statut">
          <label className="inline-flex items-center gap-2 h-11">
            <input type="checkbox" checked={form.actif} onChange={e => set('actif', e.target.checked)} className="h-4 w-4" />
            <span className="text-sm text-zinc-700">Établissement actif</span>
          </label>
        </Field>
      </div>

      {/* Flag métier clé : inclusion dans le CA principal (exclusion pour compte de tiers) */}
      <label className="mt-3 flex items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 cursor-pointer">
        <input
          type="checkbox"
          checked={form.inclus_ca_principal}
          onChange={e => set('inclus_ca_principal', e.target.checked)}
          className="h-5 w-5 mt-0.5"
        />
        <span>
          <span className="block text-sm font-bold text-zinc-800">Compte dans le CA principal</span>
          <span className="block text-xs text-zinc-500">
            Décoche pour les <b>encaissements pour compte de tiers</b> (tabac, FDJ, relais colis) : ils s'affichent
            à part (commissions), jamais dans le CA principal.
          </span>
        </span>
      </label>

      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={save}
          disabled={pending}
          className="h-11 px-5 rounded-md bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-700 disabled:opacity-40"
        >
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {msg && <span className="text-xs text-zinc-600">{msg}</span>}
      </div>
    </div>
  )
}

const inputCls = 'w-full h-11 px-3 rounded-md border border-zinc-300 text-sm focus:border-blue-500 outline-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
