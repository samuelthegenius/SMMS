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
            colors: {
                primary: '#0f172a', // Navy Blue
                secondary: '#f59e0b', // Keep for backward compat
                accent: '#f59e0b', // Gold
                surface: '#1e293b', // Dark Slate
                background: '#f8fafc', // Light Gray
            },
            fontFamily: {
                sans: ['Inter', 'Roboto', 'sans-serif'],
            },
            animation: {
                'fade-in': 'fadeIn 0.5s ease-out',
                'slide-up': 'slideUp 0.5s ease-out',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { transform: 'translateY(20px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
            },
        },
    },
    plugins: [],
}
