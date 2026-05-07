/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,jsx}'],
    theme: {
        extend: {
            colors: {
                brand: {
                    50:  '#eff6ff',
                    500: '#2563eb',
                    600: '#1d4ed8',
                    700: '#1e40af'
                }
            },
            fontFamily: {
                // Make Century Gothic the default for everything (font-sans).
                // Fallbacks cover Linux ("URW Gothic"), older Macs ("Apple Gothic"),
                // and finally system-ui / sans-serif.
                sans: ['"Century Gothic"', '"URW Gothic"', '"AppleGothic"',
                       '"Apple Gothic"', 'system-ui', 'ui-sans-serif',
                       'Helvetica', 'Arial', 'sans-serif']
            }
        }
    },
    plugins: []
};
