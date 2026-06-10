import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api/tableau': {
        target: 'https://prod-apnortheast-a.online.tableau.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/tableau/, ''),
      },
    },
  },
})
