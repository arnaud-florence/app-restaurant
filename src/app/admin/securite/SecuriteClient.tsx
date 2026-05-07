'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Shield, ShieldCheck, ShieldAlert, Download, LogOut, AlertTriangle, KeyRound, Trash2, Check, X, Copy } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { logoutAction } from '@/app/login/actions'
import { activer2FA, desactiver2FA, preparer2FA, changerRole, genererSauvegarde } from './actions'

type Profil = { id: string; email: string; prenom: string | null; nom: string | null; role: 'manager' | 'employe'; totp_enabled: boolean; derniere_connexion: string | null; created_at: string }
type AuditRow = { id: string; profil_id: string | null; email: string | null; action: string; ressource_type: string | null; ressource_id: string | null; ip: string | null; created_at: string; details: Record<string, unknown> | null }
type ConnexionRow = { id: string; profil_id: string | null; email: string | null; succes: boolean; ip: string | null; user_agent: string | null; inhabituelle: boolean; created_at: string }

export default function SecuriteClient({
  profilCourant, profils, audit, connexions,
}: {
  profilCourant: Profil
  profils: Profil[]
  audit: AuditRow[]
  connexions: ConnexionRow[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'2fa' | 'profils' | 'audit' | 'connexions' | 'sauvegarde'>('2fa')

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="h-6 w-6 text-emerald-600" /> Sécurité & accès</h1>
          <p className="text-sm text-zinc-500">
            Connecté en tant que <strong>{profilCourant.email}</strong> ({profilCourant.role}){' '}
            {profilCourant.totp_enabled ? <Badge className="bg-emerald-600">2FA activée</Badge> : <Badge variant="outline">2FA désactivée</Badge>}
          </p>
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="outline" className="gap-2"><LogOut className="h-4 w-4" /> Se déconnecter</Button>
        </form>
      </header>

      <div className="flex gap-2 border-b overflow-x-auto">
        <TabBtn a={tab === '2fa'}        on={() => setTab('2fa')}><KeyRound className="h-4 w-4 inline mr-1" /> 2FA</TabBtn>
        <TabBtn a={tab === 'profils'}    on={() => setTab('profils')}>👥 Profils ({profils.length})</TabBtn>
        <TabBtn a={tab === 'audit'}      on={() => setTab('audit')}>📜 Journal ({audit.length})</TabBtn>
        <TabBtn a={tab === 'connexions'} on={() => setTab('connexions')}>
          <Lock className="h-4 w-4 inline mr-1" /> Connexions {connexions.some(c => c.inhabituelle) && <Badge className="ml-1 bg-amber-500">⚠</Badge>}
        </TabBtn>
        <TabBtn a={tab === 'sauvegarde'} on={() => setTab('sauvegarde')}><Download className="h-4 w-4 inline mr-1" /> Sauvegarde</TabBtn>
      </div>

      {tab === '2fa'        && <Panel2FA profilCourant={profilCourant} />}
      {tab === 'profils'    && <PanelProfils profils={profils} profilCourant={profilCourant} />}
      {tab === 'audit'      && <PanelAudit audit={audit} />}
      {tab === 'connexions' && <PanelConnexions connexions={connexions} />}
      {tab === 'sauvegarde' && <PanelSauvegarde />}
    </div>
  )
}

function TabBtn({ children, a, on }: { children: React.ReactNode; a: boolean; on: () => void }) {
  return (
    <button onClick={on} className={cn(
      'px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
      a ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-zinc-600 hover:text-zinc-900',
    )}>{children}</button>
  )
}

// ─── 2FA ────────────────────────────────────────────────────────
function Panel2FA({ profilCourant }: { profilCourant: Profil }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [setup, setSetup] = useState<{ secret: string; otpauth: string; backup_codes: string[] } | null>(null)
  const [code, setCode] = useState('')
  const [qrSrc, setQrSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Génère le QR code dès qu'on a un otpauth
  useEffect(() => {
    if (!setup) { setQrSrc(null); return }
    import('qrcode').then(QRCode =>
      QRCode.toDataURL(setup.otpauth, { width: 220, margin: 1 }).then(setQrSrc).catch(() => setQrSrc(null)),
    )
  }, [setup])

  async function lancer() {
    setError(null)
    try {
      const r = await preparer2FA()
      setSetup(r)
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur') }
  }

  function activer() {
    if (!setup) return
    setError(null)
    startTransition(async () => {
      try {
        await activer2FA({ secret: setup.secret, code, backup_codes: setup.backup_codes })
        setSetup(null); setCode(''); router.refresh()
      } catch (e) { setError(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  function desactiver() {
    if (!confirm('Désactiver le 2FA ? Votre compte sera moins protégé.')) return
    startTransition(async () => {
      await desactiver2FA(); router.refresh()
    })
  }

  if (profilCourant.totp_enabled && !setup) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-emerald-600" />
          <div className="flex-1">
            <h2 className="font-semibold">2FA activée ✓</h2>
            <p className="text-sm text-zinc-600">Votre compte est protégé par un second facteur (TOTP).</p>
          </div>
          <Button variant="outline" onClick={desactiver}>Désactiver</Button>
        </div>
      </Card>
    )
  }

  if (!setup) {
    return (
      <Card className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <ShieldAlert className="h-8 w-8 text-amber-600 shrink-0" />
          <div>
            <h2 className="font-semibold">2FA désactivée</h2>
            <p className="text-sm text-zinc-600">Activez le 2FA TOTP pour exiger un code à 6 chiffres après le mot de passe. Compatible Google Authenticator, Authy, 1Password…</p>
          </div>
        </div>
        <Button onClick={lancer} className="gap-2"><KeyRound className="h-4 w-4" /> Activer le 2FA</Button>
        {error && <p className="text-sm text-red-600 mt-2">⚠️ {error}</p>}
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <h2 className="font-semibold mb-3">Configuration 2FA</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="text-center">
          <p className="text-sm text-zinc-600 mb-2">1. Scannez ce QR code dans votre app authenticator :</p>
          {qrSrc ? <img src={qrSrc} alt="QR 2FA" className="mx-auto border rounded" /> : <div className="h-[220px] w-[220px] mx-auto bg-zinc-100 animate-pulse" />}
          <p className="text-xs text-zinc-500 mt-2 break-all">Ou clé manuelle : <code className="font-mono">{setup.secret}</code></p>
        </div>
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">2. Saisissez le code à 6 chiffres affiché par votre app :</p>
          <Input
            type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
            value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456" className="text-center text-2xl tracking-widest font-mono"
          />
          <Button onClick={activer} disabled={code.length !== 6} className="w-full">Confirmer et activer</Button>

          <div className="border-t pt-3">
            <p className="text-sm font-semibold mb-2">3. Codes de secours (à conserver) :</p>
            <div className="grid grid-cols-2 gap-1 font-mono text-xs bg-zinc-50 p-2 rounded">
              {setup.backup_codes.map(c => <div key={c}>{c}</div>)}
            </div>
            <Button size="sm" variant="outline" className="mt-2 gap-1 text-xs"
              onClick={() => navigator.clipboard.writeText(setup.backup_codes.join('\n')).then(() => alert('Copié'))}>
              <Copy className="h-3 w-3" /> Copier les codes
            </Button>
          </div>
          {error && <p className="text-sm text-red-600">⚠️ {error}</p>}
        </div>
      </div>
    </Card>
  )
}

// ─── Profils ────────────────────────────────────────────────────
function PanelProfils({ profils, profilCourant }: { profils: Profil[]; profilCourant: Profil }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-left">
          <tr>
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2">Rôle</th>
            <th className="px-3 py-2">2FA</th>
            <th className="px-3 py-2">Dernière connexion</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {profils.map(p => (
            <tr key={p.id} className={cn('border-t', p.id === profilCourant.id && 'bg-emerald-50/40')}>
              <td className="px-3 py-2">{p.email} {p.id === profilCourant.id && <Badge variant="outline" className="ml-2">vous</Badge>}</td>
              <td className="px-3 py-2">
                {p.id === profilCourant.id ? (
                  <Badge className={p.role === 'manager' ? 'bg-emerald-600' : 'bg-zinc-500'}>{p.role}</Badge>
                ) : (
                  <select value={p.role} onChange={e => startTransition(() => changerRole({ id: p.id, role: e.target.value as 'manager' | 'employe' }).then(() => router.refresh()))}
                    className="text-sm rounded border px-2 py-1">
                    <option value="manager">manager</option>
                    <option value="employe">employe</option>
                  </select>
                )}
              </td>
              <td className="px-3 py-2">{p.totp_enabled ? '🔐' : '—'}</td>
              <td className="px-3 py-2 text-xs text-zinc-600">{p.derniere_connexion ? format(parseISO(p.derniere_connexion), 'd MMM HH:mm', { locale: fr }) : '—'}</td>
              <td className="px-3 py-2 text-xs text-zinc-500">{format(parseISO(p.created_at), 'd MMM yyyy', { locale: fr })}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-zinc-500 p-3 border-t">
        Pour ajouter un compte : laissez la personne s'inscrire via /login, puis passez son rôle ici.
      </p>
    </Card>
  )
}

// ─── Audit ──────────────────────────────────────────────────────
function PanelAudit({ audit }: { audit: AuditRow[] }) {
  if (audit.length === 0) return <Card className="p-4 text-zinc-500 italic">Aucune action enregistrée.</Card>
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-left">
          <tr>
            <th className="px-3 py-2">Quand</th>
            <th className="px-3 py-2">Qui</th>
            <th className="px-3 py-2">Action</th>
            <th className="px-3 py-2">Ressource</th>
            <th className="px-3 py-2">IP</th>
          </tr>
        </thead>
        <tbody>
          {audit.map(a => (
            <tr key={a.id} className="border-t">
              <td className="px-3 py-2 text-xs whitespace-nowrap">{format(parseISO(a.created_at), 'd MMM HH:mm:ss', { locale: fr })}</td>
              <td className="px-3 py-2">{a.email ?? '—'}</td>
              <td className="px-3 py-2"><code className="bg-zinc-100 px-1.5 py-0.5 rounded text-xs">{a.action}</code></td>
              <td className="px-3 py-2 text-xs text-zinc-600">{a.ressource_type ?? ''} {a.ressource_id ? `· ${a.ressource_id.slice(0, 8)}…` : ''}</td>
              <td className="px-3 py-2 text-xs text-zinc-500">{a.ip ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

// ─── Connexions ─────────────────────────────────────────────────
function PanelConnexions({ connexions }: { connexions: ConnexionRow[] }) {
  if (connexions.length === 0) return <Card className="p-4 text-zinc-500 italic">Aucune connexion enregistrée.</Card>
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-left">
          <tr>
            <th className="px-3 py-2">Quand</th>
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2">Statut</th>
            <th className="px-3 py-2">IP</th>
            <th className="px-3 py-2">User-Agent</th>
          </tr>
        </thead>
        <tbody>
          {connexions.map(c => (
            <tr key={c.id} className={cn('border-t', c.inhabituelle && 'bg-amber-50')}>
              <td className="px-3 py-2 text-xs whitespace-nowrap">{format(parseISO(c.created_at), 'd MMM HH:mm:ss', { locale: fr })}</td>
              <td className="px-3 py-2">{c.email ?? '—'}</td>
              <td className="px-3 py-2">
                {c.succes ? <Badge className="bg-emerald-600">✓ OK</Badge> : <Badge className="bg-red-600">✗ Échec</Badge>}
                {c.inhabituelle && <Badge className="ml-1 bg-amber-500">⚠ IP nouvelle</Badge>}
              </td>
              <td className="px-3 py-2 text-xs text-zinc-500">{c.ip ?? '—'}</td>
              <td className="px-3 py-2 text-xs text-zinc-500 truncate max-w-xs">{c.user_agent ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

// ─── Sauvegarde ─────────────────────────────────────────────────
function PanelSauvegarde() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function telecharger() {
    setError(null)
    startTransition(async () => {
      try {
        const dump = await genererSauvegarde()
        const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `app-restaurant-backup-${new Date().toISOString().slice(0, 10)}.json`
        document.body.appendChild(a); a.click(); a.remove()
        URL.revokeObjectURL(url)
      } catch (e) { setError(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3 mb-4">
        <Download className="h-8 w-8 text-emerald-600 shrink-0" />
        <div>
          <h2 className="font-semibold">Sauvegarde locale JSON</h2>
          <p className="text-sm text-zinc-600 mt-1">
            Télécharge un fichier JSON contenant les données critiques de l'app (paramètres, employés, recettes, commandes,
            paiements, hygiène, objectifs, formations, menu, promos…). Conservez-le sur disque ou cloud personnel — c'est
            une sauvegarde de secours en complément des backups automatiques Supabase.
          </p>
        </div>
      </div>
      <Button onClick={telecharger} disabled={pending} className="gap-2">
        {pending ? '⏳ Génération…' : <><Download className="h-4 w-4" /> Télécharger maintenant</>}
      </Button>
      {error && <p className="text-sm text-red-600 mt-2">⚠️ {error}</p>}
      <p className="text-xs text-zinc-500 mt-3">
        💡 Pour des sauvegardes automatiques côté serveur, Supabase fait des backups quotidiens du projet (Console → Database → Backups).
      </p>
    </Card>
  )
}
