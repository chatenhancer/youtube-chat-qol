(() => {
  const docsConfig = readDocsConfig();
  const installActions = document.querySelector("[data-install-actions]");
  const storePicker = document.querySelector("[data-browser-store-picker]");
  const primaryStoreLink = document.querySelector("[data-browser-primary-store-link]");
  const storeToggle = document.querySelector("[data-browser-store-toggle]");
  const storeOptions = document.querySelector("[data-browser-store-options]");
  const chromeStoreLink = document.querySelector('[data-browser-store-link="chrome"]');
  const firefoxStoreLink = document.querySelector('[data-browser-store-link="firefox"]');
  const safariStoreLink = document.querySelector('[data-browser-store-link="safari"]');
  const languageSwitcher = document.querySelector("[data-language-switcher]");
  const walkthroughCtas = document.querySelectorAll("[data-walkthrough-cta]");
  const walkthroughOpenButtons = document.querySelectorAll("[data-walkthrough-open]");
  const walkthroughModal = document.querySelector("[data-walkthrough-modal]");
  const walkthroughClose = document.querySelector("[data-walkthrough-close]");
  const walkthroughTime = document.querySelector("[data-walkthrough-time]");
  const walkthroughTimeToggle = document.querySelector("[data-walkthrough-time-toggle]");
  const walkthroughVideo = document.querySelector("[data-walkthrough-video]");
  const walkthroughVideoFeedback = document.querySelector("[data-walkthrough-feedback]");
  const walkthroughKeyPoints = document.querySelector("[data-walkthrough-key-points]");
  const walkthroughKeyPointList = document.querySelector("[data-walkthrough-key-point-list]");
  const walkthroughKeyPointTrack = document.querySelector("[data-walkthrough-key-point-track]");
  const walkthroughSeekButtons = Array.from(document.querySelectorAll("[data-walkthrough-seek]"));
  const walkthroughHash = "#walkthrough";
  const walkthroughCompactKeyPoints = window.matchMedia("(max-width: 640px)");
  const versionBadgeSources = {
    release: {
      image: "https://img.shields.io/github/v/release/chat-enhancer-yt/youtube-chat-qol?label=release&logo=github",
      json: "https://img.shields.io/github/v/release/chat-enhancer-yt/youtube-chat-qol.json?label=release"
    },
    chrome: {
      image: "https://img.shields.io/chrome-web-store/v/pkhaaipeppfpakofgpdpcpkflangpghf?label=chrome%20web%20store&logo=googlechrome",
      json: "https://img.shields.io/chrome-web-store/v/pkhaaipeppfpakofgpdpcpkflangpghf.json?label=chrome%20web%20store"
    },
    firefox: {
      image: "https://img.shields.io/amo/v/chat-enhancer-for-youtube?label=firefox%20add-ons&logo=firefoxbrowser",
      json: "https://img.shields.io/amo/v/chat-enhancer-for-youtube.json?label=firefox%20add-ons"
    },
    safari: {
      image: "https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fitunes.apple.com%2Flookup%3Fid%3D6783276323%26country%3Dus&query=%24.results%5B0%5D.version&label=mac%20app%20store&logo=apple&cacheSeconds=300",
      json: "https://img.shields.io/badge/dynamic/json.json?url=https%3A%2F%2Fitunes.apple.com%2Flookup%3Fid%3D6783276323%26country%3Dus&query=%24.results%5B0%5D.version&label=mac%20app%20store&cacheSeconds=300",
      // Apple's public lookup can lag behind App Store Connect after approval.
      // Keep the badge informational instead of treating a stale result as pending.
      showPendingState: false
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
  setupCommandDemo();
  setupWalkthroughVideoModal();

  if (languageSwitcher) {
    languageSwitcher.value = getCurrentLocalePath(languageSwitcher);
    languageSwitcher.addEventListener("change", () => {
      const nextPath = getLocalePath(languageSwitcher);
      const locale = languageSwitcher.selectedOptions[0]?.dataset.locale || (nextPath === "/" ? "en" : nextPath.split("/").filter(Boolean)[0]);
      document.cookie = `ce_lang=${encodeURIComponent(locale)}; Max-Age=31536000; Path=/; SameSite=Lax; Secure`;
      window.location.assign(nextPath);
    });
  }

  function getLocalePath(select) {
    const value = select.value;
    const optionExists = Array.from(select.options).some((option) => option.value === value);
    if (!optionExists) return "/";
    return value.startsWith("/") && !value.startsWith("//") ? value : "/";
  }

  function getCurrentLocalePath(select) {
    const path = window.location.pathname.endsWith("/") ? window.location.pathname : `${window.location.pathname}/`;
    const options = Array.from(select.options).map((option) => option.value);
    return options.find((value) => path === value) ||
      options.find((value) => value !== "/" && path.startsWith(value)) ||
      "/";
  }

  walkthroughClose?.addEventListener("click", () => {
    closeWalkthroughModal();
  });

  walkthroughTimeToggle?.addEventListener("click", (event) => {
    if (!walkthroughCompactKeyPoints.matches) return;
    event.preventDefault();
    toggleWalkthroughKeyPointPanel();
  });

  walkthroughCompactKeyPoints.addEventListener("change", () => {
    setWalkthroughKeyPointPanelOpen(false);
  });

  setWalkthroughKeyPointPanelOpen(false);

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

  walkthroughSeekButtons.forEach((button) => {
    button.addEventListener("click", () => {
      seekWalkthroughToKeyPoint(button);
    });
  });

  if (walkthroughSeekButtons.length) {
    window.addEventListener("resize", updateWalkthroughKeyPointViewport);
    document.fonts?.ready.then(updateWalkthroughKeyPointViewport).catch(() => undefined);
  }

  setupStoreVersionAlertScrollFade();
  void checkStoreVersionStatus();

  if (
    !installActions ||
    !storePicker ||
    !primaryStoreLink ||
    !storeToggle ||
    !storeOptions ||
    !chromeStoreLink ||
    !firefoxStoreLink ||
    !safariStoreLink
  ) return;

  const userAgent = navigator.userAgent.toLowerCase();
  const isFirefox = userAgent.includes("firefox/");
  const isSafari = userAgent.includes("safari/")
    && !userAgent.includes("chrome/")
    && !userAgent.includes("chromium/")
    && !userAgent.includes("crios/")
    && !userAgent.includes("edg/");
  const primaryStoreKey = isSafari ? "safari" : isFirefox ? "firefox" : "chrome";
  const storeLinks = {
    chrome: chromeStoreLink,
    firefox: firefoxStoreLink,
    safari: safariStoreLink
  };

  Object.entries(storeLinks).forEach(([key, link]) => {
    if (key === primaryStoreKey) {
      link.setAttribute("aria-current", "true");
    } else {
      link.removeAttribute("aria-current");
    }
  });
  const primaryStoreHref = storeLinks[primaryStoreKey]?.getAttribute("href");
  if (primaryStoreHref) primaryStoreLink.setAttribute("href", primaryStoreHref);

  storeToggle.addEventListener("click", () => {
    const isExpanded = storeToggle.getAttribute("aria-expanded") === "true";
    setStoreOptionsExpanded(!isExpanded);
  });

  document.addEventListener("click", (event) => {
    if (storeOptions.hidden || !(event.target instanceof Node) || storePicker.contains(event.target)) return;
    setStoreOptionsExpanded(false);
  });

  function setStoreOptionsExpanded(isExpanded) {
    storeToggle.setAttribute("aria-expanded", String(isExpanded));
    storeOptions.hidden = !isExpanded;
  }

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
      ["firefox", versions.firefox],
      ["safari", versions.safari]
    ].filter(([key, version]) => isPendingStoreVersion(key, releaseVersion, version));

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

  function setupCommandDemo() {
    const demo = document.querySelector("[data-command-demo]");
    if (!demo) return;

    const input = demo.querySelector("[data-command-input]");
    const inputWrap = demo.querySelector("[data-command-input-wrap]");
    const cycleCurrent = demo.querySelector("[data-command-cycle-current]");
    const cycleCurrentText = demo.querySelector("[data-command-cycle-current-text]");
    const cycleNext = demo.querySelector("[data-command-cycle-next]");
    const cycleNextText = demo.querySelector("[data-command-cycle-next-text]");
    const menu = demo.querySelector("[data-command-menu]");
    const options = Array.from(demo.querySelectorAll("[data-command-option]"))
      .filter((option) => option instanceof HTMLElement);

    if (!(input instanceof HTMLInputElement) || !(menu instanceof HTMLElement) || !options.length) return;

    const initialOption = options.find((option) => option.classList.contains("is-active")) || options[0];
    const cycleDelayMs = 3200;
    const cycleAnimationMs = 460;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let isAutoCycling = inputWrap instanceof HTMLElement && cycleCurrent instanceof HTMLElement && cycleCurrentText instanceof HTMLElement && cycleNext instanceof HTMLElement && cycleNextText instanceof HTMLElement;
    let cycleTimer = 0;
    let cycleAnimationTimer = 0;
    let cycleIndex = Math.max(0, options.indexOf(initialOption));
    let activeIndex = -1;
    const optionTemplate = (option) => option?.dataset.commandTemplate || option?.dataset.commandValue || "";
    const optionAfter = (index) => options[(index + 1) % options.length] || options[0];
    const setInputTemplateWidth = (template) => {
      if (!(inputWrap instanceof HTMLElement)) return;
      const width = Math.min(Math.max(template.length + 1, 9), 34);
      inputWrap.style.setProperty("--command-input-text-width", `${width}ch`);
    };
    const visibleOptions = () => options.filter((option) => !option.hidden);
    const setActiveOption = (nextOption) => {
      if (!nextOption) return;
      options.forEach((option) => {
        const isActive = option === nextOption;
        option.classList.toggle("is-active", isActive);
        option.setAttribute("aria-selected", isActive ? "true" : "false");
        option.setAttribute("tabindex", isActive ? "0" : "-1");
      });
      activeIndex = visibleOptions().indexOf(nextOption);
    };
    const updateCycleText = (currentOption) => {
      if (!(cycleCurrentText instanceof HTMLElement) || !(cycleNextText instanceof HTMLElement)) return;
      const currentIndex = Math.max(0, options.indexOf(currentOption));
      const currentTemplate = optionTemplate(currentOption);
      cycleCurrentText.textContent = currentTemplate;
      cycleNextText.textContent = optionTemplate(optionAfter(currentIndex));
      setInputTemplateWidth(currentTemplate);
    };
    const setCycleState = (enabled) => {
      if (!(inputWrap instanceof HTMLElement)) return;
      inputWrap.classList.toggle("is-cycling", enabled);
      if (!enabled) inputWrap.classList.remove("is-sliding");
    };
    const keepOptionVisible = (option) => {
      const optionTop = option.offsetTop;
      const optionBottom = optionTop + option.offsetHeight;
      const menuBottom = menu.scrollTop + menu.clientHeight;

      if (optionTop < menu.scrollTop) {
        menu.scrollTop = optionTop;
      } else if (optionBottom > menuBottom) {
        menu.scrollTop = optionBottom - menu.clientHeight;
      }
    };
    const showOptions = (matches) => {
      const visible = matches.length ? matches : options;
      options.forEach((option) => {
        option.hidden = !visible.includes(option);
      });
      menu.hidden = false;
      setActiveOption(visible.includes(initialOption) ? initialOption : visible[0]);
    };
    const selectCycleOption = (option) => {
      if (!option) return;
      options.forEach((candidate) => {
        candidate.hidden = false;
      });
      menu.hidden = false;
      setActiveOption(option);
      cycleIndex = Math.max(0, options.indexOf(option));
      input.value = optionTemplate(option);
      updateCycleText(option);
    };
    const stopCycleTimers = () => {
      window.clearTimeout(cycleTimer);
      window.clearTimeout(cycleAnimationTimer);
      cycleTimer = 0;
      cycleAnimationTimer = 0;
    };
    const pauseAutoCycle = () => {
      if (!isAutoCycling) return;
      isAutoCycling = false;
      stopCycleTimers();
      setCycleState(false);
      const activeOption = visibleOptions()[activeIndex] || options[cycleIndex] || initialOption;
      cycleIndex = Math.max(0, options.indexOf(activeOption));
      input.value = optionTemplate(activeOption);
      updateCycleText(activeOption);
    };
    const scheduleCycle = () => {
      if (!isAutoCycling || document.hidden) return;
      window.clearTimeout(cycleTimer);
      cycleTimer = window.setTimeout(cycleToNextOption, cycleDelayMs);
    };
    const cycleToOption = (nextOption) => {
      if (!isAutoCycling || !nextOption) return;
      const nextIndex = Math.max(0, options.indexOf(nextOption));
      const completeCycle = () => {
        if (!isAutoCycling) return;
        cycleIndex = nextIndex;
        selectCycleOption(nextOption);
        if (inputWrap instanceof HTMLElement) inputWrap.classList.remove("is-sliding");
        scheduleCycle();
      };

      if (reducedMotion.matches || !(inputWrap instanceof HTMLElement) || !(cycleCurrent instanceof HTMLElement) || !(cycleCurrentText instanceof HTMLElement) || !(cycleNext instanceof HTMLElement) || !(cycleNextText instanceof HTMLElement)) {
        completeCycle();
        return;
      }

      const currentTemplate = optionTemplate(options[cycleIndex] || initialOption);
      const nextTemplate = optionTemplate(nextOption);
      cycleCurrentText.textContent = currentTemplate;
      cycleNextText.textContent = nextTemplate;
      setInputTemplateWidth(currentTemplate.length > nextTemplate.length ? currentTemplate : nextTemplate);
      setActiveOption(nextOption);
      inputWrap.classList.remove("is-sliding");
      void inputWrap.offsetWidth;
      inputWrap.classList.add("is-sliding");
      window.clearTimeout(cycleAnimationTimer);
      cycleAnimationTimer = window.setTimeout(completeCycle, cycleAnimationMs);
    };
    function cycleToNextOption() {
      cycleToOption(optionAfter(cycleIndex));
    }
    const filterMenu = () => {
      const rawQuery = input.value.trim().toLowerCase();
      const query = rawQuery.replace(/^\/+/, "");
      if (!rawQuery) {
        showOptions(options);
        return;
      }

      const matches = options.filter((option) => {
        const search = option.dataset.commandSearch || "";
        const command = option.dataset.commandValue || "";
        const normalizedCommand = command.replace(/^\/+/, "");
        const isCommandMatch = command.startsWith(rawQuery) || normalizedCommand.startsWith(query);
        const isTextMatch = query.length > 1 && (search.includes(rawQuery) || search.includes(query));
        return isCommandMatch || isTextMatch;
      });
      showOptions(matches);
    };
    const applyOption = (option) => {
      if (!option) return;
      const template = option.dataset.commandTemplate || option.dataset.commandValue || "";
      if (template) input.value = template;
      setInputTemplateWidth(template || input.value);
      cycleIndex = Math.max(0, options.indexOf(option));
      updateCycleText(option);
      filterMenu();
      input.focus();
    };
    const moveActiveOption = (direction) => {
      const visible = visibleOptions();
      if (!visible.length) return;
      const currentIndex = activeIndex >= 0 ? activeIndex : 0;
      const nextIndex = (currentIndex + direction + visible.length) % visible.length;
      const nextOption = visible[nextIndex];
      setActiveOption(nextOption);
      keepOptionVisible(nextOption);
    };

    input.addEventListener("input", () => {
      pauseAutoCycle();
      setInputTemplateWidth(input.value);
      filterMenu();
    });
    input.addEventListener("focus", () => {
      pauseAutoCycle();
      filterMenu();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        pauseAutoCycle();
        filterMenu();
        moveActiveOption(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        pauseAutoCycle();
        filterMenu();
        moveActiveOption(-1);
        return;
      }
      if (event.key === "Tab" || event.key === "Enter") {
        const activeOption = visibleOptions()[activeIndex];
        if (activeOption) {
          event.preventDefault();
          applyOption(activeOption);
        }
      }
    });

    options.forEach((option) => {
      option.addEventListener("click", () => {
        pauseAutoCycle();
        applyOption(option);
      });
    });
    selectCycleOption(initialOption);
    setCycleState(isAutoCycling);
    scheduleCycle();

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopCycleTimers();
        return;
      }
      scheduleCycle();
    });
  }

  function formatStoreList(stores, conjunction) {
    if (stores.length <= 2) return stores.join(` ${conjunction} `);
    return `${stores.slice(0, -1).join(", ")} ${conjunction} ${stores.at(-1)}`;
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
    updateWalkthroughKeyPointState();
    setWalkthroughKeyPointPanelOpen(false);
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

  function seekWalkthroughToKeyPoint(button) {
    if (!(button instanceof HTMLElement)) return;
    if (!(walkthroughVideo instanceof HTMLVideoElement)) return;

    const nextTime = Number(button.dataset.walkthroughSeek);
    if (!Number.isFinite(nextTime) || nextTime < 0) return;

    const duration = Number.isFinite(walkthroughVideo.duration) ? walkthroughVideo.duration : 0;
    walkthroughVideo.currentTime = duration
      ? Math.min(duration, nextTime)
      : nextTime;
    updateWalkthroughTimeBadge();
    startWalkthroughPlayback({ allowMutedFallback: true });
    setWalkthroughKeyPointPanelOpen(false);
    walkthroughVideo.focus({ preventScroll: true });
  }

  function toggleWalkthroughKeyPointPanel() {
    if (!(walkthroughKeyPoints instanceof HTMLElement)) return;

    setWalkthroughKeyPointPanelOpen(!walkthroughKeyPoints.classList.contains("is-key-points-open"));
  }

  function setWalkthroughKeyPointPanelOpen(isOpen) {
    const isCompact = walkthroughCompactKeyPoints.matches;

    if (walkthroughKeyPoints instanceof HTMLElement) {
      walkthroughKeyPoints.classList.toggle("is-key-points-open", isCompact && isOpen);
    }

    if (walkthroughTimeToggle instanceof HTMLElement) {
      walkthroughTimeToggle.setAttribute("aria-expanded", String(!isCompact || isOpen));
    }
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
      updateWalkthroughKeyPointState();
      return;
    }

    walkthroughTime.textContent = `${formatWalkthroughTime(walkthroughVideo.currentTime)} / ${formatWalkthroughTime(walkthroughVideo.duration)}`;
    updateWalkthroughKeyPointState();
  }

  function updateWalkthroughKeyPointState() {
    if (!walkthroughSeekButtons.length) return;

    const currentTime = walkthroughVideo instanceof HTMLVideoElement && Number.isFinite(walkthroughVideo.currentTime)
      ? walkthroughVideo.currentTime
      : 0;
    const activeButton = walkthroughSeekButtons.reduce((active, button) => {
      if (!(button instanceof HTMLElement)) return active;
      const pointTime = Number(button.dataset.walkthroughSeek);
      if (!Number.isFinite(pointTime)) return active;
      if (pointTime <= currentTime + 0.75) return button;
      return active;
    }, walkthroughSeekButtons[0]);

    walkthroughSeekButtons.forEach((button) => {
      const isActive = button === activeButton;
      button.classList.toggle("is-active", isActive);
      if (isActive) {
        button.setAttribute("aria-current", "true");
      } else {
        button.removeAttribute("aria-current");
      }
    });
    updateWalkthroughKeyPointViewport(activeButton);
  }

  function updateWalkthroughKeyPointViewport(activeButton = document.querySelector(".walkthrough-key-point.is-active")) {
    if (!(walkthroughKeyPointList instanceof HTMLElement)) return;
    if (!(walkthroughKeyPointTrack instanceof HTMLElement)) return;
    if (!(activeButton instanceof HTMLElement)) return;

    const activeIndex = Math.max(0, walkthroughSeekButtons.indexOf(activeButton));
    const lastIndex = Math.max(0, walkthroughSeekButtons.length - 1);
    const windowStartIndex = Math.min(Math.max(activeIndex - 1, 0), Math.max(walkthroughSeekButtons.length - 3, 0));
    const windowEndIndex = Math.min(windowStartIndex + 2, lastIndex);
    const firstVisibleButton = walkthroughSeekButtons[windowStartIndex];
    const lastVisibleButton = walkthroughSeekButtons[windowEndIndex];

    if (!(firstVisibleButton instanceof HTMLElement)) return;
    if (!(lastVisibleButton instanceof HTMLElement)) return;

    const windowOffset = firstVisibleButton.offsetTop;
    const windowHeight = lastVisibleButton.offsetTop + lastVisibleButton.offsetHeight - windowOffset;

    walkthroughKeyPointList.style.setProperty("--walkthrough-window-offset", `${-windowOffset}px`);
    walkthroughKeyPointList.style.setProperty("--walkthrough-visible-list-height", `${windowHeight}px`);
    walkthroughKeyPointList.style.setProperty("--walkthrough-expanded-list-height", `${walkthroughKeyPointTrack.scrollHeight}px`);
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

    for (const key of ["chrome", "firefox", "safari"]) {
      const storeVersion = versions[key];
      const color = getStoreVersionBadgeColor(key, releaseVersion, storeVersion);

      setVersionBadgeColor(key, color);
    }
  }

  function getStoreVersionBadgeColor(key, releaseVersion, storeVersion) {
    if (!releaseVersion || !storeVersion) return versionBadgeColors.unknown;
    if (normalizeVersion(storeVersion) === normalizeVersion(releaseVersion)) {
      return versionBadgeColors.current;
    }
    return shouldShowPendingState(key) ? versionBadgeColors.pending : versionBadgeColors.unknown;
  }

  function isPendingStoreVersion(key, releaseVersion, storeVersion) {
    return shouldShowPendingState(key)
      && Boolean(storeVersion)
      && normalizeVersion(storeVersion) !== normalizeVersion(releaseVersion);
  }

  function shouldShowPendingState(key) {
    return versionBadgeSources[key]?.showPendingState !== false;
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
