import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f3e8ff',
          100: '#e9d5ff',
          200: '#d8b4fe',
          300: '#c084fc',
          400: '#a855f7',
          500: '#9333ea',
          600: '#7e22ce',
          700: '#6b21a8',
          800: '#4c1d95',
          900: '#3b0764',
          950: '#2e0057',
        },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #3b0764 0%, #6b21a8 50%, #4c1d95 100%)',
      },
    },
  },
  plugins: [],
};

export default config;

