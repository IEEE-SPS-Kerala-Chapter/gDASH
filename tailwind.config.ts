import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: ["class"],
    content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			// Brand palette matched to the Gadgeon.ai site (see
  			// gadgeon-design-reference.md). Values are CSS variables set per
  			// theme in app/globals.css (:root = light, .dark = dark).
  			ignite: {
  				'ink': 'rgb(var(--ig-ink) / <alpha-value>)',
  				'ink-soft': 'rgb(var(--ig-ink-soft) / <alpha-value>)',
  				'muted': 'rgb(var(--ig-muted) / <alpha-value>)',
  				'faint': 'rgb(var(--ig-faint) / <alpha-value>)',
  				'bg': 'rgb(var(--ig-bg) / <alpha-value>)',
  				'surface': 'rgb(var(--ig-surface) / <alpha-value>)',
  				'lavender': 'rgb(var(--ig-lavender) / <alpha-value>)',
  				'edge': 'rgb(var(--ig-edge) / <alpha-value>)',
  				'primary': 'rgb(var(--ig-primary) / <alpha-value>)',
  				'primary-hover': 'rgb(var(--ig-primary-hover) / <alpha-value>)',
  				'on-primary': 'rgb(var(--ig-on-primary) / <alpha-value>)',
  				'navy': 'rgb(var(--ig-navy) / <alpha-value>)',
  				'navy-2': 'rgb(var(--ig-navy-2) / <alpha-value>)',
  				'on-dark': 'rgb(var(--ig-on-dark) / <alpha-value>)',
  				'orange': 'rgb(var(--ig-orange) / <alpha-value>)',
  				'magenta': 'rgb(var(--ig-magenta) / <alpha-value>)',
  				'blue': 'rgb(var(--ig-blue) / <alpha-value>)',
  				'royal': 'rgb(var(--ig-royal) / <alpha-value>)',
  				'lime': 'rgb(var(--ig-lime) / <alpha-value>)',
  				'danger': 'rgb(var(--ig-danger) / <alpha-value>)',
  				'danger-pale': 'rgb(var(--ig-danger-pale) / <alpha-value>)',
  				'success': 'rgb(var(--ig-success) / <alpha-value>)',
  				'success-pale': 'rgb(var(--ig-success-pale) / <alpha-value>)',
  				'warn': 'rgb(var(--ig-warn) / <alpha-value>)',
  				'warn-pale': 'rgb(var(--ig-warn-pale) / <alpha-value>)'
  			}
  		},
  		fontFamily: {
  			display: ['var(--font-sora)', 'sans-serif'],
  			ui: ['var(--font-urbanist)', 'sans-serif']
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
