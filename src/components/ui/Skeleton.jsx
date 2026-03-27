import { cn } from "../../lib/utils"
import * as React from "react"

function Skeleton({ className, ...props }) {
    return (
        <div
            className={cn("animate-pulse rounded-lg bg-slate-200 relative overflow-hidden", className)}
            {...props}
        >
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>
    )
}

export { Skeleton }
