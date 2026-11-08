/** @type {import('tailwindcss').Config} */
// Tokens de diseño de Mi Carrito POS:
//  - primario: azul acero #1B4B6F
//  - acento / éxito: ámbar #D97706
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primario: {
          50: '#eef5fa',
          100: '#d5e6f1',
          200: '#aacde3',
          300: '#74adcf',
          400: '#4289b3',
          500: '#2b6d97',
          600: '#1B4B6F',
          700: '#173d5a',
          800: '#14334b',
          900: '#112a3e',
        },
        ambar: {
          50: '#fdf6ec',
          100: '#fbe9cd',
          200: '#f6d097',
          300: '#f0b05a',
          400: '#ea912c',
          500: '#D97706',
          600: '#bd5f05',
          700: '#9c4808',
          800: '#7e3a0d',
          900: '#67300e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(27,75,111,0.08), 0 1px 2px rgba(27,75,111,0.06)',
      },
    },
  },
  plugins: [],
};
