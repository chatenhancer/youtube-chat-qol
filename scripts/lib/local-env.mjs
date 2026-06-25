import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function loadLocalEnv({
  env = process.env,
  files = ['.env.local', '.env']
} = {}) {
  for (const file of files) {
    await loadEnvFile(path.join(root, file), env);
  }
}

export function requireEnv(name, { env = process.env } = {}) {
  const value = env[name];
  if (typeof value === 'string' && value.trim()) return value;

  throw new Error(`Missing ${name}. Set it in .env for local use or in the CI environment.`);
}

async function loadEnvFile(filePath, env) {
  let source;
  try {
    source = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  for (const line of source.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed || env[parsed.key] !== undefined) continue;
    env[parsed.key] = parsed.value;
  }
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const assignment = trimmed.startsWith('export ')
    ? trimmed.slice('export '.length).trimStart()
    : trimmed;
  const separatorIndex = assignment.indexOf('=');
  if (separatorIndex === -1) return null;

  const key = assignment.slice(0, separatorIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  return {
    key,
    value: parseEnvValue(assignment.slice(separatorIndex + 1).trim())
  };
}

function parseEnvValue(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replaceAll('\\n', '\n').replaceAll('\\"', '"');
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  const commentIndex = value.indexOf(' #');
  return commentIndex === -1 ? value : value.slice(0, commentIndex).trimEnd();
}
