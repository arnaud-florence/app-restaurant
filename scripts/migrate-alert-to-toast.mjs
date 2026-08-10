// Migration mécanique alert() → toast (flux employé-facing).
// Idempotent : ajoute l'import si absent, convertit le cas succès puis le reste en error.
import { readFileSync, writeFileSync } from 'node:fs'

const FILES = [
  'src/app/formation/FormationListClient.tsx',
  'src/app/formation/[guideId]/simulation/SimulationPlayer.tsx',
  'src/app/mon-espace/DemandeCongeForm.tsx',
  'src/app/mon-espace/PointageCard.tsx',
  'src/app/formation/onboarding/OnboardingClient.tsx',
  'src/app/(ops)/serveur/EncaissementModal.tsx',
  'src/app/(ops)/livreur/LivreurClient.tsx',
  'src/components/TachesDuJourWidget.tsx',
  'src/components/CaisseBorneBanner.tsx',
]

// Lignes qui sont des SUCCÈS (pas des erreurs) → toast.success
const SUCCESS_SNIPPETS = [
  "alert('✓ Email retard envoyé au client.')",
]

let totalImports = 0, totalCalls = 0
for (const rel of FILES) {
  let src = readFileSync(rel, 'utf8')
  const before = src

  // 1. Cas succès d'abord
  for (const snip of SUCCESS_SNIPPETS) {
    if (src.includes(snip)) {
      src = src.split(snip).join(snip.replace('alert(', 'toast.success('))
    }
  }

  // 2. Reste des alert( → toast.error(
  const nCalls = (src.match(/(?<![.\w])alert\(/g) || []).length
  src = src.replace(/(?<![.\w])alert\(/g, 'toast.error(')
  totalCalls += nCalls

  // 3. Import si absent
  if (!src.includes("@/lib/toast")) {
    const lines = src.split('\n')
    let anchor = lines.findIndex(l => /from 'react'/.test(l))
    if (anchor === -1) anchor = lines.findIndex(l => /^'use client'/.test(l))
    lines.splice(anchor + 1, 0, "import { toast } from '@/lib/toast'")
    src = lines.join('\n')
    totalImports++
  }

  if (src !== before) {
    writeFileSync(rel, src)
    console.log(`✓ ${rel} — ${nCalls} appel(s) converti(s)`)
  } else {
    console.log(`· ${rel} — rien à faire`)
  }
}
console.log(`\nBilan : ${totalCalls} alert() convertis, ${totalImports} imports ajoutés.`)
