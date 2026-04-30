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
        modalSheetIn: {
          "0%": { opacity: "0", transform: "scale(0.97) translateY(6px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "modal-sheet-in": "modalSheetIn 0.28s cubic-bezier(0.22, 1, 0.36, 1) both",
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
