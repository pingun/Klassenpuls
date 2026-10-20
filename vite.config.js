import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      // zwei Einstiegsseiten: die App und das PowerPoint-Add-in
      input: {
        main: resolve(__dirname, 'index.html'),
        office: resolve(__dirname, 'office.html'),
      },
    },
  },
})
