'use server'

// Déclenchement manuel de la synchro SumUp depuis l'admin.
//
// Pourquoi passer par une server action plutôt que d'appeler la route cron
// depuis le navigateur : la route est protégée par CRON_SECRET. Le secret ne
// doit ni transiter par le client, ni être recopié à la main par le gérant.
// Ici il reste sur le serveur, lu depuis les variables d'environnement Vercel.

import { revalidatePath } from 'next/cache'

export type ResultatSync = {
  ok: boolean
  message: string
  detail?: string
}

export async function synchroniserSumUp(jours: number): Promise<ResultatSync> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return { ok: false, message: 'CRON_SECRET absent des variables d’environnement Vercel.' }
  }
  if (!process.env.SUMUP_API_KEY || !process.env.SUMUP_MERCHANT_CODE) {
    return {
      ok: false,
      message: 'Clés SumUp non configurées.',
      detail: 'Ajouter SUMUP_API_KEY et SUMUP_MERCHANT_CODE dans Vercel → Settings → Environment Variables, puis redéployer.',
    }
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://app-restaurant-livid.vercel.app'
  const n = Math.min(Math.max(Number.isFinite(jours) ? jours : 7, 1), 60)

  try {
    const r = await fetch(`${base}/api/cron/caisse/sumup?jours=${n}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
    })
    const j = await r.json().catch(() => ({}))
    revalidatePath('/admin/caisse-agreee')

    if (!r.ok) {
      return { ok: false, message: `SumUp a refusé la demande (${r.status}).`, detail: JSON.stringify(j).slice(0, 500) }
    }
    const envoyes = Number(j?.envoyes ?? 0)
    const creees = Number(j?.connecteur?.commandes_creees ?? 0)
    return {
      ok: true,
      message: envoyes === 0
        ? `Aucune transaction sur les ${n} derniers jours.`
        : `${envoyes} transaction(s) récupérée(s), ${creees} entrée(s) dans le chiffre d’affaires.`,
      detail: JSON.stringify(j).slice(0, 900),
    }
  } catch (e) {
    return { ok: false, message: 'Appel impossible.', detail: e instanceof Error ? e.message : String(e) }
  }
}
