import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://cyberinventors.com",
  output: "static",
  adapter: cloudflare(),
  vite: {
    plugins: [tailwindcss()],
  },
});
