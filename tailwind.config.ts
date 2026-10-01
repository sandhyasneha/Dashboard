import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F6F7F4",
        ink: "#1B2431",
        muted: "#5B6573",
        line: "#D9DDD6",
        sign: "#0E6B41",
        signSoft: "#E3F1E9",
        amber: "#C98A00",
        amberSoft: "#FBF0D3",
        brick: "#B3261E",
        brickSoft: "#F8E1DF",
        slate: "#E8EBE6",
      },
      fontFamily: { sans: ['"Public Sans"', "system-ui", "sans-serif"] },
      boxShadow: { card: "0 1px 0 rgba(27,36,49,0.06)" },
    },
  },
  plugins: [],
} satisfies Config;
