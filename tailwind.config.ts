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
        // ── Ops Hub (owner-only blueprint system) ──
        // Tokens from design_handoff_ops_hub/README.md. The manager/driver
        // surfaces keep the green/gold/cream card system above; these are
        // additive and scoped to the (ops) route group.
        ops: {
          bg: "#FAF7F2",
          surface: "#F0EBE1",
          text: "#1A1A1A",
          accent: "#02733e",
          "accent-600": "#015a30",
          "accent-700": "#014625",
          "accent-100": "#eaf3ee",
          gold: "#d59a29",
          "gold-deep": "#8f6413",
          "gold-100": "#fbf3e2",
          danger: "#7a2626",
          field: "#012311",
          divider: "rgba(26,26,26,.18)",
          hairline: "rgba(26,26,26,.1)",
        },
      },
      fontFamily: {
        serif: ["var(--font-lora)", "Georgia", "serif"],
        body: ["var(--font-poppins)", "sans-serif"],
        barlow: ["var(--font-barlow)", "system-ui", "sans-serif"],
        barlowc: ["var(--font-barlow-condensed)", "system-ui", "sans-serif"],
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
