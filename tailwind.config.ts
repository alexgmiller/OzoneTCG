import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

// ── Tailwind config ──
// Brief tokens are canonical (see .claude/design-system.md §1). shadcn names
// below them are aliases onto the same palette so existing screens keep
// rendering while they migrate. borderRadius.lg stays "var(--radius)" —
// shadcn primitives depend on it.
export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Brief tokens (canonical) ─────────────────────────────────────────
        bg: "var(--bg)",
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          tint: "var(--accent-tint)",
        },
        up:   { DEFAULT: "var(--up)",   tint: "var(--up-tint)" },
        down: { DEFAULT: "var(--down)", tint: "var(--down-tint)" },

        // ── shadcn aliases (legacy-compatible, same palette) ──────────────────
        background: "hsl(var(--sh-background))",
        foreground: "hsl(var(--sh-foreground))",
        card: {
          DEFAULT: "hsl(var(--sh-card))",
          foreground: "hsl(var(--sh-card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--sh-popover))",
          foreground: "hsl(var(--sh-popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--sh-primary))",
          foreground: "hsl(var(--sh-primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--sh-secondary))",
          foreground: "hsl(var(--sh-secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--sh-muted))",
          foreground: "hsl(var(--sh-muted-foreground))",
        },
        // shadcn's "accent" is a hover surface; renamed so the brief's teal
        // can own the accent name. dropdown-menu/button use `hover`.
        hover: {
          DEFAULT: "hsl(var(--sh-hover))",
          foreground: "hsl(var(--sh-hover-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--sh-destructive))",
          foreground: "hsl(var(--sh-destructive-foreground))",
        },
        border: "var(--border)",
        input: "hsl(var(--sh-input))",
        ring: "hsl(var(--sh-ring))",

        // ── Semantic tones (kept for MoneyDisplay / Toast / badges) ──────────
        positive: { DEFAULT: "var(--up)",   strong: "var(--up)",   soft: "var(--up-tint)",   border: "var(--up-tint)" },
        negative: { DEFAULT: "var(--down)", strong: "var(--down)", soft: "var(--down-tint)", border: "var(--down-tint)" },
        warning:  { DEFAULT: "rgb(217 119 6)", strong: "rgb(245 158 11)", soft: "rgb(245 158 11 / 0.10)", border: "rgb(245 158 11 / 0.28)" },
        neutral:  { DEFAULT: "var(--text-muted)", strong: "var(--text-muted)", muted: "var(--text-muted)" },

        // ── Pre-Phase-3 aliases — resolve to the accent so untouched screens
        //    render teal, not violet, until the audit commit migrates them. ──
        "accent-primary": {
          DEFAULT: "var(--accent)",
          hover: "var(--accent)",
          soft: "var(--accent-tint)",
          border: "var(--accent-tint)",
        },
        "accent-secondary": "var(--accent)",
        chart: { 1: "var(--accent)", 2: "var(--up)", 3: "var(--down)", 4: "var(--text-muted)", 5: "var(--surface-2)" },
      },

      fontFamily: {
        // Lexend for UI, Space Mono for small muted metadata only (§3).
        sans: ["var(--font-display)", "Lexend", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "Space Mono", "ui-monospace", "monospace"],
      },

      fontSize: {
        xs:    ["0.75rem",  { lineHeight: "1rem" }],
        sm:    ["0.875rem", { lineHeight: "1.25rem" }],
        base:  ["1rem",     { lineHeight: "1.5rem" }],
        lg:    ["1.125rem", { lineHeight: "1.5rem" }],
        xl:    ["1.25rem",  { lineHeight: "1.75rem" }],
        "2xl": ["1.75rem",  { lineHeight: "2rem" }],     // card detail name
        hero:  ["3rem",     { lineHeight: "1" }],        // HeroValue (48px)
      },

      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Brief scale (§4): 12 chips/inputs, 16 cards/tiles, full pills
        xl:   "var(--radius-chip)",
        "2xl": "var(--radius-card)",
        "3xl": "1.5rem",                                 // sheet top corners
      },

      boxShadow: {
        // The one permitted shadow: the floating tab bar in light mode (§6)
        tabbar: "var(--tabbar-shadow)",
      },

      backgroundColor: {
        tabbar: "var(--tabbar-bg)",
      },

      spacing: {
        // Floating tab bar: 16px inset + 64px bar + 16px gap → content clearance
        tabbar: "6rem",
      },

      transitionDuration: {
        DEFAULT: "150ms",
        150: "150ms",
        200: "200ms",
      },

      keyframes: {
        "scan-line": {
          "0%":   { top: "10%" },
          "50%":  { top: "90%" },
          "100%": { top: "10%" },
        },
      },
      animation: {
        "scan-line": "scan-line 2s ease-in-out infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
