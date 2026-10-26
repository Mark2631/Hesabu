/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        hesabu: {
          green: '#395FF6',
          deep: '#172747',
          ink: '#17233A',
          muted: '#738096',
          line: '#E7EAF1',
          surface: '#F5F7FB',
          cream: '#F9F8F2',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        display: ['Manrope', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 5px 24px rgba(24, 56, 35, 0.045)',
        lift: '0 18px 45px rgba(24, 56, 35, 0.12)',
      },
    },
  },
  plugins: [],
};
