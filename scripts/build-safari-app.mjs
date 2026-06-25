/*
 * Builds the generated Safari Web Extension wrapper for local macOS testing.
 *
 * Run after scripts/package-safari.mjs has generated dist/safari.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadLocalEnv, requireEnv, root } from './lib/local-env.mjs';

await loadLocalEnv();

const appName = process.env.YTCQ_SAFARI_APP_NAME || 'Chat Enhancer for YouTube';
const developmentTeam = requireEnv('YTCQ_SAFARI_DEVELOPMENT_TEAM');
const configuration = process.env.YTCQ_SAFARI_APP_CONFIGURATION || 'Debug';
const projectPath = path.join(root, 'dist', 'safari', appName, `${appName}.xcodeproj`);
const scheme = process.env.YTCQ_SAFARI_SCHEME || `${appName} (macOS)`;

run('xcodebuild', [
  '-project',
  projectPath,
  '-scheme',
  scheme,
  '-configuration',
  configuration,
  `DEVELOPMENT_TEAM=${developmentTeam}`,
  'build'
]);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status ?? 'unknown status'}`);
  }
}
