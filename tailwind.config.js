/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "sans-serif"],
        display: ["Syne", "sans-serif"],
      },
      colors: {
        bg: "#efeff5",
        panel: "#ffffff",
        panel2: "#fafafe",
        border: "#eaeaf4",
        text: "#0f0f1e",
        muted: "#6a6a88",
        dim: "#8a8aa8",
        green: "#00c98d",
        amber: "#f5a623",
        red: "#ef4444",
        blue: "#6c5ce7",
        gray: "#c8c8dc",
      },
      boxShadow: {
        panel: "2px 0 40px rgba(0,0,0,0.07)",
        chip: "0 0 0 1px rgba(255,255,255,0.02)",
      },
      borderRadius: {
        xl2: "14px",
      },
    },
  },
  plugins: [],
};
