/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
    theme: {
        extend: {
            colors: {
                background: 'rgb(var(--color-background) / <alpha-value>)',
                foreground: 'rgb(var(--color-foreground) / <alpha-value>)',
                primary: 'rgb(var(--color-primary) / <alpha-value>)',
                border: 'rgb(var(--color-border) / <alpha-value>)',
                muted: 'rgb(var(--color-muted) / <alpha-value>)',
                surface: 'rgb(var(--color-surface) / <alpha-value>)',
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace'],
            },
            borderRadius: {
                DEFAULT: '0px',
                sm: '0px',
                md: '0px',
                lg: '0px',
                xl: '0px',
                '2xl': '0px',
                full: '9999px',
            },
        },
    },
    plugins: [],
}
