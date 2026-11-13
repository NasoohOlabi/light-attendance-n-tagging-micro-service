import { defineConfig } from '@neon/config/v1'

export default defineConfig({
  // Declare your Neon services here
  auth: true,
  functions: {
    notebook: {
      name: 'Halaqa notebook API',
      source: 'functions/notebook.ts',
      env: {
        APP_ORIGINS:
          'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,https://nasooholabi.github.io',
      },
    },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {}
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: '7d' }
    }
    // Existing branch: no changes
    return {}
  },
})
