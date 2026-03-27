import { cn } from "../../lib/utils"
import * as React from "react"

function Skeleton({ className, ...props }) {
    return (
        <div
            className={cn("animate-pulse rounded-md bg-slate-200/50", className)}
            {...props}
        />
    )
}

export { Skeleton }
