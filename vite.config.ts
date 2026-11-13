import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'development-csp',
      apply: 'serve',
      transformIndexHtml(html) {
        return html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
      },
    },
  ],
  server: { port: 5173, strictPort: true },
})
