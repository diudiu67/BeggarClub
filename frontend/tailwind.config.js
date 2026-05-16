/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        yt: {
          bg: "#030303",
          surface: "#212121",
          elevated: "#2d2d2d",
          border: "#3d3d3d",
          text: "#ffffff",
          muted: "#aaaaaa",
          red: "#ff0033",
        },
      },
    },
  },
  plugins: [],
};
