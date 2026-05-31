/**
 * Failure-only DOM artifact capture for browser smoke tests.
 *
 * YouTube DOM breakages are easiest to diagnose when the failing run leaves
 * the full live chat frame and watch page markup behind. These dumps are local
 * test artifacts under test-results/ and are intentionally not sanitized.
 */
import type { BrowserContext, Frame, Page, TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface DumpedFile {
  contentType: string;
  name: string;
  path: string;
}

interface FrameSummary {
  name: string;
  url: string;
}

interface PageSummary {
  frames: FrameSummary[];
  title: string;
  url: string;
}

interface DomDumpSummary {
  pages: PageSummary[];
  status: string | undefined;
  test: string;
}

export async function dumpDomOnFailure(
  context: BrowserContext,
  testInfo: TestInfo
): Promise<void> {
  if (testInfo.status === testInfo.expectedStatus) return;

  const outputDir = testInfo.outputPath('dom-dump');
  await mkdir(outputDir, { recursive: true });

  const dumpedFiles: DumpedFile[] = [];
  const pages = context.pages();
  const pageSummaries: PageSummary[] = [];

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    pageSummaries.push(await getPageSummary(page));
    await dumpPage(page, pageIndex, outputDir, dumpedFiles);
  }

  const summary: DomDumpSummary = {
    pages: pageSummaries,
    status: testInfo.status,
    test: testInfo.titlePath.join(' > ')
  };
  const summaryPath = path.join(outputDir, 'summary.json');
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  dumpedFiles.unshift({
    contentType: 'application/json',
    name: 'dom-dump-summary',
    path: summaryPath
  });

  for (const file of dumpedFiles) {
    await testInfo.attach(file.name, {
      contentType: file.contentType,
      path: file.path
    });
  }
}

async function dumpPage(
  page: Page,
  pageIndex: number,
  outputDir: string,
  dumpedFiles: DumpedFile[]
): Promise<void> {
  await dumpHtml(
    `page-${pageIndex}-main`,
    page.mainFrame(),
    outputDir,
    dumpedFiles
  );

  const childFrames = page.frames().filter((frame) => frame !== page.mainFrame());
  for (let frameIndex = 0; frameIndex < childFrames.length; frameIndex += 1) {
    const frameName = getSafeFilePart(childFrames[frameIndex].name());
    await dumpHtml(
      ['page', String(pageIndex), 'frame', String(frameIndex), frameName].filter(Boolean).join('-'),
      childFrames[frameIndex],
      outputDir,
      dumpedFiles
    );
  }
}

async function dumpHtml(
  name: string,
  frame: Frame,
  outputDir: string,
  dumpedFiles: DumpedFile[]
): Promise<void> {
  const filePath = path.join(outputDir, `${name}.html`);
  const html = await frame.content().catch((error) => (
    `<!-- Could not read frame DOM: ${String(error)} -->`
  ));
  await writeFile(filePath, html);
  dumpedFiles.push({
    contentType: 'text/html',
    name,
    path: filePath
  });
}

async function getPageSummary(page: Page): Promise<PageSummary> {
  return {
    frames: page.frames().map((frame) => ({
      name: frame.name(),
      url: frame.url()
    })),
    title: await page.title().catch(() => ''),
    url: page.url()
  };
}

function getSafeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
