import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  output: 'static',
  // adapter: undefined, // Enable hybrid/server output and add adapter for SSR features
  server: {
    port: 3000,
    host: true,
  },
  vite: {
    // Environment variables are loaded from .env files automatically
  },
});
