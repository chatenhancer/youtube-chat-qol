import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import { readFile } from 'node:fs/promises';

// Pagefind indexes built HTML, so docs:dev prepares this directory before Astro starts.
const pagefindDevRoot = new URL('./dist/docs/pagefind/', import.meta.url);

function pagefindDevAssets() {
  return {
    name: 'pagefind-dev-assets',
    hooks: {
      'astro:server:setup': ({ server }) => {
        server.middlewares.use('/pagefind', async (request, response, next) => {
          if (!['GET', 'HEAD'].includes(request.method || 'GET')) return next();

          let assetUrl;
          try {
            const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
            assetUrl = new URL(`.${pathname}`, pagefindDevRoot);
          } catch {
            return next();
          }

          if (!assetUrl.href.startsWith(pagefindDevRoot.href)) return next();

          try {
            const contents = await readFile(assetUrl);
            response.statusCode = 200;
            response.setHeader('Cache-Control', 'no-store');
            response.setHeader('Content-Type', getPagefindContentType(assetUrl.pathname));
            response.end(request.method === 'HEAD' ? undefined : contents);
          } catch (error) {
            if (error?.code === 'ENOENT' || error?.code === 'EISDIR') return next();
            return next(error);
          }
        });
      }
    }
  };
}

function getPagefindContentType(pathname) {
  if (pathname.endsWith('.css')) return 'text/css; charset=utf-8';
  if (pathname.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (pathname.endsWith('.pagefind')) return 'application/wasm';
  return 'application/octet-stream';
}

function remarkBlogImages() {
  return (tree) => {
    if (!Array.isArray(tree.children)) return;
    tree.children = transformBlogImageChildren(tree.children);
  };
}

function transformBlogImageChildren(children) {
  const transformed = [];

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    const mediaDirection = getMediaDirective(child);
    if (mediaDirection) {
      const closeIndex = findMediaDirectiveClose(children, index + 1);
      if (closeIndex > index) {
        transformed.push(...createMediaBlockNodes(children.slice(index + 1, closeIndex), mediaDirection));
        index = closeIndex;
        continue;
      }
    }

    if (isImageParagraph(child)) {
      transformed.push(...createImageBlockNodes(child));
      continue;
    }

    transformed.push(child);
  }

  return transformed;
}

function rehypeBlogBrandMentions() {
  return (tree) => transformBrandMentionHtmlNode(tree);
}

function transformBrandMentionHtmlNode(node) {
  if (!node || !Array.isArray(node.children) || shouldSkipBrandMentionNode(node)) return node;

  node.children = node.children.flatMap((child) => {
    if (child.type === 'text') return createBrandTextHtmlNodes(child.value);
    return [transformBrandMentionHtmlNode(child)];
  });

  return node;
}

function shouldSkipBrandMentionNode(node) {
  return ['code', 'pre', 'script', 'style'].includes(node.tagName);
}

function createBrandTextHtmlNodes(value) {
  const text = String(value || '');
  if (!text.includes('Chat Enhancer')) return [{ type: 'text', value: text }];

  const nodes = [];
  const parts = text.split('Chat Enhancer');
  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index]) nodes.push({ type: 'text', value: parts[index] });
    if (index < parts.length - 1) {
      nodes.push({
        type: 'element',
        tagName: 'span',
        properties: { className: ['blog-brand-inline'] },
        children: [
          {
            type: 'element',
            tagName: 'img',
            properties: { alt: '', ariaHidden: 'true', src: '/assets/icons/icon.svg' },
            children: []
          },
          { type: 'text', value: 'Chat Enhancer' }
        ]
      });
    }
  }

  return nodes;
}

function createMediaBlockNodes(children, direction) {
  const imageIndex = children.findIndex(isImageParagraph);
  if (imageIndex < 0) return children;

  const imageNodes = createImageBlockNodes(children[imageIndex], { wrapperTag: 'div' });
  const captionNodes = children.filter((_, index) => index !== imageIndex);
  const imageHtml = imageNodes;
  const captionHtml = [
    htmlNode('<div class="blog-media-copy">'),
    ...captionNodes,
    htmlNode('</div>')
  ];
  const contentNodes = direction === 'left'
    ? [...captionHtml, ...imageHtml]
    : [...imageHtml, ...captionHtml];

  return [
    htmlNode(`<section class="blog-media-block" data-media-direction="${direction}">`),
    ...contentNodes,
    htmlNode('</section>')
  ];
}

function createImageBlockNodes(node, { wrapperTag = 'figure' } = {}) {
  const imageNode = getParagraphImage(node);
  const attributes = stripImageAttributeText(node);
  const classNames = ['blog-image'];
  const styles = [];

  if (isImageShadowEnabled(attributes.shadow)) {
    classNames.push('blog-image-shadow');
  }
  if (attributes.align === 'center') {
    classNames.push('blog-image-align-center');
  } else if (attributes.align === 'right') {
    classNames.push('blog-image-align-right');
  }
  if (attributes.display === 'inline') {
    classNames.push('blog-image-inline');
  }

  const cropRatio = attributes.display === 'inline' ? 0 : parseImageCropRatio(attributes.crop);
  if (cropRatio > 0) {
    classNames.push('blog-image-cropped');
    styles.push(`--blog-image-crop-ratio: ${cropRatio}`);
    const focus = parseImageFocus(attributes.focus);
    styles.push(`--blog-image-focus-x: ${focus.x}%`);
    styles.push(`--blog-image-focus-y: ${focus.y}%`);
  }

  const width = clampImageWidth(parseImageSize(attributes.width));
  styles.push(`--blog-image-width: ${width}%`);
  const rotation = clampImageRotation(parseImageRotation(attributes.rotation ?? attributes.rotate ?? attributes.tilt));
  styles.push(`--blog-image-rotation: ${rotation}deg`);

  if (imageNode) {
    imageNode.data = {
      ...(imageNode.data || {}),
      hProperties: {
        ...((imageNode.data && imageNode.data.hProperties) || {}),
        loading: 'lazy',
        decoding: 'async'
      }
    };
  }

  const classAttribute = classNames.join(' ');
  const styleAttribute = styles.join('; ');
  return [
    htmlNode(`<${wrapperTag} class="${classAttribute}" style="${styleAttribute}">`),
    node,
    htmlNode(`</${wrapperTag}>`)
  ];
}

function getMediaDirective(node) {
  const text = getOnlyParagraphText(node);
  if (text === ':::media-left') return 'left';
  if (text === ':::media-right') return 'right';
  return null;
}

function findMediaDirectiveClose(children, startIndex) {
  for (let index = startIndex; index < children.length; index += 1) {
    if (getOnlyParagraphText(children[index]) === ':::') return index;
  }
  return -1;
}

function isImageParagraph(node) {
  return Boolean(getParagraphImage(node));
}

function getParagraphImage(node) {
  if (!node || node.type !== 'paragraph' || !Array.isArray(node.children)) return null;
  return node.children.find((child) => child.type === 'image') || null;
}

function getOnlyParagraphText(node) {
  if (!node || node.type !== 'paragraph' || !Array.isArray(node.children) || node.children.length !== 1) {
    return '';
  }
  const child = node.children[0];
  return child.type === 'text' ? child.value.trim() : '';
}

function stripImageAttributeText(node) {
  const attributes = {};
  if (!node || !Array.isArray(node.children)) return attributes;

  node.children = node.children.filter((child) => {
    if (child.type !== 'text') return true;
    const match = /^\s*\{([^}]*)\}\s*$/.exec(child.value);
    if (!match) return true;
    Object.assign(attributes, parseImageAttributes(match[1]));
    return false;
  });

  return attributes;
}

function parseImageAttributes(source) {
  const attributes = {};
  for (const part of String(source || '').split(/[;\s]+/)) {
    const [name, rawValue] = part.split('=');
    if (!name || rawValue === undefined) continue;
    attributes[name] = rawValue.replace(/^["']|["']$/g, '');
  }
  return attributes;
}

function parseImageSize(value) {
  const source = String(value || '').trim();
  return source ? Number(source.replace(/%$/, '')) : Number.NaN;
}

function parseImageRotation(value) {
  const source = String(value || '').trim();
  return source ? Number.parseFloat(source.replace(/deg$/, '')) : Number.NaN;
}

function parseImageCropRatio(value) {
  const source = String(value || '').trim();
  if (!source || source === 'false' || source === 'none') return 0;
  if (source === 'true') return 16 / 9;
  if (source.includes(':')) {
    const [width, height] = source.split(':').map((part) => Number.parseFloat(part));
    if (Number.isFinite(width) && Number.isFinite(height) && height > 0) {
      return clampImageCropRatio(width / height);
    }
  }
  return clampImageCropRatio(Number.parseFloat(source));
}

function parseImageFocus(value) {
  const parts = String(value || '').split(',').map((part) => Number.parseFloat(part));
  return {
    x: clampImageFocus(parts[0]),
    y: clampImageFocus(parts[1])
  };
}

function isImageShadowEnabled(value) {
  return ['smooth', 'true'].includes(String(value || '').trim());
}

function clampImageWidth(value) {
  return Math.min(100, Math.max(25, Number.isFinite(value) ? value : 100));
}

function clampImageCropRatio(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(3, Math.max(0.6, Math.round(value * 100) / 100));
}

function clampImageFocus(value) {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

function clampImageRotation(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(8, Math.max(-8, Math.round(value * 2) / 2));
}

function htmlNode(value) {
  return { type: 'html', value };
}

export default defineConfig({
  build: {
    format: 'directory'
  },
  compressHTML: true,
  integrations: [pagefindDevAssets()],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkBlogImages],
      rehypePlugins: [rehypeBlogBrandMentions]
    })
  },
  outDir: './dist/docs',
  publicDir: './docs/public',
  site: 'https://chatenhancer.com',
  srcDir: './docs/src',
  trailingSlash: 'always'
});
