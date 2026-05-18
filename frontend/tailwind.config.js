/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
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
