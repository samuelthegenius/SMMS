import { Skeleton } from "./ui/Skeleton";

export default function Loader() {
    return (
        <div className="flex h-screen w-full bg-background">
            {/* Sidebar Skeleton */}
            <div className="w-64 hidden md:block border-r border-slate-200 p-6 space-y-6">
                <Skeleton className="h-8 w-32 bg-slate-200" />
                <div className="space-y-3">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            </div>
            {/* Content Skeleton */}
            <div className="flex-1 p-6 md:p-8 space-y-6">
                <Skeleton className="h-8 w-64" />
                <div className="grid gap-6 md:grid-cols-3">
                    <Skeleton className="h-32 rounded-xl" />
                    <Skeleton className="h-32 rounded-xl" />
                    <Skeleton className="h-32 rounded-xl" />
                </div>
                <Skeleton className="h-96 rounded-xl" />
            </div>
        </div>
    );
}
