import type { Config } from "tailwindcss";

/**
 * Merged config: shadcn CSS-var tokens (original) + Ozone design-system tokens (added).
 * Read .claude/design-system.md before touching this file.
 *
 * Merge notes:
 *  - borderRadius.lg kept as "var(--radius)" (shadcn default) — shadcn components depend on it.
 *    The design bundle wanted "0.5rem" here, but that would break button/input/card rendering.
 *    xl + 2xl added from bundle; md + sm preserved from shadcn.
 *  - content paths: union of original (pages/, src/) + bundle (lib/).
 *  - plugins: tailwindcss-animate preserved; bundle had none.
 */
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
        // ── shadcn CSS-var tokens (original) ────────────────────────────────
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },

        // ── Ozone semantic tokens (design-system §1) ─────────────────────────
        "accent-primary": {
          DEFAULT: "rgb(139 92 246)",       // violet-500
          hover: "rgb(124 58 237)",          // violet-600
          soft: "rgb(139 92 246 / 0.12)",
          border: "rgb(139 92 246 / 0.32)",
        },
        "accent-secondary": "rgb(196 181 253)", // violet-300
        positive: {
          DEFAULT: "rgb(52 211 153)",        // emerald-400
          strong: "rgb(16 185 129)",          // emerald-500
          soft: "rgb(52 211 153 / 0.10)",
          border: "rgb(52 211 153 / 0.28)",
        },
        negative: {
          DEFAULT: "rgb(251 113 133)",        // rose-400
          strong: "rgb(244 63 94)",           // rose-500
          soft: "rgb(244 63 94 / 0.10)",
          border: "rgb(244 63 94 / 0.28)",
        },
        warning: {
          DEFAULT: "rgb(251 191 36)",         // amber-400
          strong: "rgb(245 158 11)",           // amber-500
          soft: "rgb(245 158 11 / 0.10)",
          border: "rgb(245 158 11 / 0.28)",
        },
        neutral: {
          DEFAULT: "rgb(148 163 184)",        // slate-400
          strong: "rgb(100 116 139)",          // slate-500
          muted: "rgb(71 85 105)",             // slate-600
        },
      },

      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },

      fontSize: {
        // Explicit scale — no arbitrary sizes. See design-system §3.
        xs:   ["0.75rem",  { lineHeight: "1rem" }],
        sm:   ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem",     { lineHeight: "1.5rem" }],
        lg:   ["1.125rem", { lineHeight: "1.5rem" }],
        xl:   ["1.25rem",  { lineHeight: "1.75rem" }],
      },

      borderRadius: {
        // shadcn vars (original — do not remove, shadcn components depend on these)
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Ozone scale additions (design-system §4)
        xl:  "0.75rem",
        "2xl": "1rem",
      },

      transitionDuration: {
        // Hard cap at 200ms per design-system §5.
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
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
