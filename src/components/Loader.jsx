import { Skeleton } from "./ui/Skeleton";
import { Wrench } from "lucide-react";

export default function Loader() {
    return (
        <div 
            className="flex h-screen w-full bg-background animate-fade-in" 
            role="status" 
            aria-label="Loading content"
            aria-busy="true"
        >
            {/* Sidebar Skeleton */}
            <div className="w-64 hidden md:block bg-gradient-to-b from-primary to-slate-900 p-6 space-y-6" aria-hidden="true">
                <div className="flex items-center gap-3 pb-6 border-b border-white/10">
                    <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm">
                        <Wrench className="w-6 h-6 text-accent" />
                    </div>
                    <Skeleton className="h-6 w-24 bg-white/20" />
                </div>
                <div className="space-y-3">
                    <Skeleton className="h-12 w-full bg-white/10 rounded-xl" />
                    <Skeleton className="h-12 w-full bg-white/10 rounded-xl" />
                    <Skeleton className="h-12 w-full bg-white/10 rounded-xl" />
                    <Skeleton className="h-12 w-full bg-white/10 rounded-xl" />
                </div>
                <div className="mt-auto pt-6 border-t border-white/10">
                    <Skeleton className="h-16 w-full bg-white/10 rounded-xl" />
                </div>
            </div>
            {/* Content Skeleton */}
            <div className="flex-1 p-6 md:p-8 space-y-6" aria-hidden="true">
                <div className="flex justify-between items-center">
                    <Skeleton className="h-10 w-48 rounded-xl" />
                    <Skeleton className="h-10 w-10 rounded-full" />
                </div>
                <div className="grid gap-6 md:grid-cols-3">
                    <Skeleton className="h-32 rounded-2xl bg-slate-200/70" />
                    <Skeleton className="h-32 rounded-2xl bg-slate-200/70" />
                    <Skeleton className="h-32 rounded-2xl bg-slate-200/70" />
                </div>
                <div className="space-y-4">
                    <Skeleton className="h-12 w-full rounded-xl bg-slate-200/70" />
                    <Skeleton className="h-64 rounded-2xl bg-slate-200/70" />
                </div>
            </div>
            <span className="sr-only">Loading...</span>
        </div>
    );
}
