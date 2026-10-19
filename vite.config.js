import { defineConfig } from "vite";

export default defineConfig({
  base: "/clearday-personal-scheduler/",
  publicDir: "public",
  build: { outDir: "dist", emptyOutDir: true }
});
