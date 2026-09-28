/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
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
        blue: '#2563EB',
        'blue-dark': '#1D4ED8',
        'blue-light': '#EAF1FF',
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
