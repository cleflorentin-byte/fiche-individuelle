/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./pages/**/*.{js,jsx}", "./components/**/*.{js,jsx}", "./lib/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1C1A17",
        cream: "#F7F3EC",
        slate: "#1F2B30",
        orange: "#E2611B",
        green: "#4F7A5B",
        purple: "#5C5470",
      },
    },
  },
  plugins: [],
};
