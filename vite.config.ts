// @lovable.dev/vite-tanstack-config já inclui tanstackStart, viteReact, tailwindcss,
// tsConfigPaths, cloudflare (build), componentTagger (dev), env VITE_*, alias @, dedupe,
// loggers de erro e detecção de sandbox. NÃO duplicar esses plugins manualmente.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Para deploy em VPS (Hostinger / Node nativo) rode:
//   BUILD_TARGET=node npm run build
// Isso troca o preset do Nitro para "node-server" e gera dist/server/index.mjs
// que roda com `node dist/server/index.mjs` (porta 3000 por padrão; configurável via PORT).
// Sem a env var, o build padrão continua sendo Cloudflare/Lovable, sem mudar nada.
const isNodeTarget = process.env.BUILD_TARGET === "node";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  ...(isNodeTarget
    ? {
        nitro: {
          preset: "node-server",
          output: {
            dir: "dist",
            serverDir: "dist/server",
            publicDir: "dist/client",
          },
        },
      }
    : {}),
});
