import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // AVA brand palette. `lane` is the primary accent — AVA red, not teal.
        lane: "#D72638",
        spark: "#f59f00",
      },
    },
  },
  plugins: [],
} satisfies Config;
