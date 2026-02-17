/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'asteck-dark': '#0f1115',
        'asteck-panel': 'rgba(30, 32, 40, 0.7)',
        'asteck-accent': '#f59e0b', // Amber for traffic
        'asteck-safe': '#3b82f6',   // Blue for safe corridors
        'asteck-error': '#ef4444',  // Red for accidents
      },
      backdropBlur: {
        'xs': '2px',
      }
    },
  },
  plugins: [],
}
