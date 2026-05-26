/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      keyframes: {
        "slide-down": {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "slide-down": "slide-down 0.2s ease-out",
      },
      colors: {
        yt: {
          bg: "#F7F8F9",
          surface: "#EEEEF0",
          elevated: "#E3E3E7",
          border: "#CECDD3",
          text: "#1A1A1A",
          muted: "#888888",
          red: "#ff0033",
        },
      },
    },
  },
  plugins: [],
};
