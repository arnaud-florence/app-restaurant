'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Loader2, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { loginAction, signupAction } from './actions'

export default function LoginClient({ nextUrl, error, nbManagers }: { nextUrl: string; error: string | null; nbManagers: number }) {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'signup'>(nbManagers === 0 ? 'signup' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [needs2fa, setNeeds2fa] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(error === 'role' ? 'Votre compte n\'a pas le rôle manager.' : null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setErrMsg(null); setOkMsg(null)
    startTransition(async () => {
      if (mode === 'signup') {
        const r = await signupAction({ email, password })
        if (r.ok) {
          setOkMsg('Compte créé. Vérifiez votre boîte mail si la confirmation est activée, puis connectez-vous.')
          setMode('login')
        } else setErrMsg(r.error)
        return
      }
      const r = await loginAction({ email, password, totp: totp || undefined })
      if (!r.ok) { setErrMsg(r.error); return }
      if (r.needs_2fa) { setNeeds2fa(true); return }
      router.push(nextUrl)
      router.refresh()
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 to-emerald-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6">
        <div className="text-center mb-6">
          <Lock className="h-10 w-10 mx-auto text-emerald-600 mb-2" />
          <h1 className="text-2xl font-bold">{mode === 'signup' ? 'Créer un compte' : 'Connexion'}</h1>
          <p className="text-sm text-zinc-500">App Restaurant — espace admin</p>
        </div>

        {nbManagers === 0 && mode === 'signup' && (
          <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-md p-3 text-sm mb-4">
            🚀 <strong>Première installation</strong> — le 1ᵉʳ compte créé sera automatiquement gérant.
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-sm font-medium">Email</label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" autoFocus />
          </div>
          <div>
            <label className="text-sm font-medium">Mot de passe</label>
            <div className="relative">
              <Input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                required minLength={6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} className="pr-10" />
              <button type="button" onClick={() => setShowPwd(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-900"
                tabIndex={-1}>
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {mode === 'signup' && <p className="text-xs text-zinc-500 mt-1">Minimum 6 caractères.</p>}
          </div>
          {needs2fa && (
            <div>
              <label className="text-sm font-medium">Code 2FA (6 chiffres)</label>
              <Input
                type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                value={totp} onChange={e => setTotp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456" autoFocus className="text-center text-2xl tracking-widest font-mono"
              />
              <p className="text-xs text-zinc-500 mt-1">Ouvrez votre app authenticator (Google Authenticator, Authy…).</p>
            </div>
          )}
          {errMsg && <p className="text-sm text-red-600">⚠️ {errMsg}</p>}
          {okMsg && <p className="text-sm text-emerald-700">✓ {okMsg}</p>}

          <Button type="submit" disabled={pending} className="w-full gap-2">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'signup' ? 'Créer le compte' : (needs2fa ? 'Vérifier le code' : 'Se connecter')}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm">
          {mode === 'login' ? (
            <button onClick={() => { setMode('signup'); setErrMsg(null) }} className="text-emerald-700 hover:underline">
              Créer un compte
            </button>
          ) : (
            <button onClick={() => { setMode('login'); setErrMsg(null) }} className="text-emerald-700 hover:underline">
              J'ai déjà un compte
            </button>
          )}
        </div>
      </Card>
    </div>
  )
}
