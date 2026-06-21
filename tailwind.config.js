/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{js,jsx,ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          50:  '#e8eaf0',
          100: '#c9cdd8',
          200: '#a3a9ba',
          600: '#2d3348',
          700: '#252a3a',
          800: '#1d2036',
          850: '#191c2e',
          900: '#1b1e2e',
          950: '#141422',
        },
        brand: {
          400: '#7bd5f5',
          500: '#0ea5e9',
          600: '#0284c7',
        },
        kraken: {
          green:   '#2dd4bf',
          violet:  '#a78bfa',
          pink:    '#f472b6',
          orange:  '#fb923c',
          yellow:  '#facc15',
          emerald: '#34d399',
          red:     '#f87171',
          blue:    '#60a5fa',
          purple:  '#c084fc',
          amber:   '#fbbf24',
          lime:    '#4ade80',
          cyan:    '#0ea5e9',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      }
    }
  },
  plugins: []
}
