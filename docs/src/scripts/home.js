(() => {
  const docsConfig = readDocsConfig();
  const installActions = document.querySelector("[data-install-actions]");
  const chromeButton = document.querySelector('[data-browser-install="chrome"]');
  const firefoxButton = document.querySelector('[data-browser-install="firefox"]');
  const languageSwitcher = document.querySelector("[data-language-switcher]");
  const supportModal = document.querySelector("[data-support-modal]");
  const supportModalClose = document.querySelector("[data-support-modal-close]");
  const supportModalContinue = document.querySelector("[data-support-modal-continue]");
  const walkthroughCtas = document.querySelectorAll("[data-walkthrough-cta]");
  const walkthroughOpenButtons = document.querySelectorAll("[data-walkthrough-open]");
  const walkthroughModal = document.querySelector("[data-walkthrough-modal]");
  const walkthroughClose = document.querySelector("[data-walkthrough-close]");
  const walkthroughTime = document.querySelector("[data-walkthrough-time]");
  const walkthroughVideo = document.querySelector("[data-walkthrough-video]");
  const walkthroughVideoFeedback = document.querySelector("[data-walkthrough-feedback]");
  const walkthroughHash = "#walkthrough";
  const versionBadgeSources = {
    release: {
      image: "https://img.shields.io/github/v/release/chat-enhancer-yt/youtube-chat-qol?label=release",
      json: "https://img.shields.io/github/v/release/chat-enhancer-yt/youtube-chat-qol.json?label=release"
    },
    chrome: {
      image: "https://img.shields.io/chrome-web-store/v/pkhaaipeppfpakofgpdpcpkflangpghf?label=chrome%20web%20store",
      json: "https://img.shields.io/chrome-web-store/v/pkhaaipeppfpakofgpdpcpkflangpghf.json?label=chrome%20web%20store"
    },
    firefox: {
      image: "https://img.shields.io/amo/v/chat-enhancer-for-youtube?label=firefox%20add-ons",
      json: "https://img.shields.io/amo/v/chat-enhancer-for-youtube.json?label=firefox%20add-ons"
    }
  };
  const versionBadgeColors = {
    current: "2da44e",
    pending: "f59e0b",
    unknown: "6b7280"
  };
  let walkthroughFeedbackTimer = 0;

  setupTopHeaderState();
  setupActiveNavigation();
  setupContactEmailLinks();
  setupWalkthroughVideoModal();

  if (languageSwitcher) {
    languageSwitcher.value = getCurrentLocalePath(languageSwitcher);
    languageSwitcher.addEventListener("change", () => {
      const nextPath = getLocalePath(languageSwitcher);
      const locale = nextPath === "/" ? "en" : nextPath.replace(/^\/|\/$/g, "");
      document.cookie = `ce_lang=${encodeURIComponent(locale)}; Max-Age=31536000; Path=/; SameSite=Lax; Secure`;
      window.location.assign(nextPath);
    });
  }

  function getLocalePath(select) {
    const value = select.value;
    const optionExists = Array.from(select.options).some((option) => option.value === value);
    if (!optionExists) return "/";
    return /^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?$/.test(value) ? value : "/";
  }

  function getCurrentLocalePath(select) {
    const path = window.location.pathname;
    const options = Array.from(select.options).map((option) => option.value);
    return options.find((value) => value !== "/" && path === value.slice(0, -1)) ||
      options.find((value) => value !== "/" && path.startsWith(value)) ||
      "/";
  }

  document.querySelectorAll("[data-support-modal-trigger]").forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      if (event instanceof MouseEvent && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)) return;
      event.preventDefault();
      const href = trigger.getAttribute("href") || "";

      if (supportModal && typeof supportModal.showModal === "function" && supportModalContinue) {
        supportModalContinue.setAttribute("href", href);
        supportModal.showModal();
        return;
      }

      if (window.confirm(getSupportModalPlainText())) {
        window.location.href = href;
      }
    });
  });

  supportModalClose?.addEventListener("click", () => {
    closeSupportModal();
  });

  supportModal?.addEventListener("click", (event) => {
    if (event.target === supportModal) closeSupportModal();
  });

  walkthroughClose?.addEventListener("click", () => {
    closeWalkthroughModal();
  });

  walkthroughModal?.addEventListener("click", (event) => {
    if (event.target === walkthroughModal) closeWalkthroughModal();
  });

  walkthroughModal?.addEventListener("close", () => {
    if (walkthroughVideo instanceof HTMLVideoElement) walkthroughVideo.pause();
    clearWalkthroughHash();
  });

  walkthroughModal?.addEventListener("keydown", (event) => {
    handleWalkthroughModalKeydown(event);
  });

  if (walkthroughVideo instanceof HTMLVideoElement) {
    walkthroughVideo.addEventListener("click", () => {
      toggleWalkthroughPlayback();
    });
    walkthroughVideo.addEventListener("durationchange", updateWalkthroughTimeBadge);
    walkthroughVideo.addEventListener("loadedmetadata", updateWalkthroughTimeBadge);
    walkthroughVideo.addEventListener("timeupdate", updateWalkthroughTimeBadge);
  }

  setupStoreVersionAlertScrollFade();
  void checkStoreVersionStatus();

  if (!installActions || !chromeButton || !firefoxButton) return;

  const isFirefox = navigator.userAgent.toLowerCase().includes("firefox/");
  const primaryButton = isFirefox ? firefoxButton : chromeButton;
  const secondaryButton = isFirefox ? chromeButton : firefoxButton;

  primaryButton.classList.add("button-primary");
  primaryButton.classList.remove("button-secondary");
  secondaryButton.classList.add("button-secondary");
  secondaryButton.classList.remove("button-primary");
  installActions.insertBefore(primaryButton, installActions.firstElementChild);

  async function checkStoreVersionStatus() {
    const alert = document.querySelector("[data-store-version-alert]");
    const message = document.querySelector("[data-store-version-alert-message]");
    if (!alert || !message) return;

    const versions = await fetchPublishedVersions();
    updateVersionBadges(versions);
    const releaseVersion = versions.release;
    if (!releaseVersion) return;

    const pendingStores = [
      ["chrome", versions.chrome],
      ["firefox", versions.firefox]
    ].filter(([, version]) => version && normalizeVersion(version) !== normalizeVersion(releaseVersion));

    if (!pendingStores.length) return;

    const stores = pendingStores.map(([key]) => alert.dataset[`alert${capitalize(key)}`]);
    const storeList = formatStoreList(stores, alert.dataset.alertAnd || "and");
    const bodyTemplate = alert.dataset.alertBody || "{stores} will get the latest version soon.";

    message.textContent = bodyTemplate.replace("{stores}", storeList);
    alert.hidden = false;
  }

  function setupStoreVersionAlertScrollFade() {
    const alert = document.querySelector("[data-store-version-alert]");
    if (!alert) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const progress = Math.min(Math.max(window.scrollY / 80, 0), 1);
      alert.style.setProperty("--store-version-alert-opacity", String(1 - progress));
      alert.style.setProperty("--store-version-alert-offset", `${Math.round(progress * -8)}px`);
      alert.classList.toggle("store-version-alert-faded", progress >= 0.98);
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
  }

  function setupTopHeaderState() {
    const header = document.querySelector(".site-header");
    if (!header) return;

    let frame = 0;
    let topState = header.classList.contains("site-header-top");
    let logoAnimationTimer = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const replayLogoAnimation = () => {
      if (reducedMotion.matches || logoAnimationTimer) return;

      const animatedParts = header.querySelectorAll(".brand-logo-bg, .brand-logo-mark");
      if (!animatedParts.length) return;

      animatedParts.forEach((part) => {
        part.style.animation = "none";
      });
      void header.offsetWidth;
      animatedParts.forEach((part) => {
        part.style.animation = "";
      });
      logoAnimationTimer = window.setTimeout(() => {
        logoAnimationTimer = 0;
      }, 980);
    };
    const update = () => {
      frame = 0;
      const scrollY = window.scrollY;
      const nextTopState = topState ? scrollY < 30 : scrollY < 4;
      if (nextTopState === topState) return;
      topState = nextTopState;
      header.classList.toggle("site-header-top", topState);
      if (topState) replayLogoAnimation();
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
  }

  function setupActiveNavigation() {
    const navLinks = Array.from(document.querySelectorAll(".site-nav a[data-nav-section], .site-nav a[data-nav-page]"));
    if (!navLinks.length) return;

    const setActiveLink = (activeLink, currentValue = "location") => {
      navLinks.forEach((link) => {
        const isActive = link === activeLink;
        link.classList.toggle("site-nav-active", isActive);
        if (isActive) {
          link.setAttribute("aria-current", currentValue);
        } else {
          link.removeAttribute("aria-current");
        }
      });
    };

    const blogLink = navLinks.find((link) => link.dataset.navPage === "blog");
    if (/\/blog(?:\/|$)/.test(window.location.pathname)) {
      setActiveLink(blogLink, "page");
      return;
    }

    const sectionLinks = navLinks.filter((link) => link.dataset.navSection);
    const sectionEntries = sectionLinks
      .map((link) => ({ link, section: document.getElementById(link.dataset.navSection || "") }))
      .filter((entry) => entry.section);
    if (!sectionEntries.length) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const probeLine = window.innerHeight * 0.42;
      const activeEntry = sectionEntries.find((entry) => {
        const rect = entry.section.getBoundingClientRect();
        return rect.top <= probeLine && rect.bottom > probeLine;
      });
      setActiveLink(activeEntry?.link || null);
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
  }

  function setupContactEmailLinks() {
    const supportEmail = docsConfig.supportEmail;
    if (typeof supportEmail !== "string" || !supportEmail.trim()) return;

    const email = supportEmail.trim();
    const href = `mailto:${email}`;
    document.querySelectorAll("[data-contact-email-address]").forEach((link) => {
      link.textContent = email;
      link.setAttribute("href", href);
    });
    document.querySelectorAll("[data-contact-email-link]").forEach((link) => {
      link.setAttribute("href", href);
    });
  }

  function formatStoreList(stores, conjunction) {
    if (stores.length <= 2) return stores.join(` ${conjunction} `);
    return `${stores.slice(0, -1).join(", ")} ${conjunction} ${stores.at(-1)}`;
  }

  function getSupportModalPlainText() {
    const title = document.querySelector("#support-modal-title")?.textContent?.trim();
    const body = supportModal?.querySelector("p")?.textContent?.trim();
    const details = Array.from(supportModal?.querySelectorAll("li") || [])
      .map((item) => item.textContent?.trim())
      .filter(Boolean)
      .map((item) => `- ${item}`);
    return [title, body, details.join("\n")].filter(Boolean).join("\n\n");
  }

  function closeSupportModal() {
    if (supportModal && typeof supportModal.close === "function") supportModal.close();
  }

  function setupWalkthroughVideoModal() {
    const walkthroughPath = docsConfig.walkthrough;
    if (
      !walkthroughCtas.length ||
      !walkthroughOpenButtons.length ||
      !walkthroughModal ||
      !(walkthroughVideo instanceof HTMLVideoElement) ||
      typeof walkthroughPath !== "string" ||
      !walkthroughPath
    ) {
      return;
    }

    const videoUrl = new URL(walkthroughPath, window.location.href);
    walkthroughVideo.src = videoUrl.href;
    walkthroughVideo.load();
    preloadWalkthroughVideo(videoUrl);
    updateWalkthroughTimeBadge();
    walkthroughCtas.forEach((cta) => {
      cta.hidden = false;
    });

    walkthroughOpenButtons.forEach((button) => {
      button.addEventListener("click", () => {
        openWalkthroughModal(videoUrl, { updateHash: true });
      });
    });

    window.addEventListener("hashchange", () => {
      if (isWalkthroughHash()) {
        openWalkthroughModal(videoUrl, { allowMutedFallback: true });
        return;
      }

      if (walkthroughModal?.open) {
        closeWalkthroughModal({ clearHash: false });
      }
    });

    if (isWalkthroughHash()) {
      window.requestAnimationFrame(() => {
        openWalkthroughModal(videoUrl, { allowMutedFallback: true });
      });
    }
  }

  function openWalkthroughModal(videoUrl, options = {}) {
    if (!(walkthroughVideo instanceof HTMLVideoElement)) return;

    if (options.updateHash && !isWalkthroughHash()) {
      history.pushState(null, "", walkthroughHash);
    }

    walkthroughVideo.currentTime = 0;
    updateWalkthroughTimeBadge();
    hideWalkthroughPlaybackFeedback();
    if (walkthroughModal && typeof walkthroughModal.showModal === "function") {
      if (walkthroughModal.open) {
        startWalkthroughPlayback({ allowMutedFallback: options.allowMutedFallback === true });
        return;
      }
      walkthroughModal.showModal();
      walkthroughVideo.focus();
      startWalkthroughPlayback({ allowMutedFallback: options.allowMutedFallback === true });
      return;
    }

    window.open(videoUrl.href, "_blank", "noopener");
  }

  function preloadWalkthroughVideo(videoUrl) {
    if (document.querySelector('link[data-walkthrough-video-preload]')) return;

    const preload = document.createElement("link");
    preload.rel = "preload";
    preload.as = "video";
    preload.href = videoUrl.href;
    preload.type = "video/mp4";
    preload.dataset.walkthroughVideoPreload = "";
    document.head.append(preload);
  }

  function startWalkthroughPlayback(options = {}) {
    if (!(walkthroughVideo instanceof HTMLVideoElement)) return;

    walkthroughVideo.volume = 1;
    walkthroughVideo.muted = false;
    void walkthroughVideo.play().catch(() => {
      if (!options.allowMutedFallback) return;

      walkthroughVideo.muted = true;
      void walkthroughVideo.play().catch(() => undefined);
    });
  }

  function closeWalkthroughModal(options = {}) {
    if (walkthroughVideo instanceof HTMLVideoElement) walkthroughVideo.pause();
    hideWalkthroughPlaybackFeedback();
    if (walkthroughModal && typeof walkthroughModal.close === "function") walkthroughModal.close();
    if (options.clearHash !== false) clearWalkthroughHash();
  }

  function isWalkthroughHash() {
    return window.location.hash.toLowerCase() === walkthroughHash;
  }

  function clearWalkthroughHash() {
    if (!isWalkthroughHash()) return;
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }

  function handleWalkthroughModalKeydown(event) {
    if (!(walkthroughVideo instanceof HTMLVideoElement)) return;
    if (!walkthroughModal || !walkthroughModal.open) return;
    if (event.key === " " || event.key === "Spacebar" || event.code === "Space") {
      if (event.target instanceof Element && event.target.closest("button, a, input, select, textarea, [role='button']")) return;
      event.preventDefault();
      toggleWalkthroughPlayback();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();
    const duration = Number.isFinite(walkthroughVideo.duration) ? walkthroughVideo.duration : 0;
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextTime = walkthroughVideo.currentTime + direction * 5;
    walkthroughVideo.currentTime = Math.max(0, duration ? Math.min(duration, nextTime) : nextTime);
    updateWalkthroughTimeBadge();
  }

  function toggleWalkthroughPlayback() {
    if (!(walkthroughVideo instanceof HTMLVideoElement)) return;

    if (walkthroughVideo.paused) {
      walkthroughVideo.volume = 1;
      walkthroughVideo.muted = false;
      void walkthroughVideo.play().then(() => {
        showWalkthroughPlaybackFeedback("play");
      }).catch(() => undefined);
      return;
    }

    walkthroughVideo.pause();
    showWalkthroughPlaybackFeedback("pause");
  }

  function showWalkthroughPlaybackFeedback(state) {
    if (!(walkthroughVideoFeedback instanceof HTMLElement)) return;

    window.clearTimeout(walkthroughFeedbackTimer);
    walkthroughVideoFeedback.dataset.state = state;
    walkthroughVideoFeedback.classList.remove("is-visible");
    void walkthroughVideoFeedback.offsetWidth;
    walkthroughVideoFeedback.classList.add("is-visible");
    walkthroughFeedbackTimer = window.setTimeout(() => {
      hideWalkthroughPlaybackFeedback();
    }, 760);
  }

  function hideWalkthroughPlaybackFeedback() {
    if (walkthroughFeedbackTimer) {
      window.clearTimeout(walkthroughFeedbackTimer);
      walkthroughFeedbackTimer = 0;
    }
    if (walkthroughVideoFeedback instanceof HTMLElement) {
      walkthroughVideoFeedback.classList.remove("is-visible");
    }
  }

  function updateWalkthroughTimeBadge() {
    if (!(walkthroughTime instanceof HTMLElement)) return;
    if (!(walkthroughVideo instanceof HTMLVideoElement)) {
      walkthroughTime.textContent = "0:00 / 0:00";
      return;
    }

    walkthroughTime.textContent = `${formatWalkthroughTime(walkthroughVideo.currentTime)} / ${formatWalkthroughTime(walkthroughVideo.duration)}`;
  }

  function formatWalkthroughTime(value) {
    if (!Number.isFinite(value) || value < 0) return "0:00";

    const totalSeconds = Math.floor(value);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  async function fetchPublishedVersions() {
    const entries = await Promise.all(
      Object.entries(versionBadgeSources).map(async ([key, source]) => [key, await fetchShieldMessage(source.json)])
    );
    return Object.fromEntries(entries);
  }

  function updateVersionBadges(versions) {
    const releaseVersion = versions.release;
    setVersionBadgeColor("release", versionBadgeColors.current);

    for (const key of ["chrome", "firefox"]) {
      const storeVersion = versions[key];
      const color = releaseVersion && storeVersion
        ? normalizeVersion(storeVersion) === normalizeVersion(releaseVersion)
          ? versionBadgeColors.current
          : versionBadgeColors.pending
        : versionBadgeColors.unknown;

      setVersionBadgeColor(key, color);
    }
  }

  function setVersionBadgeColor(key, color) {
    const image = document.querySelector(`[data-version-badge="${key}"]`);
    const source = versionBadgeSources[key];
    if (!(image instanceof HTMLImageElement) || !source) return;

    image.src = `${source.image}&color=${encodeURIComponent(color)}`;
  }

  async function fetchShieldMessage(url) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return "";
      const badge = await response.json();
      const message = typeof badge.message === "string" ? badge.message : "";
      return isVersionMessage(message) ? message : "";
    } catch {
      return "";
    }
  }

  function isVersionMessage(value) {
    return /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(String(value).trim());
  }

  function normalizeVersion(version) {
    return String(version).trim().replace(/^v/i, "");
  }

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function readDocsConfig() {
    const configScript = document.querySelector('script[type="application/json"][data-docs-config]');
    if (!(configScript instanceof HTMLScriptElement)) return {};

    try {
      const value = JSON.parse(configScript.textContent || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }
})();
