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
                // MTU Brand Colors
                primary: {
                    DEFAULT: '#003366', // Deep Navy Blue
                    50: '#e6f0f9',
                    100: '#cce0f3',
                    200: '#99c2e7',
                    300: '#66a3db',
                    400: '#3385cf',
                    500: '#003366', // Base
                    600: '#002a54',
                    700: '#002242',
                    800: '#001931',
                    900: '#00111f',
                },
                secondary: {
                    DEFAULT: '#228B22', // Forest Green (Mountain Top)
                    50: '#e8f5e8',
                    100: '#d1ebd1',
                    200: '#a3d7a3',
                    300: '#75c375',
                    400: '#47af47',
                    500: '#228B22', // Base
                    600: '#1c6f1c',
                    700: '#165916',
                    800: '#104310',
                    900: '#0a2d0a',
                },
                accent: {
                    DEFAULT: '#D4AF37', // Gold
                    50: '#fcf9f0',
                    100: '#f9f3e1',
                    200: '#f3e7c3',
                    300: '#eddba5',
                    400: '#e7cf87',
                    500: '#D4AF37', // Base
                    600: '#aa8c2c',
                    700: '#806921',
                    800: '#554616',
                    900: '#2b230b',
                },
                surface: {
                    DEFAULT: '#f8fafc',
                    50: '#f8fafc',
                    100: '#f1f5f9',
                    200: '#e2e8f0',
                    300: '#cbd5e1',
                    400: '#94a3b8',
                    500: '#64748b',
                    600: '#475569',
                    700: '#334155',
                    800: '#1e293b',
                    900: '#0f172a',
                },
                background: '#f8fafc',
                ring: '#D4AF37',
                destructive: {
                    DEFAULT: '#ef4444',
                    foreground: '#ffffff',
                },
                success: {
                    DEFAULT: '#10b981',
                    50: '#ecfdf5',
                    100: '#d1fae5',
                    500: '#10b981',
                    600: '#059669',
                },
                warning: {
                    DEFAULT: '#f59e0b',
                    50: '#fffbeb',
                    100: '#fef3c7',
                    500: '#f59e0b',
                    600: '#d97706',
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
                heading: ['Inter', 'system-ui', 'sans-serif'],
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
