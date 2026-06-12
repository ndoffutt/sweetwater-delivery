import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        green: {
          primary: "#02733e",
          dark: "#015a30",
          light: "#028a4a",
        },
        gold: {
          primary: "#d59a29",
          light: "#e8b84b",
          dark: "#b8821f",
        },
        cream: {
          DEFAULT: "#FAF7F2",
          dark: "#F0EBE1",
        },
        charcoal: "#1A1A1A",
      },
      fontFamily: {
        serif: ["Cormorant Garamond", "Georgia", "serif"],
        body: ["Jost", "sans-serif"],
      },
      letterSpacing: {
        widest: "0.25em",
      },
      minHeight: {
        tap: "44px",
      },
      minWidth: {
        tap: "44px",
      },
    },
  },
  plugins: [],
};
export default config;
