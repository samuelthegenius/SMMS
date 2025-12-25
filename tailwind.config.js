/**
 * @file tailwind.config.js
 * @description Configuration for the Tailwind CSS framework.
 *
 * Key Features:
 * - Content Scanning: Defines which files Tailwind should scan for class names to generate the necessary CSS (Tree Shaking).
 * - Theme Extension: Customizes the default design system (colors, fonts, breakpoints) to match the university's branding.
 */

// Basic configuration to enable standard Tailwind features
/** @type {import('tailwindcss').Config} */
export default {
    // Content array specifically targets index.html and all JS/JSX files in src
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    // ensuring only used styles are included in the final bundle.
    theme: {
        extend: {
            // Extend allows us to keep default Tailwind classes while adding project-specific overrides.
            colors: {
                primary: '#0f172a', // Deep Navy Blue
                secondary: '#f59e0b', // Amber 500
            },
            fontFamily: {
                sans: ['Inter', 'Roboto', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
