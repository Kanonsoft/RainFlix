/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
    "./scripts/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        rain: {
          ink: "#030712",
          panel: "#08111f",
          line: "#1f3a5f",
          blue: "#38bdf8",
          glow: "#60a5fa",
        },
      },
    },
  },
  plugins: [],
};
