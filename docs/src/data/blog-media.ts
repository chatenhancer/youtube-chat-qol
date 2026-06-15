const blogCoverVideos = import.meta.glob('../content/blog/**/*.mp4', {
  eager: true,
  import: 'default',
  query: '?url'
}) as Record<string, string>;

export function getBlogCoverVideoUrl(folder: string, videoPath?: string): string | undefined {
  if (!videoPath) return undefined;

  const normalizedVideoPath = videoPath.replace(/^\.\//, '');
  return blogCoverVideos[`../content/blog/${folder}/${normalizedVideoPath}`];
}
