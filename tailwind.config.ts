import type { Config } from 'tailwindcss';

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'), surface: token('surface'), surface2: token('surface-2'),
        fg: token('fg'), muted: token('muted'), line: token('line'),
        accent: token('accent'), 'accent-fg': token('accent-fg'), 'accent-soft': token('accent-soft'),
        danger: token('danger'), 'danger-soft': token('danger-soft'),
        warn: token('warn'), 'warn-soft': token('warn-soft'),
        nav: token('nav'), 'nav-fg': token('nav-fg'),
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
