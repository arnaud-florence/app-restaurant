// ─── Coffre à documents de conformité ──────────────────────────────
// POST   : upload d'un justificatif (multipart) — permis d'exploitation,
//          attestation HACCP, rapport de contrôle, assurance…
// DELETE : suppression (fichier Storage + ligne), ?id=<uuid>
//
// Le fichier va dans le bucket Storage `conformite` (public en lecture,
// créé par scripts/creer-bucket-conformite.mjs), la fiche dans
// `documents_conformite` (0128). Passage par une route API et non une
// server action : les server actions Next plafonnent le corps à ~1 Mo,
// trop peu pour un permis scanné en PDF.
//
// Auth : manager uniquement — mêmes règles que le scanner de factures.

import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'conformite'
const MAX_OCTETS = 15 * 1024 * 1024 // 15 Mo — un permis scanné en PDF passe large
const TYPES_OK = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
])

export async function POST(req: Request) {
  const profil = await getProfile()
  if (!profil) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (profil.role !== 'manager') return NextResponse.json({ error: 'Accès manager requis' }, { status: 403 })

  let form: FormData
  try { form = await req.formData() } catch {
    return NextResponse.json({ error: 'multipart/form-data attendu' }, { status: 415 })
  }
  const fichier = form.get('fichier')
  const titre = String(form.get('titre') ?? '').trim()
  if (!(fichier instanceof File)) return NextResponse.json({ error: 'fichier manquant' }, { status: 400 })
  if (!titre) return NextResponse.json({ error: 'titre obligatoire' }, { status: 400 })
  if (fichier.size > MAX_OCTETS) {
    return NextResponse.json({ error: `Fichier trop lourd (${Math.round(fichier.size / 1024 / 1024)} Mo > 15 Mo)` }, { status: 413 })
  }
  if (!TYPES_OK.has(fichier.type)) {
    return NextResponse.json({ error: `Type ${fichier.type || 'inconnu'} refusé (PDF ou image)` }, { status: 415 })
  }

  const admin = createAdminClient()

  // Chemin : horodatage + nom nettoyé — jamais le nom brut (collisions, unicode)
  const ext = (fichier.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'
  const slug = titre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'document'
  const chemin = `${Date.now()}-${slug}.${ext}`

  const { error: eUp } = await admin.storage.from(BUCKET).upload(chemin, fichier, {
    contentType: fichier.type,
    cacheControl: '31536000',
  })
  if (eUp) return NextResponse.json({ error: `Upload : ${eUp.message}` }, { status: 500 })

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(chemin)

  const { data: doc, error: eDb } = await admin.from('documents_conformite').insert({
    titre,
    categorie: String(form.get('categorie') ?? '').trim() || null,
    fichier_url: pub.publicUrl,
    fichier_nom: fichier.name.slice(0, 200),
    taille_octets: fichier.size,
    date_document: String(form.get('date_document') ?? '').trim() || null,
    date_expiration: String(form.get('date_expiration') ?? '').trim() || null,
    notes: String(form.get('notes') ?? '').trim() || null,
  }).select('id, titre, categorie, fichier_url, fichier_nom, taille_octets, date_document, date_expiration, notes, created_at').single()

  if (eDb) {
    // La fiche a échoué : ne pas laisser un fichier orphelin dans le bucket
    await admin.storage.from(BUCKET).remove([chemin])
    return NextResponse.json({ error: `Base : ${eDb.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, document: doc })
}

export async function DELETE(req: Request) {
  const profil = await getProfile()
  if (!profil) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (profil.role !== 'manager') return NextResponse.json({ error: 'Accès manager requis' }, { status: 403 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id manquant' }, { status: 400 })

  const admin = createAdminClient()
  const { data: doc } = await admin.from('documents_conformite')
    .select('fichier_url').eq('id', id).single()
  if (!doc) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })

  // Le chemin dans le bucket est la fin de l'URL publique
  const chemin = decodeURIComponent(new URL(doc.fichier_url as string).pathname.split(`/${BUCKET}/`)[1] ?? '')
  if (chemin) await admin.storage.from(BUCKET).remove([chemin])

  const { error } = await admin.from('documents_conformite').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
