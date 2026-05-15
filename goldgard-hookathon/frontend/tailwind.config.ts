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
      animation: {
        float: "float 3s ease-in-out infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "gradient-shift": "gradient-shift 3s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(212, 175, 119, 0.3)" },
          "50%": { boxShadow: "0 0 30px rgba(212, 175, 119, 0.5)" },
        },
        "gradient-shift": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;

