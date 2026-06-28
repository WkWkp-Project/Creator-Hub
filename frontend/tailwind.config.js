/** @type {import('tailwindcss').Config} */
module.exports = {
  // Scan the shell + every JS module (UI is built from class strings in templates).
  content: ["./index.html", "./assets/**/*.js"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Wakuwaku brand — red / black / white (committed)
        "primary": "#e1121c", "primary-container": "#b80f18", "on-primary": "#ffffff", "on-primary-container": "#ffffff",
        "surface-tint": "#e1121c", "tertiary": "#b80f18", "on-tertiary": "#ffffff",
        "background": "#f6f6f7", "surface": "#ffffff", "surface-bright": "#ffffff", "surface-dim": "#d8d8db",
        "surface-container-lowest": "#ffffff", "surface-container-low": "#f4f4f5", "surface-container": "#ededee",
        "surface-container-high": "#e6e6e8", "surface-container-highest": "#dededf", "surface-variant": "#e9e9ea",
        "on-surface": "#18181b", "on-background": "#18181b", "on-surface-variant": "#52525b",
        "outline": "#a1a1aa", "outline-variant": "#d4d4d8",
        "secondary": "#27272a", "on-secondary": "#ffffff", "secondary-container": "#e4e4e7", "on-secondary-container": "#18181b",
        "error": "#ba1a1a", "on-error": "#ffffff", "error-container": "#ffdad6", "on-error-container": "#410002",
        "inverse-surface": "#2a2a2e", "inverse-on-surface": "#f4f4f5", "inverse-primary": "#ff8a8f",
        "primary-fixed": "#ffd9da", "primary-fixed-dim": "#ffb3b6"
      },
      borderRadius: { DEFAULT: "0.25rem", lg: "0.5rem", xl: "0.75rem", "2xl": "1rem", full: "9999px" },
      spacing: { "container-max": "1440px", "3xl": "64px", "xs": "4px", "base": "4px", "md": "16px",
        "2xl": "48px", "sm": "8px", "xl": "32px", "gutter": "24px", "lg": "24px" },
      fontFamily: { sans: ["Prompt", "Poppins", "sans-serif"], poppins: ["Poppins", "Prompt", "sans-serif"] }
    }
  },
  plugins: [require("@tailwindcss/forms"), require("@tailwindcss/container-queries")]
};
