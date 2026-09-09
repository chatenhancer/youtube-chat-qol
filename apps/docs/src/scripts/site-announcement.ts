export async function loadSiteAnnouncement(): Promise<void> {
  const container = document.querySelector<HTMLElement>("[data-site-announcement]");
  const source = container?.dataset.announcementUrl;
  if (!container || !source) return;

  try {
    const response = await fetch(source, {
      credentials: "omit",
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return;

    const announcement: unknown = await response.json();
    if (!isRecord(announcement) || announcement.enabled !== true || !isRecord(announcement.messages)) return;

    if (announcement.expiresAt !== undefined) {
      const expiry = Date.parse(readText(announcement.expiresAt));
      if (!Number.isFinite(expiry) || expiry <= Date.now()) return;
    }

    const requestedLocale = container.dataset.announcementLocale || "en";
    const locale = readText(announcement.messages[requestedLocale]) ? requestedLocale : "en";
    const message = readText(announcement.messages[locale]);
    if (!message) return;

    const href = readLink(announcement.link);
    if (href) {
      const link = document.createElement("a");
      link.href = href;
      const labels = isRecord(announcement.linkLabels) ? announcement.linkLabels : {};
      const labelLocale = readText(labels[locale]) ? locale : "en";
      const label = readText(labels[labelLocale]);
      link.textContent = label || message;
      if (label) {
        link.lang = labelLocale.replace("_", "-");
        link.dir = "auto";
        container.replaceChildren(`${message} `, link);
      } else {
        container.replaceChildren(link);
      }
    } else {
      container.textContent = message;
    }
    container.lang = locale.replace("_", "-");
    container.dir = "auto";
    container.hidden = false;
  } catch {
    // An unavailable or malformed announcement must not interrupt the docs.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readLink(value: unknown): string | null {
  const text = readText(value);
  if (!text) return null;
  try {
    const url = new URL(text, window.location.origin);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
