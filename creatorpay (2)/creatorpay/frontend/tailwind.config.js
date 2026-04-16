/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0a0a0f',
          800: '#111118',
          700: '#1a1a24',
          600: '#22222f',
        },
        accent: {
          DEFAULT: '#7c6af7',
          light: '#a855f7',
        },
        neon: {
          green: '#22d3a0',
          blue: '#38bdf8',
          amber: '#f59e0b',
          red: '#f43f5e',
        }
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
      }
    }
  },
  plugins: []
}
