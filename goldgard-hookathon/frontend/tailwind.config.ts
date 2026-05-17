import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--gg-bg)",
        foreground: "var(--gg-fg)",
        /* Viking Golden Robotic-Gothic Palette */
        forge: {
          black: "var(--forge-black)",
        },
        iron: {
          grey: "var(--iron-grey)",
        },
        aged: {
          gold: "var(--aged-gold)",
        },
        pale: {
          gold: "var(--pale-gold)",
        },
        ember: {
          red: "var(--ember-red)",
        },
        runic: {
          green: "var(--runic-green)",
        },
        cold: {
          steel: "var(--cold-steel)",
        },
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
      fontFamily: {
        display: "var(--font-display)",
        subhead: "var(--font-subhead)",
        body: "var(--font-body)",
        data: "var(--font-data)",
      },
      boxShadow: {
        gg: "var(--shadow-gg)",
      },
      animation: {
        float: "float 3s ease-in-out infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "gradient-shift": "gradient-shift 3s ease-in-out infinite",
        "rune-shimmer": "runeShimmer 3s infinite",
        "beacon-pulse": "beaconPulse 2s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(201, 169, 97, 0.3)" },
          "50%": { boxShadow: "0 0 30px rgba(201, 169, 97, 0.5)" },
        },
        "gradient-shift": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        runeShimmer: {
          "0%": { transform: "translateX(-100%) translateY(-100%) rotate(45deg)" },
          "100%": { transform: "translateX(100%) translateY(100%) rotate(45deg)" },
        },
        beaconPulse: {
          "0%, 100%": { boxShadow: "0 0 8px currentColor, 0 0 0 0 currentColor", opacity: "1" },
          "50%": { boxShadow: "0 0 12px currentColor, 0 0 8px 4px rgba(0, 0, 0, 0.1)", opacity: "0.8" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;

