/** @type {import('tailwindcss').Config} */

/**
 * Ocasio design tokens.
 *
 * Before this, theme.extend was empty and every surface hardcoded `purple-600`,
 * arbitrary radii and ad-hoc shadows. The values below are the existing brand
 * direction made explicit, not a new identity: `brand-600` is the purple the
 * product already used.
 *
 * Rules of use:
 *   - colour: reach for a semantic name (ink, muted, line, surface) before a
 *     raw scale. `text-ink` says what it is; `text-gray-900` says what it looks
 *     like today.
 *   - radius: rounded-card for surfaces, rounded-control for inputs/buttons.
 *   - shadow: card / card-hover / overlay. Nothing else.
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea', // the established Ocasio purple
          700: '#7e22ce',
          800: '#6b21a8',
          900: '#581c87',
        },
        // Semantic surface and text tokens.
        canvas: '#f8f8fa', // page background
        surface: '#ffffff', // cards, panels
        ink: '#111827', // primary text
        'ink-soft': '#374151', // secondary text
        muted: '#6b7280', // tertiary / captions
        line: '#e5e7eb', // borders, dividers
        'line-strong': '#d1d5db',
      },
      borderRadius: {
        control: '0.5rem', // inputs, buttons
        card: '0.75rem', // cards, panels
        panel: '1rem', // large surfaces
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(17 24 39 / 0.04), 0 1px 3px 0 rgb(17 24 39 / 0.06)',
        'card-hover': '0 4px 6px -1px rgb(17 24 39 / 0.07), 0 2px 4px -2px rgb(17 24 39 / 0.05)',
        overlay: '0 10px 15px -3px rgb(17 24 39 / 0.1), 0 4px 6px -4px rgb(17 24 39 / 0.1)',
      },
      fontSize: {
        // Display sizes carry their own line-height and tracking so headings
        // do not need per-instance overrides.
        'display-lg': ['3.5rem', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        display: ['2.75rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-sm': ['2rem', { lineHeight: '1.15', letterSpacing: '-0.015em' }],
        title: ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
      },
      maxWidth: {
        prose: '68ch',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'rise-in': 'rise-in 200ms ease-out',
      },
    },
  },
  plugins: [],
};
