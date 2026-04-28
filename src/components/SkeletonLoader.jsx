/**
 * Skeleton Loader Component
 * Provides loading placeholders for better perceived performance
 */

export const CardSkeleton = () => (
  <div className="bg-white rounded-xl border border-surface-200/60 p-6 animate-pulse">
    <div className="flex justify-between items-start mb-4">
      <div className="flex-1">
        <div className="h-6 bg-surface-200 rounded w-3/4 mb-2"></div>
        <div className="h-4 bg-surface-200 rounded w-1/2"></div>
      </div>
      <div className="h-6 bg-surface-200 rounded w-16"></div>
    </div>
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="h-4 bg-surface-200 rounded w-20"></div>
        <div className="h-4 bg-surface-200 rounded w-16"></div>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-4 bg-surface-200 rounded w-24"></div>
        <div className="h-4 bg-surface-200 rounded w-20"></div>
      </div>
    </div>
  </div>
);

export const StatsCardSkeleton = () => (
  <div className="bg-white rounded-xl border border-surface-200/60 p-6 animate-pulse">
    <div className="flex justify-between items-start">
      <div className="flex-1">
        <div className="h-4 bg-surface-200 rounded w-20 mb-2"></div>
        <div className="h-8 bg-surface-200 rounded w-12"></div>
      </div>
      <div className="h-12 w-12 bg-surface-200 rounded-xl"></div>
    </div>
  </div>
);

export const TableSkeleton = ({ rows = 5 }) => (
  <div className="bg-white rounded-xl border border-surface-200/60 overflow-hidden">
    <div className="border-b border-surface-200/60 p-4 animate-pulse">
      <div className="h-5 bg-surface-200 rounded w-32"></div>
    </div>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="border-b border-surface-100 p-4 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="h-4 bg-surface-200 rounded w-24"></div>
          <div className="h-4 bg-surface-200 rounded w-32"></div>
          <div className="h-4 bg-surface-200 rounded w-20"></div>
          <div className="h-4 bg-surface-200 rounded w-16"></div>
        </div>
      </div>
    ))}
  </div>
);

export const DashboardSkeleton = () => (
  <div className="space-y-8">
    {/* Header Skeleton */}
    <div className="animate-pulse">
      <div className="h-8 bg-surface-200 rounded w-48 mb-2"></div>
      <div className="h-5 bg-surface-200 rounded w-64"></div>
    </div>

    {/* Stats Cards Skeleton */}
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <StatsCardSkeleton key={i} />
      ))}
    </div>

    {/* Cards Grid Skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  </div>
);

export default DashboardSkeleton;
