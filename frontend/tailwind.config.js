/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./popup.html", "./actionButton.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef5ff",
          100: "#d9e7ff",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "'PingFang SC'",
          "'Microsoft YaHei'",
          "sans-serif",
        ],
      },
      animation: {
        "caret-blink": "caret-blink 1s step-end infinite",
        "fade-in": "fade-in 0.12s ease-out",
      },
      keyframes: {
        "caret-blink": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(2px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
