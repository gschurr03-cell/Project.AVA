import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // AVA brand palette. `lane` is the signature accent — AVA blue.
        lane: "#2F80ED",
        spark: "#F5C451",
        ava: {
          bg: "#081019",
          surface: "#182233",
          accent: "#2F80ED",
          success: "#89D46A",
          warning: "#F5C451",
          error: "#E46464",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-space-grotesk)", "var(--font-inter)", "ui-sans-serif", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
