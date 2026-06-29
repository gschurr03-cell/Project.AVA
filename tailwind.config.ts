import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Track-and-field inspired palette.
        lane: "#0b7285",
        spark: "#f59f00",
      },
    },
  },
  plugins: [],
} satisfies Config;
