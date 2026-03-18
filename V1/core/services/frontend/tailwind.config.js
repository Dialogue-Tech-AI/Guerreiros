/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
      },
      colors: {
        primary: "#F07000",
        navy: "#003070",
        "altese-navy": "#003070",
        "background-light": "#F0F0F0",
        "background-dark": "#0B1120",
        "border-light": "#E0E0E0",
        "border-dark": "#2D2D2D",
        "navy-custom": "#003070",
        "blue-custom": "#40B0E0",
      },
      fontFamily: {
        display: ["Inter", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "8px",
      },
    },
  },
  plugins: [],
}
