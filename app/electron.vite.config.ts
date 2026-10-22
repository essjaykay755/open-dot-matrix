import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const devCspPlugin = {
  name: 'opendotmatrix-dev-csp',
  apply: 'serve' as const,
  transformIndexHtml(html: string): string {
    return html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react(), devCspPlugin]
  }
})
