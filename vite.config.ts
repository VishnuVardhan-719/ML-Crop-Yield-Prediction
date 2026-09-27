import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // The recorded demo fixture is a full report, and rendering it plus typing a record into
    // jsdom takes several seconds on a busy machine. The 5s default flakes under parallel load.
    testTimeout: 20000,
  },
})
