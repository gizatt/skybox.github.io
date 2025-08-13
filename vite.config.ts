import { defineConfig } from 'vite'

export default defineConfig({
  base: '/skybox.github.io/',
  server: {
    port: 5173,
    host: true
  }
})