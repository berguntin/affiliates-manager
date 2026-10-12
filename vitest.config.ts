import { defineConfig } from 'vitest/config'

// Tests unitarios de la lógica de negocio pura (server/domain) y de los mappers.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
