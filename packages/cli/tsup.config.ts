import { defineConfig } from 'tsup';
import { chmod } from 'node:fs/promises';
import { join } from 'node:path';

export default defineConfig([
  // Library + SDK entries (no shebang)
  {
    entry: {
      index: 'src/index.ts',
      sdk: 'src/sdk.ts',
    },
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    noExternal: ['@blush/ai', '@blush/core', '@blush/tui', '@blush/team', '@sinclair/typebox'],
  },
  // Binary entry (with shebang + executable)
  {
    entry: { bin: 'src/bin.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    noExternal: ['@blush/ai', '@blush/core', '@blush/tui', '@blush/team', '@sinclair/typebox'],
    banner: { js: '#!/usr/bin/env node' },
    async onSuccess() {
      await chmod(join('dist', 'bin.js'), 0o755);
    },
  },
]);
