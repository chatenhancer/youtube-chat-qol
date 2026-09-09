import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSiteAnnouncement } from "./site-announcement";

describe("docs announcements", () => {
  const source = "https://media.chatenhancer.com/announcement.json";
  let container: HTMLParagraphElement;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    container = document.createElement("p");
    container.dataset.siteAnnouncement = "";
    container.dataset.announcementUrl = source;
    container.dataset.announcementLocale = "es";
    container.hidden = true;
    document.body.append(container);
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("loads the current localized text without sending credentials", async () => {
    fetchMock.mockResolvedValue(Response.json({
      enabled: true,
      messages: { en: "Update to version 1.0.4.", es: "Actualiza a la versión 1.0.4." }
    }));

    await loadSiteAnnouncement();

    expect(fetchMock).toHaveBeenCalledWith(source, expect.objectContaining({ credentials: "omit" }));
    expect(container.hidden).toBe(false);
    expect(container.textContent).toBe("Actualiza a la versión 1.0.4.");
    expect(container.lang).toBe("es");
  });

  it("uses English and its text direction when a translation is missing", async () => {
    container.dataset.announcementLocale = "ar";
    fetchMock.mockResolvedValue(Response.json({ enabled: true, messages: { en: "Update available", ar: " " } }));

    await loadSiteAnnouncement();

    expect(container.hidden).toBe(false);
    expect(container.textContent).toBe("Update available");
    expect(container.lang).toBe("en");
    expect(container.dir).toBe("auto");
  });

  it("renders message markup as plain text", async () => {
    const message = '<img src=x onerror="alert(1)">';
    fetchMock.mockResolvedValue(Response.json({ enabled: true, messages: { en: message } }));

    await loadSiteAnnouncement();

    expect(container.textContent).toBe(message);
    expect(container.querySelector("img")).toBeNull();
  });

  it.each(["https://chatenhancer.com/#install", "/#install"])("links the message to %s", async (link) => {
    fetchMock.mockResolvedValue(Response.json({ enabled: true, messages: { en: "Update available" }, link }));

    await loadSiteAnnouncement();

    expect(container.querySelector("a")?.href).toBe(new URL(link, window.location.origin).href);
    expect(container.querySelector("a")?.textContent).toBe("Update available");
  });

  it("keeps the message before a separate localized link", async () => {
    fetchMock.mockResolvedValue(Response.json({
      enabled: true,
      messages: { en: "Update available.", es: "Actualización disponible." },
      link: "/update/",
      linkLabels: { en: "Learn how to check for updates", es: "Cómo buscar actualizaciones" }
    }));

    await loadSiteAnnouncement();

    expect(container.textContent).toBe("Actualización disponible. Cómo buscar actualizaciones");
    expect(container.firstChild?.textContent).toBe("Actualización disponible. ");
    expect(container.querySelector("a")?.textContent).toBe("Cómo buscar actualizaciones");
    expect(container.querySelector("a")?.href).toBe(new URL("/update/", window.location.origin).href);
    expect(container.querySelector("a")?.lang).toBe("es");
  });

  it("falls back to an English link label without changing the message language", async () => {
    container.dataset.announcementLocale = "ar";
    fetchMock.mockResolvedValue(Response.json({
      enabled: true,
      messages: { ar: "يتوفر تحديث." },
      link: "/update/",
      linkLabels: { en: "Learn how to check for updates", ar: " " }
    }));

    await loadSiteAnnouncement();

    expect(container.textContent).toBe("يتوفر تحديث. Learn how to check for updates");
    expect(container.lang).toBe("ar");
    expect(container.querySelector("a")?.lang).toBe("en");
    expect(container.querySelector("a")?.dir).toBe("auto");
  });

  it("renders link label markup as plain text", async () => {
    const label = "<strong>Learn how to check for updates</strong>";
    fetchMock.mockResolvedValue(Response.json({
      enabled: true,
      messages: { en: "Update available." },
      link: "/update/",
      linkLabels: { en: label }
    }));

    await loadSiteAnnouncement();

    expect(container.querySelector("a")?.textContent).toBe(label);
    expect(container.querySelector("strong")).toBeNull();
  });

  it.each(["javascript:alert(1)", "data:text/html,unsafe", "https://["])("ignores an unsafe or invalid link: %s", async (link) => {
    fetchMock.mockResolvedValue(Response.json({
      enabled: true,
      messages: { en: "Update available" },
      link,
      linkLabels: { en: "Learn how to check for updates" }
    }));

    await loadSiteAnnouncement();

    expect(container.hidden).toBe(false);
    expect(container.textContent).toBe("Update available");
    expect(container.querySelector("a")).toBeNull();
  });

  it.each([
    { enabled: false, messages: { en: "Disabled" } },
    { enabled: "true", messages: { en: "Invalid" } },
    { enabled: true, messages: { en: " " } },
    { enabled: true, messages: { en: 104 } },
    { enabled: true, messages: null },
    { enabled: true, messages: ["Invalid"] },
    null
  ])("keeps disabled or malformed announcements hidden: %j", async (announcement) => {
    fetchMock.mockResolvedValue(Response.json(announcement));

    await loadSiteAnnouncement();

    expect(container.hidden).toBe(true);
    expect(container.textContent).toBe("");
  });

  it("shows an announcement only before its expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T12:00:00Z"));
    const announcement = {
      enabled: true,
      messages: { en: "Temporary notice" },
      expiresAt: "2026-09-10T12:00:00Z"
    };
    fetchMock.mockImplementation(async () => Response.json(announcement));

    await loadSiteAnnouncement();
    expect(container.hidden).toBe(false);

    container.hidden = true;
    container.textContent = "";
    vi.setSystemTime(new Date(announcement.expiresAt));
    await loadSiteAnnouncement();
    expect(container.hidden).toBe(true);
    expect(container.textContent).toBe("");
  });

  it("hides announcements with an invalid expiry", async () => {
    fetchMock.mockResolvedValue(Response.json({
      enabled: true, messages: { en: "Invalid expiry" }, expiresAt: "not a date"
    }));

    await loadSiteAnnouncement();

    expect(container.hidden).toBe(true);
  });

  it.each(["network", "http", "json"])("keeps the docs usable after a %s failure", async (failure) => {
    if (failure === "network") fetchMock.mockRejectedValue(new TypeError("Network unavailable"));
    else if (failure === "http") fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    else fetchMock.mockResolvedValue(new Response("Invalid JSON"));

    await expect(loadSiteAnnouncement()).resolves.toBeUndefined();

    expect(container.hidden).toBe(true);
    expect(container.textContent).toBe("");
  });
});
