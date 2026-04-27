import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--gg-bg)",
        foreground: "var(--gg-fg)",
        gg: {
          muted: "var(--gg-muted)",
          surface: "var(--gg-surface)",
          surface2: "var(--gg-surface-2)",
          border: "var(--gg-border)",
          gold: "var(--gg-gold)",
          gold2: "var(--gg-gold-2)",
          blood: "var(--gg-blood)",
        },
      },
      boxShadow: {
        gg: "var(--shadow-gg)",
      },
    },
  },
  plugins: [],
} satisfies Config;

