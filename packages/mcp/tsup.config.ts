import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

/** `src/lib` and `@/types` are bundled in; only the published dependencies stay external. */
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  platform: "node",
  target: "node20",
  clean: true,
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  external: ["@modelcontextprotocol/server", "@napi-rs/keyring", "@supabase/supabase-js", "zod"],
  noExternal: [/^@\//, "uuid", "lucide-react", "react"],
  esbuildOptions(options) {
    options.alias = { "@": fileURLToPath(new URL("../../src", import.meta.url)) };
    options.define = { ...options.define, "process.env.NODE_ENV": '"production"' };
  },
});
