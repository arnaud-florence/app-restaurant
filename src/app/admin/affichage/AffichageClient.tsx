'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Pencil, Trash2, Copy, Check, X, ExternalLink, QrCode, Tv, Bell } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import {
  type MenuItem, type Promo, type AppelServeur, type SectionMenu,
  SECTION_INFO, MOTIF_INFO, STATUT_APPEL_INFO, fmtPrix, ageMin,
} from '@/lib/affichage'
import {
  creerMenuItem, updateMenuItem, supprimerMenuItem, dupliquerMenu,
  creerPromo, updatePromo, supprimerPromo,
  prendreEnChargeAppel, annulerAppel,
} from './actions'

type Table = { id: string; numero: string; capacite: number; zone: string }
type AppelEnrichi = AppelServeur & { pris_par?: { prenom?: string; nom?: string } | null }

export default function AffichageClient({
  menu, promos, appels, tables, today,
}: {
  menu: MenuItem[]; promos: Promo[]; appels: AppelEnrichi[]; tables: Table[]; today: string
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'menu' | 'promos' | 'appels' | 'qr'>('menu')
  const [, startTransition] = useTransition()

  // Realtime sur appels
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel('admin-affichage-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appels_serveur' }, () => router.refresh())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [router])

  const appelsOuverts = appels.filter(a => a.statut === 'en_attente')
  const menuToday = useMemo(() => menu.filter(m => m.jour === today), [menu, today])

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xl shadow-lg shadow-violet-500/30 shrink-0">
            <Tv className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-600">Salle</p>
            <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight leading-none mt-0.5">Affichage</h1>
            <p className="text-xs text-zinc-500 mt-1">Menu du jour, promos, événements TV + QR appel serveur.</p>
          </div>
        </div>
        <Link href="/affichage/tv" target="_blank">
          <Button variant="outline" className="gap-2">
            <ExternalLink className="h-4 w-4" /> Ouvrir l'écran TV
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <TabBtn active={tab === 'menu'}  onClick={() => setTab('menu')}>📋 Menu du jour</TabBtn>
        <TabBtn active={tab === 'promos'} onClick={() => setTab('promos')}>✨ Promos</TabBtn>
        <TabBtn active={tab === 'appels'} onClick={() => setTab('appels')}>
          <Bell className="h-4 w-4 inline mr-1" /> Appels {appelsOuverts.length > 0 && <Badge className="ml-1 bg-red-500">{appelsOuverts.length}</Badge>}
        </TabBtn>
        <TabBtn active={tab === 'qr'}     onClick={() => setTab('qr')}><QrCode className="h-4 w-4 inline mr-1" /> QR tables</TabBtn>
      </div>

      {tab === 'menu'   && <MenuPanel menu={menuToday} today={today} />}
      {tab === 'promos' && <PromosPanel promos={promos} />}
      {tab === 'appels' && <AppelsPanel appels={appels} />}
      {tab === 'qr'     && <QrPanel tables={tables} />}
    </div>
  )
}

function TabBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn(
      'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
      active ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-zinc-600 hover:text-zinc-900',
    )}>{children}</button>
  )
}

// ─── Menu du jour ────────────────────────────────────────────────
function MenuPanel({ menu, today }: { menu: MenuItem[]; today: string }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState<MenuItem | true | null>(null)
  const [, startTransition] = useTransition()
  const [duplDate, setDuplDate] = useState('')

  const sections = (['entree', 'plat', 'dessert', 'boisson', 'autre'] as const)

  return (
    <Card className="p-4">
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <h2 className="font-semibold">Menu du {format(parseISO(today), 'EEEE d MMMM yyyy', { locale: fr })}</h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Ajouter un item
          </Button>
          <div className="flex gap-1 items-center">
            <Input type="date" value={duplDate} onChange={e => setDuplDate(e.target.value)} className="w-40" placeholder="Date cible" />
            <Button size="sm" variant="outline" disabled={!duplDate || menu.length === 0} className="gap-1"
              onClick={() => {
                if (!duplDate) return
                if (!confirm(`Dupliquer ce menu sur ${duplDate} ?`)) return
                startTransition(() => dupliquerMenu({ jour_source: today, jour_cible: duplDate }).then(() => { setDuplDate(''); router.refresh() }))
              }}>
              <Copy className="h-4 w-4" /> Dupliquer
            </Button>
          </div>
        </div>
      </div>

      {menu.length === 0 ? (
        <p className="text-sm text-zinc-500 italic">Aucun item dans le menu du jour. Ajoute-en pour qu'il apparaisse sur l'écran TV.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sections.map(s => {
            const items = menu.filter(m => m.section === s)
            if (items.length === 0) return null
            return (
              <div key={s} className="border rounded-md p-3">
                <h3 className="font-semibold mb-2">{SECTION_INFO[s].emoji} {SECTION_INFO[s].label}</h3>
                <ul className="space-y-2 text-sm">
                  {items.map(it => (
                    <li key={it.id} className={cn('flex justify-between items-start gap-2 group', !it.actif && 'opacity-50')}>
                      <div className="flex-1">
                        <div className="font-medium">{it.titre} {!it.actif && <span className="text-xs text-zinc-400">(masqué)</span>}</div>
                        {it.description && <p className="text-zinc-600 text-xs">{it.description}</p>}
                        {it.prix != null && <p className="text-emerald-700 font-semibold text-sm">{fmtPrix(it.prix)}</p>}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                        <button onClick={() => setShowForm(it)} className="p-1 hover:bg-zinc-100 rounded"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => { if (confirm('Supprimer ?')) startTransition(() => supprimerMenuItem(it.id).then(() => router.refresh())) }}
                          className="p-1 hover:bg-red-50 rounded text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <MenuModal
          item={showForm === true ? null : showForm}
          today={today}
          onClose={() => setShowForm(null)}
          onSaved={() => { setShowForm(null); router.refresh() }}
        />
      )}
    </Card>
  )
}

function MenuModal({ item, today, onClose, onSaved }: {
  item: MenuItem | null; today: string; onClose: () => void; onSaved: () => void
}) {
  const [section, setSection] = useState<SectionMenu>(item?.section ?? 'plat')
  const [titre, setTitre] = useState(item?.titre ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [prix, setPrix] = useState(item?.prix != null ? String(item.prix) : '')
  const [actif, setActif] = useState(item?.actif ?? true)
  const [pending, startTransition] = useTransition()

  function save() {
    if (!titre.trim()) return alert('Titre obligatoire')
    const payload = {
      jour: item?.jour ?? today,
      section, titre: titre.trim(),
      description: description || null,
      prix: prix ? Number(prix.replace(',', '.')) : null,
      ordre: item?.ordre ?? 0,
      actif,
    }
    startTransition(() => {
      const p = item ? updateMenuItem({ id: item.id, ...payload }) : creerMenuItem(payload)
      p.then(onSaved).catch(e => alert(e.message))
    })
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <Card className="p-4 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold mb-3">{item ? '✏️ Modifier' : '➕ Nouveau'} item du menu</h3>
        <div className="space-y-3">
          <select value={section} onChange={e => setSection(e.target.value as SectionMenu)} className="w-full text-sm rounded-md border px-3 py-2">
            {(['entree', 'plat', 'dessert', 'boisson', 'autre'] as const).map(s => (
              <option key={s} value={s}>{SECTION_INFO[s].emoji} {SECTION_INFO[s].label}</option>
            ))}
          </select>
          <Input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Titre (ex : Pavé de saumon)" autoFocus />
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optionnel)"
            className="w-full text-sm rounded-md border px-3 py-2 min-h-[60px]" />
          <Input value={prix} onChange={e => setPrix(e.target.value)} type="number" step="0.01" placeholder="Prix (€)" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={actif} onChange={e => setActif(e.target.checked)} />
            Actif (affiché sur la TV)
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={pending || !titre.trim()}>Enregistrer</Button>
        </div>
      </Card>
    </div>
  )
}

// ─── Promos ─────────────────────────────────────────────────────
function PromosPanel({ promos }: { promos: Promo[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState<Promo | true | null>(null)
  const [, startTransition] = useTransition()

  return (
    <Card className="p-4">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-semibold">✨ Promotions affichées sur la TV</h2>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1"><Plus className="h-4 w-4" /> Nouvelle promo</Button>
      </div>
      {promos.length === 0 ? (
        <p className="text-sm text-zinc-500 italic">Aucune promo. Ajoute-en pour qu'elle apparaisse en rotation sur la TV.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {promos.map(p => (
            <div key={p.id} className={cn('border rounded-md p-3 group', !p.actif && 'opacity-50')}>
              {p.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image_url} alt={p.titre} className="h-24 w-full object-cover rounded mb-2" />
              )}
              <div className="flex justify-between items-start gap-2">
                <h3 className="font-semibold text-sm">{p.titre}</h3>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                  <button onClick={() => setShowForm(p)} className="p-1 hover:bg-zinc-100 rounded"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => { if (confirm('Supprimer ?')) startTransition(() => supprimerPromo(p.id).then(() => router.refresh())) }}
                    className="p-1 hover:bg-red-50 rounded text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              {p.description && <p className="text-xs text-zinc-600 mt-1">{p.description}</p>}
              {(p.periode_debut || p.periode_fin) && (
                <p className="text-xs text-zinc-500 mt-2">
                  📅 {p.periode_debut ?? '…'} → {p.periode_fin ?? '…'}
                </p>
              )}
              {!p.actif && <Badge variant="outline" className="mt-2 text-xs">Inactive</Badge>}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <PromoModal
          promo={showForm === true ? null : showForm}
          onClose={() => setShowForm(null)}
          onSaved={() => { setShowForm(null); router.refresh() }}
        />
      )}
    </Card>
  )
}

function PromoModal({ promo, onClose, onSaved }: {
  promo: Promo | null; onClose: () => void; onSaved: () => void
}) {
  const [titre, setTitre] = useState(promo?.titre ?? '')
  const [description, setDescription] = useState(promo?.description ?? '')
  const [imageUrl, setImageUrl] = useState(promo?.image_url ?? '')
  const [debut, setDebut] = useState(promo?.periode_debut ?? '')
  const [fin, setFin] = useState(promo?.periode_fin ?? '')
  const [actif, setActif] = useState(promo?.actif ?? true)
  const [pending, startTransition] = useTransition()

  function save() {
    if (!titre.trim()) return alert('Titre obligatoire')
    const payload = {
      titre: titre.trim(),
      description: description || null,
      image_url: imageUrl || null,
      periode_debut: debut || null,
      periode_fin: fin || null,
      actif,
      ordre: promo?.ordre ?? 0,
    }
    startTransition(() => {
      const p = promo ? updatePromo({ id: promo.id, ...payload }) : creerPromo(payload)
      p.then(onSaved).catch(e => alert(e.message))
    })
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <Card className="p-4 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold mb-3">{promo ? '✏️ Modifier' : '➕ Nouvelle'} promo</h3>
        <div className="space-y-3">
          <Input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Titre" autoFocus />
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description"
            className="w-full text-sm rounded-md border px-3 py-2 min-h-[60px]" />
          <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="URL image (optionnel)" />
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs">Début</label><Input type="date" value={debut} onChange={e => setDebut(e.target.value)} /></div>
            <div><label className="text-xs">Fin</label><Input type="date" value={fin} onChange={e => setFin(e.target.value)} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={actif} onChange={e => setActif(e.target.checked)} /> Actif
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={pending || !titre.trim()}>Enregistrer</Button>
        </div>
      </Card>
    </div>
  )
}

// ─── Appels serveur ──────────────────────────────────────────────
function AppelsPanel({ appels }: { appels: Array<AppelServeur & { pris_par?: { prenom?: string; nom?: string } | null }> }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [filtre, setFiltre] = useState<'tous' | 'ouverts'>('ouverts')
  const list = filtre === 'ouverts' ? appels.filter(a => a.statut === 'en_attente') : appels

  return (
    <Card className="p-4">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-semibold">🔔 Appels serveur (24 dernières heures)</h2>
        <div className="flex gap-1 text-sm">
          <button onClick={() => setFiltre('ouverts')} className={cn('px-2 py-1 rounded', filtre === 'ouverts' && 'bg-emerald-100 text-emerald-900')}>Ouverts</button>
          <button onClick={() => setFiltre('tous')}    className={cn('px-2 py-1 rounded', filtre === 'tous' && 'bg-emerald-100 text-emerald-900')}>Tous</button>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-zinc-500 italic">Aucun appel.</p>
      ) : (
        <ul className="space-y-2">
          {list.map(a => (
            <li key={a.id} className={cn('rounded-md border p-3 flex items-center gap-3', STATUT_APPEL_INFO[a.statut].cls)}>
              <div className="text-3xl">{MOTIF_INFO[a.motif].emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold">
                  Table {a.table_numero ?? '?'} — {MOTIF_INFO[a.motif].label}
                </div>
                {a.message && <p className="text-sm">{a.message}</p>}
                <p className="text-xs">
                  Il y a {ageMin(a.created_at)} min
                  {a.pris_par && ` · pris par ${a.pris_par.prenom}`}
                </p>
              </div>
              {a.statut === 'en_attente' && (
                <div className="flex gap-1">
                  <Button size="sm" onClick={() => startTransition(() => prendreEnChargeAppel(a.id, null).then(() => router.refresh()))} className="gap-1"><Check className="h-4 w-4" /> Pris</Button>
                  <Button size="sm" variant="outline" onClick={() => startTransition(() => annulerAppel(a.id).then(() => router.refresh()))}><X className="h-4 w-4" /></Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ─── QR tables ──────────────────────────────────────────────────
function QrPanel({ tables }: { tables: Table[] }) {
  return (
    <Card className="p-4">
      <h2 className="font-semibold mb-2">📱 QR codes appel serveur</h2>
      <p className="text-sm text-zinc-600 mb-4">
        Imprime un QR par table à coller en salle. Les clients scannent → page mobile pour appeler le serveur (eau / addition / aide).
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {tables.map(t => (
          <QrCard key={t.id} table={t} />
        ))}
      </div>
      <div className="mt-4 print:hidden">
        <Button onClick={() => window.print()} variant="outline" className="gap-2">
          🖨️ Imprimer tous les QR
        </Button>
      </div>
    </Card>
  )
}

function QrCard({ table }: { table: Table }) {
  const ref = useRef<HTMLDivElement>(null)
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    const url = `${window.location.origin}/table/${encodeURIComponent(table.numero)}/appel`
    // Génération QR via lib qrcode (déjà dans deps via Module 12)
    import('qrcode').then(QRCode => {
      QRCode.toDataURL(url, { width: 220, margin: 1 }).then(setSrc).catch(() => setSrc(null))
    })
  }, [table.numero])

  return (
    <div ref={ref} className="border rounded-md p-3 text-center bg-white print:break-inside-avoid">
      <div className="font-bold text-lg">Table {table.numero}</div>
      <div className="text-xs text-zinc-500 mb-2">{table.zone} · {table.capacite} pers.</div>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`QR table ${table.numero}`} className="mx-auto" />
      ) : (
        <div className="h-[220px] w-[220px] mx-auto bg-zinc-100 animate-pulse" />
      )}
      <p className="text-xs text-zinc-600 mt-2">Scannez pour appeler le serveur</p>
    </div>
  )
}
