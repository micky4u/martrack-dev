// Vercel deployment fix:
// Lovable's default TanStack Start config enables the Cloudflare build adapter.
// For Vercel we disable Cloudflare and add Nitro, as Vercel's TanStack Start
// deployment expects the Nitro Vite plugin.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

export default defineConfig({
  cloudflare: false,
  plugins: [nitro()],
});
