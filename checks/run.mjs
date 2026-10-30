import { build } from 'vite';
import { spawnSync } from 'node:child_process';
await build({ configFile: false, logLevel: 'error', build: { outDir: 'checks-build', minify: false, lib: { entry: process.cwd() + '/checks/week-preview.tsx', formats: ['cjs'], fileName: () => 'checks.cjs' }, rolldownOptions: { external: ['node:assert/strict'], platform: 'node' } } });
const result = spawnSync(process.execPath, ['checks-build/checks.cjs'], { stdio: 'inherit', timeout: 30000 });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
