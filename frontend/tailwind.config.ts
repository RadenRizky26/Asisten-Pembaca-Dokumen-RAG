import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#f8fafc",
        "surface-sidebar": "#ffffff",
        "surface-user": "#e0e7ff",
        "surface-ai": "#ffffff",
        primary: "#4338ca",
        "primary-active": "#3730a3",
        hairline: "#e2e8f0",
        "hairline-soft": "#f1f5f9",
        ink: "#0f172a",
        body: "#334155",
        muted: "#64748b",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        serif: ["var(--font-merriweather)", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
