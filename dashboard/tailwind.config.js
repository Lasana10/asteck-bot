/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Manrope', 'sans-serif'],
      },
      colors: {
        background: '#0c1324',
        surface: '#0c1324',
        'surface-container': '#191f31',
        'surface-container-high': '#23293c',
        'surface-container-highest': '#2e3447',
        primary: '#b7c4ff',
        'primary-container': '#001148',
        tertiary: '#7bd0ff',
        error: '#ffb4ab',
        'on-surface': '#dce1fb',
        'on-surface-variant': '#c6c6cd',
        'outline-variant': '#45464d',
        
        // Legacy colors for backwards compatibility during migration
        'asteck-dark': '#0f1115',
        'asteck-panel': 'rgba(30, 32, 40, 0.7)',
        'asteck-accent': '#f59e0b', 
        'asteck-safe': '#3b82f6',   
        'asteck-error': '#ef4444',  
      },
      backgroundImage: {
        'signature-gradient': 'linear-gradient(135deg, #b7c4ff 0%, #001148 100%)',
        'glass-gradient': 'linear-gradient(180deg, rgba(25, 31, 49, 0.6) 0%, rgba(12, 19, 36, 0.8) 100%)',
      },
      boxShadow: {
        'neon-primary': '0 0 15px rgba(183, 196, 255, 0.4)',
        'neon-tertiary': '0 0 15px rgba(123, 208, 255, 0.4)',
        'ambient-float': '0 10px 40px -10px rgba(183, 196, 255, 0.06)',
      },
      backdropBlur: {
        'xs': '2px',
        'milled': '20px',
      }
    },
  },
  plugins: [],
}
