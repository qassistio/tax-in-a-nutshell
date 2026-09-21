import { defineConfig } from 'vitest/config'

// The domain layer (requirements.md §37/§38) is plain, Vue-free TypeScript
// by design specifically so it can be unit tested without booting Nuxt —
// so this config just points vitest at it, no Vue/Nuxt plugin needed.
// server/**/*.test.ts is included too: Nitro API routes are also plain
// Node/TypeScript (see compute-irmark.test.ts), not Vue.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['app/domain/**/*.test.ts', 'server/**/*.test.ts']
  }
})
