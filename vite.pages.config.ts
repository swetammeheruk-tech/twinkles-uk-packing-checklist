import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/twinkles-uk-packing-checklist/",
  build: {
    outDir: "dist-pages",
    emptyOutDir: true,
  },
  plugins: [react()],
});
