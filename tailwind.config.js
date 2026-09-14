/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        dark: {
          DEFAULT: "#5912ED",
          100: "#5912ED",
          200: "#4A0EC8",
          300: "#7D45F6",
          400: "#3E0CA8"
        },
        primary: {
          DEFAULT: "#5912ED",
          50: "#F1EAFE",
          100: "#E3D6FD",
          500: "#5912ED",
          600: "#4A0EC8",
          700: "#3E0CA8"
        },
        accent: "#C9B4FF",
        success: "#22C55E",
        warning: "#F59E0B",
        danger: "#EF4444"
      },
      borderRadius: {
        card: "20px"
      },
      boxShadow: {
        card: "0 8px 32px rgba(0, 0, 0, 0.4)",
        glow: "0 0 20px rgba(89, 18, 237, 0.3)"
      },
      animation: {
        "fade-in": "fadeIn 300ms ease-out",
        "slide-up": "slideUp 400ms ease-out",
        "scale-in": "scaleIn 200ms ease-out",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
        "shimmer": "shimmer 1.5s ease-in-out infinite",
        "bounce-soft": "bounceSoft 1s ease-in-out"
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        slideUp: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" }
        },
        scaleIn: {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" }
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" }
        },
        bounceSoft: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" }
        }
      }
    }
  },
  plugins: []
};