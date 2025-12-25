/**
 * @file postcss.config.js
 * @description PostCSS configuration file.
 * 
 * Key Features:
 * - TailwindCSS: Processes the Tailwind directives.
 * - Autoprefixer: Analyzing CSS and adding vendor prefixes (e.g., -webkit-, -moz-) 
 *   to ensure broad compatibility across different browser versions and engines.
 */
export default {
    plugins: {
        tailwindcss: {},
        autoprefixer: {},
    },
}
