import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export async function findLatestWalkthroughVideo(): Promise<string> {
  const videosDir = path.join(process.cwd(), 'docs', 'public', 'videos');
  const entries = await readdir(videosDir).catch(() => []);
  const candidates = entries.filter((entry) => /^chat-enhancer-walkthrough-[a-f0-9]{8}\.mp4$/.test(entry));
  if (!candidates.length) return '';

  const files = await Promise.all(candidates.map(async (fileName) => {
    const fileStat = await stat(path.join(videosDir, fileName));
    return { fileName, mtimeMs: fileStat.mtimeMs };
  }));

  files.sort((first, second) => second.mtimeMs - first.mtimeMs || first.fileName.localeCompare(second.fileName));
  return files[0].fileName;
}
