'use client'

// Bloc « Appareil & session » affiché en bas de la catégorie Système.
// Reprend les actions qui étaient auparavant dans le drawer « Tous les modules »
// (supprimé de la barre de navigation) : installation PWA, notifications, déconnexion.

import { logoutAction } from '@/app/login/actions'
import PushNotifSwitch from '@/components/PushNotifSwitch'
import InstallPWAButton from '@/components/InstallPWAButton'
import { LogOut } from 'lucide-react'

export default function SystemeFooterActions() {
  return (
    <section className="pt-4 border-t border-zinc-200">
      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Appareil &amp; session</p>
      <div className="space-y-2 max-w-md">
        <InstallPWAButton />
        <PushNotifSwitch />
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-bold active:scale-95 transition"
          >
            <LogOut className="h-4 w-4" /> Se déconnecter
          </button>
        </form>
      </div>
    </section>
  )
}
