import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines class names with Tailwind's merge capability.
 * @param {...string} inputs - Class names to combine.
 * @returns {string} - Merged class string.
 */
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
