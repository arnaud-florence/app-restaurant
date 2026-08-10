import { SkeletonHeader, SkeletonCards } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <div className="min-h-screen bg-stone-50 px-3 sm:px-4 py-4 space-y-5 pb-mobile-nav">
      <SkeletonHeader />
      <SkeletonCards n={4} />
    </div>
  )
}
