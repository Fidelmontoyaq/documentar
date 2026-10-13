import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Escala "slate" controlada por variables CSS: el tema claro/oscuro del editor solo cambia las variables.
        slate: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((n) => [n, `rgb(var(--slate-${n}) / <alpha-value>)`])),
        // Navy — ahora con base azul (antes tenia un tinte marron/sepia)
        navy: '#0B1B33',
        'navy-2': '#132A52',
        // Fondo principal: gris-azulado muy claro (antes crema/hueso)
        paper: '#EEF1F8',
        'paper-2': '#E4E9F5',
        // Texto
        ink: '#0F172A',
        'ink-soft': '#5B6270',
        // Azul — nuevo color principal (botones, selecciones, estados activos)
        // Se conserva la escala completa (blue-400, blue-600…) y `blue` solo sigue valiendo #2563EB.
        // Azul acero: sobrio y profesional (sin el azul eléctrico por defecto de Tailwind).
        blue: { 50: '#f3f6fb', 100: '#e4eaf5', 200: '#cad6ec', 300: '#a9bee3', 400: '#82a0d2', 500: '#6272c0', 600: '#4a5aa8', 700: '#3c4a8c', 800: '#2f3a6e', 900: '#262f58', 950: '#171c38', DEFAULT: '#4a5aa8' },
        // Verde salvia/teal apagado en lugar del esmeralda fosforescente.
        emerald: { 50: '#f1f8f6', 100: '#dcede8', 200: '#bcdcd3', 300: '#94c4b8', 400: '#6aa898', 500: '#488c7c', 600: '#397265', 700: '#2f5c52', 800: '#284b44', 900: '#233f39', 950: '#102421' },
        'blue-dark': '#3c4a8c',
        'blue-light': '#e4eaf5',
        // Dorado — se conserva SOLO para detalles mínimos (logo, botón "Nueva plantilla")
        brass: '#A9824F',
        'brass-light': '#D9C08F',
        line: '#E1E5F0',
        danger: '#B4483A',
        success: '#4C7A5E',
      },
      fontFamily: {
        // Sans moderna como tipografía principal de la app (antes serif tipo Georgia)
        sans: ["'Segoe UI'", "Inter", "system-ui", "-apple-system", "Arial", "sans-serif"],
        serif: ["Georgia", "'Iowan Old Style'", "'Times New Roman'", "serif"],
        mono: ["'SFMono-Regular'", "'JetBrains Mono'", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
