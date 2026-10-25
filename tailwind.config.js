/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {
    colors: { hesabu: { green: '#1A7A4A', deep: '#164C34', ink: '#1D2D25', muted: '#7B877F', line: '#E8ECE8', surface: '#F6F8F5', cream: '#F9F8F2' } },
    fontFamily: { sans: ['DM Sans', 'sans-serif'], display: ['Manrope', 'sans-serif'] },
    boxShadow: { soft: '0 5px 24px rgba(24, 56, 35, 0.045)', lift: '0 18px 45px rgba(24, 56, 35, 0.12)' }
  } },
  plugins: []
};
