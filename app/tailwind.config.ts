import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2937",
        cream: "#fff8ef",
        coral: "#ff6f61",
        dune: "#d9a066",
      },
      fontFamily: {
        display: ["\"Space Grotesk\"", "sans-serif"],
        body: ["\"DM Sans\"", "sans-serif"],
      },
      boxShadow: {
        card: "0 12px 32px rgba(31, 41, 55, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
