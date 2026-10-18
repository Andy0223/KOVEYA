import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({
      persistState: process.env.KOVEYA_TEST_STATE
        ? { path: process.env.KOVEYA_TEST_STATE }
        : true,
    }),
  ],
});
