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
  			gignite: {
  				bg: '#EFE7D3',
  				card: '#FAF3E2',
  				surface: '#FFFFFF',
  				border: '#D9CDB2',
  				'border-strong': '#C9BC9F',
  				divider: '#F1EADB',
  				text: '#2C2C2C',
  				heading: '#000000',
  				accent: '#F27721',
  				'accent-hover': '#FF8A38',
  				blue: '#20419A',
  				'blue-pale': '#E4EAF6',
  				danger: '#B23A16',
  				'danger-pale': '#F5E1DC',
  				warn: '#C25E0E',
  				'warn-pale': '#FBEEDA',
  				success: '#1F7A42',
  				'success-pale': '#E4F1E6',
  				muted: '#6B6355'
  			},
  			// Participant-facing palette, matched to the Gadgeon.ai site
  			// (see gadgeon-design-reference.md). The admin side keeps `gignite`.
  			ignite: {
  				ink: '#2C1D44',
  				'ink-soft': '#4C3D66',
  				muted: '#6A7282',
  				faint: '#99A1AF',
  				bg: '#F4F6FA',
  				lavender: '#F2F0F8',
  				surface: '#FFFFFF',
  				line: 'rgba(0, 0, 0, 0.10)',
  				navy: '#0D0B18',
  				'navy-2': '#16132B',
  				'on-dark': '#D2CDE6',
  				orange: '#F47920',
  				magenta: '#C756D9',
  				blue: '#3182FC',
  				royal: '#2C5FFF',
  				lime: '#D8D800',
  				danger: '#D4183D',
  				'danger-pale': '#FDE8EC',
  				success: '#1F7A42',
  				'success-pale': '#E4F1E6',
  				warn: '#C25E0E',
  				'warn-pale': '#FBEEDA'
  			}
  		},
  		fontFamily: {
  			heading: ['var(--font-heading)'],
  			body: ['var(--font-body)'],
  			mono: ['var(--font-mono)'],
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
