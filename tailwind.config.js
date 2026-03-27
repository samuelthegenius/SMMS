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
                ring: '#f59e0b', // Gold for focus rings
                destructive: {
                    DEFAULT: '#ef4444',
                    foreground: '#ffffff',
                },
            },
            fontFamily: {
                sans: ['Inter', 'Roboto', 'sans-serif'],
            },
            animation: {
                'fade-in': 'fadeIn 0.5s ease-out',
                'slide-up': 'slideUp 0.5s ease-out',
                'scale-in': 'scaleIn 0.3s ease-out',
                'slide-in-right': 'slideInRight 0.3s ease-out',
                'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
                'bounce-soft': 'bounceSoft 0.5s ease-out',
                'shimmer': 'shimmer 2s infinite',
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
                scaleIn: {
                    '0%': { transform: 'scale(0.95)', opacity: '0' },
                    '100%': { transform: 'scale(1)', opacity: '1' },
                },
                slideInRight: {
                    '0%': { transform: 'translateX(20px)', opacity: '0' },
                    '100%': { transform: 'translateX(0)', opacity: '1' },
                },
                pulseSoft: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.7' },
                },
                bounceSoft: {
                    '0%': { transform: 'scale(1)' },
                    '50%': { transform: 'scale(1.05)' },
                    '100%': { transform: 'scale(1)' },
                },
                shimmer: {
                    '0%': { transform: 'translateX(-100%)' },
                    '100%': { transform: 'translateX(100%)' },
                },
            },
            borderRadius: {
                'xl': '1rem',
                '2xl': '1.5rem',
                '3xl': '2rem',
            },
        },
    },
    plugins: [],
}
