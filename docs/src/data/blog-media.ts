const blogCoverVideos = import.meta.glob('../content/blog/**/cover.mp4', {
  eager: true,
  import: 'default',
  query: '?url'
}) as Record<string, string>;

export function getBlogCoverVideoUrl(slug: string, videoPath?: string): string | undefined {
  if (!videoPath) return undefined;

  const normalizedVideoPath = videoPath.replace(/^\.\//, '');
  return blogCoverVideos[`../content/blog/${slug}/${normalizedVideoPath}`];
}
