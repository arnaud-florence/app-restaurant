'use client'

import { useState, useTransition } from 'react'
import { inscrireWifi } from '../admin/clients/actions'

export default function WifiSignupClient({ nomEtablissement }: { nomEtablissement: string }) {
  const [prenom, setPrenom] = useState('')
  const [email, setEmail] = useState('')
  const [telephone, setTelephone] = useState('')
  const [optIn, setOptIn] = useState(false)
  const [erreur, setErreur] = useState('')
  const [resultat, setResultat] = useState<{ mdp_wifi: string | null; nouveau: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  function valider() {
    setErreur('')
    if (!prenom.trim()) { setErreur('Prénom obligatoire'); return }
    if (!email.includes('@')) { setErreur('Email invalide'); return }
    startTransition(async () => {
      try {
        const r = await inscrireWifi({
          prenom: prenom.trim(),
          email: email.trim(),
          telephone: telephone.trim() || null,
          opt_in_marketing: optIn,
        })
        setResultat({ mdp_wifi: r.mdp_wifi, nouveau: r.nouveau })
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur')
      }
    })
  }

  if (resultat) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <p className="text-6xl mb-4">📶</p>
          <h1 className="text-2xl font-bold mb-2">Bienvenue {prenom} !</h1>
          {resultat.mdp_wifi ? (
            <>
              <p className="text-sm text-zinc-600 mb-4">Voici votre accès WiFi :</p>
              <div className="bg-zinc-100 rounded-lg p-4 my-4">
                <p className="text-[11px] uppercase tracking-wider text-zinc-500">Mot de passe</p>
                <p className="text-2xl font-mono font-bold tabular-nums mt-1 select-all">{resultat.mdp_wifi}</p>
              </div>
            </>
          ) : (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
              Mot de passe WiFi non configuré. Demandez à votre serveur.
            </p>
          )}
          {resultat.nouveau && optIn && (
            <p className="text-xs text-emerald-700 mt-4">✓ Vous recevrez nos bonnes offres par email.</p>
          )}
          <p className="text-[10px] text-zinc-500 mt-6">{nomEtablissement} — Bon repas 🍽️</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="text-center mb-6">
          <p className="text-5xl mb-2">📶</p>
          <h1 className="text-xl font-bold">{nomEtablissement}</h1>
          <p className="text-sm text-zinc-500 mt-1">Connectez-vous au WiFi gratuit</p>
        </div>

        <form onSubmit={e => { e.preventDefault(); valider() }} className="space-y-3">
          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Prénom *</span>
            <input value={prenom} onChange={e => setPrenom(e.target.value)} required
              className="w-full h-12 px-3 rounded-md border border-zinc-300 focus:border-zinc-900 outline-none" />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Email *</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full h-12 px-3 rounded-md border border-zinc-300 focus:border-zinc-900 outline-none" />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Téléphone (optionnel)</span>
            <input type="tel" value={telephone} onChange={e => setTelephone(e.target.value)}
              className="w-full h-12 px-3 rounded-md border border-zinc-300 focus:border-zinc-900 outline-none" />
          </label>

          <label className="flex items-start gap-2 text-sm py-2 cursor-pointer">
            <input type="checkbox" checked={optIn} onChange={e => setOptIn(e.target.checked)} className="mt-0.5" />
            <span>
              J&apos;accepte de recevoir les bonnes offres et événements par email
              <span className="block text-[10px] text-zinc-500 mt-0.5">Vous pouvez vous désinscrire à tout moment (RGPD).</span>
            </span>
          </label>

          {erreur && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">⚠️ {erreur}</p>
          )}

          <button type="submit" disabled={isPending}
            className="w-full min-h-[56px] rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white font-bold uppercase tracking-wider">
            {isPending ? 'Connexion…' : 'Se connecter au WiFi'}
          </button>
        </form>

        <p className="text-[10px] text-zinc-500 text-center mt-4">
          Vos données sont conservées par {nomEtablissement} dans le respect du RGPD.
        </p>
      </div>
    </div>
  )
}
