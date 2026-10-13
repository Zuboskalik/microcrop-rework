/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: ['./resources/views/**/*.blade.php', './resources/js/**/*.{vue,ts}'],
    theme: {
        extend: {
            colors: {
                // Темная палитра в духе Aseprite / TexturePacker
                surface: {
                    950: '#0b0d12',
                    900: '#11141b',
                    800: '#181c25',
                    700: '#222734',
                    600: '#2e3444',
                },
                accent: {
                    400: '#7dd3fc',
                    500: '#38bdf8',
                    600: '#0ea5e9',
                },
            },
            fontFamily: {
                sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
                mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
            },
        },
    },
    plugins: [],
};
