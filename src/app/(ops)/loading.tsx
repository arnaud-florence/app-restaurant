import { SkeletonHeader, SkeletonCards } from '@/components/ui/Skeleton'

// Skeleton sombre pour les écrans opérationnels (fond #0D0D0D).
export default function Loading() {
  return (
    <div className="min-h-screen bg-[#0D0D0D] px-3 sm:px-4 py-4 space-y-5">
      <SkeletonHeader dark />
      <SkeletonCards dark n={6} />
    </div>
  )
}
