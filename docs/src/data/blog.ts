import type { CollectionEntry } from 'astro:content';
import { defaultLocale, getLocaleUrl, htmlLangFor, localeMeta, locales } from './locales';
import type { Locale } from './locales';
import { site } from './site';

export type BlogPost = CollectionEntry<'blog'>;

export interface AlternateLink {
  href: string;
  hreflang: string;
}

export interface BlogMessages {
  archiveCopy: string;
  backToUpdates: string;
  latestNotes: string;
  updates: string;
  viewAllUpdates: string;
}

const blogMessages: Record<Locale, BlogMessages> = {
  ar: {
    archiveCopy: 'ملاحظات الإصدارات وتحديثات المشروع لـ Chat Enhancer for YouTube.',
    backToUpdates: 'العودة إلى التحديثات',
    latestNotes: 'The Backlog',
    updates: 'التحديثات',
    viewAllUpdates: 'عرض كل التحديثات'
  },
  de: {
    archiveCopy: 'Versionshinweise und Projektupdates für Chat Enhancer for YouTube.',
    backToUpdates: 'Zurück zu den Updates',
    latestNotes: 'The Backlog',
    updates: 'Updates',
    viewAllUpdates: 'Alle Updates anzeigen'
  },
  en: {
    archiveCopy: 'Release notes and project updates for Chat Enhancer for YouTube.',
    backToUpdates: 'Back to updates',
    latestNotes: 'The Backlog',
    updates: 'Updates',
    viewAllUpdates: 'View all updates'
  },
  es: {
    archiveCopy: 'Notas de versión y novedades del proyecto Chat Enhancer for YouTube.',
    backToUpdates: 'Volver a las novedades',
    latestNotes: 'The Backlog',
    updates: 'Novedades',
    viewAllUpdates: 'Ver todas las novedades'
  },
  fa: {
    archiveCopy: 'یادداشت‌های انتشار و به‌روزرسانی‌های پروژه Chat Enhancer for YouTube.',
    backToUpdates: 'بازگشت به به‌روزرسانی‌ها',
    latestNotes: 'The Backlog',
    updates: 'به‌روزرسانی‌ها',
    viewAllUpdates: 'مشاهده همه به‌روزرسانی‌ها'
  },
  fr: {
    archiveCopy: 'Notes de version et actualités du projet Chat Enhancer for YouTube.',
    backToUpdates: 'Retour aux actualités',
    latestNotes: 'The Backlog',
    updates: 'Actualités',
    viewAllUpdates: 'Voir toutes les actualités'
  },
  he: {
    archiveCopy: 'הערות גרסה ועדכוני פרויקט עבור Chat Enhancer for YouTube.',
    backToUpdates: 'חזרה לעדכונים',
    latestNotes: 'The Backlog',
    updates: 'עדכונים',
    viewAllUpdates: 'הצגת כל העדכונים'
  },
  hi: {
    archiveCopy: 'Chat Enhancer for YouTube के रिलीज़ नोट्स और प्रोजेक्ट अपडेट।',
    backToUpdates: 'अपडेट पर वापस जाएँ',
    latestNotes: 'The Backlog',
    updates: 'अपडेट',
    viewAllUpdates: 'सभी अपडेट देखें'
  },
  id: {
    archiveCopy: 'Catatan rilis dan pembaruan proyek untuk Chat Enhancer for YouTube.',
    backToUpdates: 'Kembali ke pembaruan',
    latestNotes: 'The Backlog',
    updates: 'Pembaruan',
    viewAllUpdates: 'Lihat semua pembaruan'
  },
  it: {
    archiveCopy: 'Note di rilascio e aggiornamenti del progetto Chat Enhancer for YouTube.',
    backToUpdates: 'Torna agli aggiornamenti',
    latestNotes: 'The Backlog',
    updates: 'Aggiornamenti',
    viewAllUpdates: 'Vedi tutti gli aggiornamenti'
  },
  ja: {
    archiveCopy: 'Chat Enhancer for YouTube のリリースノートとプロジェクト更新情報です。',
    backToUpdates: '更新情報に戻る',
    latestNotes: 'The Backlog',
    updates: '更新情報',
    viewAllUpdates: 'すべての更新情報を見る'
  },
  ko: {
    archiveCopy: 'Chat Enhancer for YouTube의 릴리스 노트와 프로젝트 업데이트입니다.',
    backToUpdates: '업데이트로 돌아가기',
    latestNotes: 'The Backlog',
    updates: '업데이트',
    viewAllUpdates: '모든 업데이트 보기'
  },
  nl: {
    archiveCopy: 'Release notes en projectupdates voor Chat Enhancer for YouTube.',
    backToUpdates: 'Terug naar updates',
    latestNotes: 'The Backlog',
    updates: 'Updates',
    viewAllUpdates: 'Alle updates bekijken'
  },
  pl: {
    archiveCopy: 'Informacje o wydaniach i aktualizacje projektu Chat Enhancer for YouTube.',
    backToUpdates: 'Wróć do aktualizacji',
    latestNotes: 'The Backlog',
    updates: 'Aktualizacje',
    viewAllUpdates: 'Zobacz wszystkie aktualizacje'
  },
  pt: {
    archiveCopy: 'Notas de versão e atualizações do projeto Chat Enhancer for YouTube.',
    backToUpdates: 'Voltar para atualizações',
    latestNotes: 'The Backlog',
    updates: 'Atualizações',
    viewAllUpdates: 'Ver todas as atualizações'
  },
  ru: {
    archiveCopy: 'Заметки о выпусках и обновления проекта Chat Enhancer for YouTube.',
    backToUpdates: 'Назад к обновлениям',
    latestNotes: 'The Backlog',
    updates: 'Обновления',
    viewAllUpdates: 'Все обновления'
  },
  th: {
    archiveCopy: 'บันทึกการเปิดตัวและอัปเดตโปรเจกต์สำหรับ Chat Enhancer for YouTube',
    backToUpdates: 'กลับไปที่อัปเดต',
    latestNotes: 'The Backlog',
    updates: 'อัปเดต',
    viewAllUpdates: 'ดูอัปเดตทั้งหมด'
  },
  tr: {
    archiveCopy: 'Chat Enhancer for YouTube için sürüm notları ve proje güncellemeleri.',
    backToUpdates: 'Güncellemelere dön',
    latestNotes: 'The Backlog',
    updates: 'Güncellemeler',
    viewAllUpdates: 'Tüm güncellemeleri gör'
  },
  uk: {
    archiveCopy: 'Нотатки про випуски й оновлення проєкту Chat Enhancer for YouTube.',
    backToUpdates: 'Назад до оновлень',
    latestNotes: 'The Backlog',
    updates: 'Оновлення',
    viewAllUpdates: 'Переглянути всі оновлення'
  },
  vi: {
    archiveCopy: 'Ghi chú phát hành và cập nhật dự án cho Chat Enhancer for YouTube.',
    backToUpdates: 'Quay lại cập nhật',
    latestNotes: 'The Backlog',
    updates: 'Cập nhật',
    viewAllUpdates: 'Xem tất cả cập nhật'
  },
  zh_CN: {
    archiveCopy: 'Chat Enhancer for YouTube 的发布说明和项目更新。',
    backToUpdates: '返回更新',
    latestNotes: 'The Backlog',
    updates: '更新',
    viewAllUpdates: '查看所有更新'
  },
  zh_TW: {
    archiveCopy: 'Chat Enhancer for YouTube 的版本說明與專案更新。',
    backToUpdates: '返回更新',
    latestNotes: 'The Backlog',
    updates: '更新',
    viewAllUpdates: '查看所有更新'
  }
};

export function getBlogMessages(locale: Locale): BlogMessages {
  return blogMessages[locale] || blogMessages.en;
}

export function getLocalizedBlogPosts(posts: BlogPost[], locale: Locale): BlogPost[] {
  return Array.from(groupPostsByTranslationKey(posts).values())
    .map((translations) => findPostForLocale(translations, locale) || findPostForLocale(translations, defaultLocale))
    .filter((post): post is BlogPost => Boolean(post))
    .sort(comparePostsByDate);
}

export function getBlogPostTranslations(posts: BlogPost[], post: BlogPost): BlogPost[] {
  return groupPostsByTranslationKey(posts).get(post.data.translationKey) || [post];
}

export function getPostLocale(post: BlogPost): Locale {
  return toLocale(post.data.locale);
}

export function getBlogIndexPath(locale: Locale): string {
  return `${getLocaleUrl(locale)}blog/`;
}

export function getBlogPostPath(post: BlogPost): string {
  return `${getLocaleUrl(getPostLocale(post))}blog/${post.data.slug}/`;
}

export function getBlogIndexUrl(locale: Locale): string {
  return `${site.url}${getBlogIndexPath(locale)}`;
}

export function getBlogPostUrl(post: BlogPost): string {
  return `${site.url}${getBlogPostPath(post)}`;
}

export function getBlogIndexAlternateLinks(): AlternateLink[] {
  return locales.map((locale) => ({
    href: getBlogIndexUrl(locale),
    hreflang: htmlLangFor(locale)
  }));
}

export function getBlogPostAlternateLinks(posts: BlogPost[], post: BlogPost): AlternateLink[] {
  return getBlogPostTranslations(posts, post).map((translation) => ({
    href: getBlogPostUrl(translation),
    hreflang: htmlLangFor(getPostLocale(translation))
  }));
}

export function getBlogIndexLanguageUrls(): Partial<Record<Locale, string>> {
  return Object.fromEntries(locales.map((locale) => [locale, getBlogIndexPath(locale)]));
}

export function getBlogPostLanguageUrls(posts: BlogPost[], post: BlogPost): Partial<Record<Locale, string>> {
  return Object.fromEntries(
    getBlogPostTranslations(posts, post).map((translation) => [
      getPostLocale(translation),
      getBlogPostPath(translation)
    ])
  );
}

export function getBlogEntryFolder(post: BlogPost): string {
  const normalizedId = post.id.replace(/\\/g, '/').replace(/\.[^/.]+$/, '');
  const parts = normalizedId.split('/');
  const fileName = parts[parts.length - 1] || '';
  if (fileName === 'index' || isLocaleFileName(fileName)) {
    parts.pop();
  }

  return parts.join('/');
}

export function toLocale(value: string): Locale {
  if (isLocale(value)) return value;
  throw new Error(`Unsupported blog locale: ${value}`);
}

function groupPostsByTranslationKey(posts: BlogPost[]): Map<string, BlogPost[]> {
  const groups = new Map<string, BlogPost[]>();
  for (const post of posts) {
    const group = groups.get(post.data.translationKey) || [];
    group.push(post);
    groups.set(post.data.translationKey, group);
  }

  return groups;
}

function findPostForLocale(posts: BlogPost[], locale: Locale): BlogPost | undefined {
  return posts.find((post) => getPostLocale(post) === locale);
}

function comparePostsByDate(first: BlogPost, second: BlogPost): number {
  return second.data.date.valueOf() - first.data.date.valueOf();
}

function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

function isLocaleFileName(value: string): boolean {
  return value === 'zh_CN' || value === 'zh_TW' || Boolean(localeMeta[value as Locale]);
}
