import { SkeletonPage } from '@/components/ui/Skeleton'

// Skeleton affiché pendant le chargement de n'importe quelle page /admin/*
// (Suspense automatique App Router). Fini l'écran blanc.
export default function Loading() {
  return <SkeletonPage />
}
