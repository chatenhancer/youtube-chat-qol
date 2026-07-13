(() => {
  const docsConfig = readDocsConfig();
  const installActions = document.querySelector("[data-install-actions]");
  const storePicker = document.querySelector("[data-browser-store-picker]");
  const primaryStoreLink = document.querySelector("[data-browser-primary-store-link]");
  const primaryStoreIcon = document.querySelector("[data-browser-primary-store-icon]");
  const primaryStoreLabel = document.querySelector("[data-browser-primary-store-label]");
  const storeToggle = document.querySelector("[data-browser-store-toggle]");
  const storeOptions = document.querySelector("[data-browser-store-options]");
  const chromeStoreLink = document.querySelector('[data-browser-store-link="chrome"]');
  const firefoxStoreLink = document.querySelector('[data-browser-store-link="firefox"]');
  const safariStoreLink = document.querySelector('[data-browser-store-link="safari"]');
  const languageSwitchers = document.querySelectorAll("[data-language-switcher]");
  const mobileHeaderMenu = document.querySelector("[data-mobile-header-menu]");
  const walkthroughCtas = document.querySelectorAll("[data-walkthrough-cta]");
  const walkthroughOpenButtons = document.querySelectorAll("[data-walkthrough-open]");
  const walkthroughModal = document.querySelector("[data-walkthrough-modal]");
  const walkthroughClose = document.querySelector("[data-walkthrough-close]");
  const walkthroughTime = document.querySelector("[data-walkthrough-time]");
  const walkthroughTimeLabel = document.querySelector("[data-walkthrough-time-label]");
  const walkthroughTimeToggle = document.querySelector("[data-walkthrough-time-toggle]");
  const walkthroughVideo = document.querySelector("[data-walkthrough-video]");
  const walkthroughVideoFeedback = document.querySelector("[data-walkthrough-feedback]");
  const walkthroughKeyPoints = document.querySelector("[data-walkthrough-key-points]");
  const walkthroughKeyPointList = document.querySelector("[data-walkthrough-key-point-list]");
  const walkthroughKeyPointTrack = document.querySelector("[data-walkthrough-key-point-track]");
  const walkthroughSeekButtons = Array.from(document.querySelectorAll("[data-walkthrough-seek]"));
  const heroBlogTicker = document.querySelector("[data-hero-blog-ticker]");
  const walkthroughHash = "#walkthrough";
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
  setupLanguageSwitchers();
  setupMobileHeaderMenu();
  setupContactEmailLinks();
  setupCommandDemo();
  setupHeroBlogTicker();
  setupWalkthroughVideoModal();

  function setupHeroBlogTicker() {
    if (!(heroBlogTicker instanceof HTMLElement)) return;

    const slides = Array.from(heroBlogTicker.querySelectorAll("[data-hero-blog-slide]"))
      .filter((slide) => slide instanceof HTMLAnchorElement);
    const newPostBadges = Array.from(heroBlogTicker.querySelectorAll("[data-hero-blog-new]"))
      .filter((badge) => badge instanceof HTMLElement);
    let newBadgeTimer = 0;

    updateNewPostBadges();
    scheduleNewPostBadgeRefresh();
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      updateNewPostBadges();
      scheduleNewPostBadgeRefresh();
    });

    if (slides.length < 2) return;

    const previousButton = heroBlogTicker.querySelector("[data-hero-blog-previous]");
    const nextButton = heroBlogTicker.querySelector("[data-hero-blog-next]");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const configuredInterval = Number(heroBlogTicker.dataset.heroBlogTickerInterval);
    const interval = Number.isFinite(configuredInterval) && configuredInterval >= 3000 ? configuredInterval : 6000;
    let activeIndex = Math.max(0, slides.findIndex((slide) => slide.classList.contains("is-active")));
    let timer = 0;
    let slideAnimationTimer = 0;
    let isPaused = false;

    setActiveSlide(activeIndex);
    scheduleNextSlide();

    previousButton?.addEventListener("click", () => showAdjacentSlide(-1));
    nextButton?.addEventListener("click", () => showAdjacentSlide(1));
    heroBlogTicker.addEventListener("pointerenter", pauseTicker);
    heroBlogTicker.addEventListener("pointerleave", resumeTicker);
    heroBlogTicker.addEventListener("focusin", pauseTicker);
    heroBlogTicker.addEventListener("focusout", (event) => {
      if (event.relatedTarget instanceof Node && heroBlogTicker.contains(event.relatedTarget)) return;
      resumeTicker();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        clearTickerTimer();
      } else {
        scheduleNextSlide();
      }
    });
    reducedMotion.addEventListener("change", scheduleNextSlide);

    function setActiveSlide(nextIndex, direction = 0) {
      const previousIndex = activeIndex;
      const shouldAnimate = direction !== 0 && previousIndex !== nextIndex && !reducedMotion.matches;
      clearSlideAnimation();
      activeIndex = nextIndex;
      slides.forEach((slide, index) => {
        const isActive = index === activeIndex;
        slide.classList.toggle("is-active", isActive);
        slide.setAttribute("aria-hidden", String(!isActive));
        slide.tabIndex = isActive ? 0 : -1;
      });

      if (!shouldAnimate) return;

      const previousSlide = slides[previousIndex];
      const nextSlide = slides[activeIndex];
      heroBlogTicker.classList.toggle("is-moving-next", direction > 0);
      heroBlogTicker.classList.toggle("is-moving-previous", direction < 0);
      previousSlide?.classList.add("is-leaving");
      nextSlide?.classList.add("is-entering");
      slideAnimationTimer = window.setTimeout(clearSlideAnimation, 520);
    }

    function scheduleNextSlide() {
      clearTickerTimer();
      if (isPaused || document.hidden || reducedMotion.matches) return;

      timer = window.setTimeout(() => {
        setActiveSlide((activeIndex + 1) % slides.length, 1);
        scheduleNextSlide();
      }, interval);
    }

    function showAdjacentSlide(direction) {
      setActiveSlide((activeIndex + direction + slides.length) % slides.length, direction);
      scheduleNextSlide();
    }

    function clearSlideAnimation() {
      if (slideAnimationTimer) window.clearTimeout(slideAnimationTimer);
      slideAnimationTimer = 0;
      heroBlogTicker.classList.remove("is-moving-next", "is-moving-previous");
      slides.forEach((slide) => slide.classList.remove("is-entering", "is-leaving"));
    }

    function pauseTicker() {
      isPaused = true;
      clearTickerTimer();
    }

    function resumeTicker() {
      isPaused = false;
      scheduleNextSlide();
    }

    function clearTickerTimer() {
      if (!timer) return;
      window.clearTimeout(timer);
      timer = 0;
    }

    function updateNewPostBadges() {
      const now = new Date();
      const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      const dayInMilliseconds = 24 * 60 * 60 * 1000;

      newPostBadges.forEach((badge) => {
        const [year, month, day] = String(badge.dataset.heroBlogPostDate || "").split("-").map(Number);
        const postDate = Date.UTC(year, month - 1, day);
        const ageInDays = (today - postDate) / dayInMilliseconds;
        badge.hidden = !Number.isInteger(ageInDays) || ageInDays < 0 || ageInDays >= 3;
      });
    }

    function scheduleNewPostBadgeRefresh() {
      if (newBadgeTimer) window.clearTimeout(newBadgeTimer);

      const now = new Date();
      const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      newBadgeTimer = window.setTimeout(() => {
        updateNewPostBadges();
        scheduleNewPostBadgeRefresh();
      }, nextDay.getTime() - now.getTime() + 1000);
    }
  }

  function setupLanguageSwitchers() {
    languageSwitchers.forEach((languageSwitcher) => {
      if (!(languageSwitcher instanceof HTMLSelectElement)) return;

      languageSwitcher.value = getCurrentLocalePath(languageSwitcher);
      languageSwitcher.addEventListener("change", () => {
        const nextPath = getLocalePath(languageSwitcher);
        const locale = languageSwitcher.selectedOptions[0]?.dataset.locale || (nextPath === "/" ? "en" : nextPath.split("/").filter(Boolean)[0]);
        document.cookie = `ce_lang=${encodeURIComponent(locale)}; Max-Age=31536000; Path=/; SameSite=Lax; Secure`;
        window.location.assign(nextPath);
      });
    });
  }

  function setupMobileHeaderMenu() {
    if (!(mobileHeaderMenu instanceof HTMLDetailsElement)) return;

    mobileHeaderMenu.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest("a")) mobileHeaderMenu.open = false;
    });

    mobileHeaderMenu.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !mobileHeaderMenu.open) return;

      event.preventDefault();
      mobileHeaderMenu.open = false;
      mobileHeaderMenu.querySelector("summary")?.focus();
    });

    document.addEventListener("click", (event) => {
      if (!mobileHeaderMenu.open || !(event.target instanceof Node) || mobileHeaderMenu.contains(event.target)) return;
      mobileHeaderMenu.open = false;
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
    event.preventDefault();
    toggleWalkthroughKeyPointPanel();
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
    !primaryStoreIcon ||
    !primaryStoreLabel ||
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
  const primaryStoreIconSrc = storeLinks[primaryStoreKey]?.dataset.browserStorePrimaryIcon;
  if (primaryStoreIconSrc) primaryStoreIcon.setAttribute("src", primaryStoreIconSrc);
  primaryStoreIcon.classList.toggle("install-primary-browser-icon-safari", primaryStoreKey === "safari");
  const primaryStoreBrowser = storeLinks[primaryStoreKey]?.dataset.browserStoreLabel;
  const installLabelTemplate = primaryStoreLabel.dataset.installLabelTemplate;
  if (primaryStoreBrowser && installLabelTemplate) {
    primaryStoreLabel.textContent = installLabelTemplate.replace("{browser}", primaryStoreBrowser);
  }

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
    const navLinks = Array.from(document.querySelectorAll(
      ".site-nav a[data-nav-section], .site-nav a[data-nav-page], .mobile-header-menu-nav a[data-nav-section], .mobile-header-menu-nav a[data-nav-page]"
    ));
    if (!navLinks.length) return;

    const desktopNav = document.querySelector(".site-nav");
    const desktopNavLinks = desktopNav instanceof HTMLElement
      ? Array.from(desktopNav.querySelectorAll("a")).filter((link) => link instanceof HTMLElement)
      : [];
    let hoveredDesktopNavLink = null;

    const getActiveDesktopNavLink = () => desktopNavLinks.find((link) => link.classList.contains("site-nav-active")) || null;

    const setDesktopNavHighlight = (link) => {
      if (!(desktopNav instanceof HTMLElement)) return;

      if (!(link instanceof HTMLElement) || !desktopNav.offsetParent) {
        desktopNav.style.setProperty("--site-nav-highlight-opacity", "0");
        return;
      }

      const navRect = desktopNav.getBoundingClientRect();
      const linkRect = link.getBoundingClientRect();
      desktopNav.style.setProperty("--site-nav-highlight-x", `${Math.round(linkRect.left - navRect.left)}px`);
      desktopNav.style.setProperty("--site-nav-highlight-width", `${Math.round(linkRect.width)}px`);
      desktopNav.style.setProperty("--site-nav-highlight-height", `${Math.round(linkRect.height)}px`);
      desktopNav.style.setProperty("--site-nav-highlight-opacity", "1");
    };

    const syncDesktopNavHighlight = () => {
      setDesktopNavHighlight(hoveredDesktopNavLink || getActiveDesktopNavLink());
    };

    if (desktopNav instanceof HTMLElement && desktopNavLinks.length) {
      desktopNavLinks.forEach((link) => {
        link.addEventListener("pointerenter", () => {
          hoveredDesktopNavLink = link;
          syncDesktopNavHighlight();
        });

        link.addEventListener("focus", () => {
          hoveredDesktopNavLink = link;
          syncDesktopNavHighlight();
        });
      });

      desktopNav.addEventListener("pointerleave", () => {
        hoveredDesktopNavLink = null;
        syncDesktopNavHighlight();
      });

      desktopNav.addEventListener("focusout", (event) => {
        if (event.relatedTarget instanceof Node && desktopNav.contains(event.relatedTarget)) return;

        hoveredDesktopNavLink = null;
        syncDesktopNavHighlight();
      });

      window.addEventListener("resize", syncDesktopNavHighlight);
      document.fonts?.ready.then(syncDesktopNavHighlight).catch(() => undefined);
    }

    const setActiveLink = (activeLink, currentValue = "location") => {
      const activeSection = activeLink?.dataset.navSection;
      const activePage = activeLink?.dataset.navPage;
      navLinks.forEach((link) => {
        const isActive = Boolean(
          (activeSection && link.dataset.navSection === activeSection) ||
          (activePage && link.dataset.navPage === activePage)
        );
        link.classList.toggle("site-nav-active", isActive);
        if (isActive) {
          link.setAttribute("aria-current", currentValue);
        } else {
          link.removeAttribute("aria-current");
        }
      });
      syncDesktopNavHighlight();
    };

    const blogLink = navLinks.find((link) => link.dataset.navPage === "blog");
    if (/\/blog(?:\/|$)/.test(window.location.pathname)) {
      setActiveLink(blogLink, "page");
      return;
    }

    const playgroundLink = navLinks.find((link) => link.dataset.navPage === "playground");
    if (/\/playground(?:\/|$)/.test(window.location.pathname)) {
      setActiveLink(playgroundLink, "page");
      return;
    }

    const seenSectionIds = new Set();
    const sectionEntries = navLinks
      .map((link) => {
        const sectionId = link.dataset.navSection;
        if (!sectionId || seenSectionIds.has(sectionId)) return null;

        seenSectionIds.add(sectionId);
        return { link, section: document.getElementById(sectionId) };
      })
      .filter((entry) => entry?.section);
    if (!sectionEntries.length) return;

    const sectionEntriesById = new Map(sectionEntries.map((entry) => [entry.section.id, entry]));
    let pendingSectionId = null;
    let pendingSectionTimer = 0;
    let frame = 0;
    const clearPendingSection = () => {
      pendingSectionId = null;
      if (pendingSectionTimer) {
        window.clearTimeout(pendingSectionTimer);
        pendingSectionTimer = 0;
      }
    };
    const getScrollActiveEntry = () => {
      const probeLine = window.innerHeight * 0.42;
      return sectionEntries.reduce((currentEntry, entry) => {
        const rect = entry.section.getBoundingClientRect();
        return rect.top <= probeLine ? entry : currentEntry;
      }, null);
    };
    const update = () => {
      frame = 0;
      const activeEntry = getScrollActiveEntry();
      if (pendingSectionId) {
        const pendingEntry = sectionEntriesById.get(pendingSectionId);
        if (pendingEntry) {
          setActiveLink(pendingEntry.link);
          if (activeEntry?.section.id === pendingSectionId) {
            clearPendingSection();
          }
          return;
        }
        clearPendingSection();
      }
      setActiveLink(activeEntry?.link || null);
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };
    const setPendingSection = (sectionId) => {
      clearPendingSection();
      pendingSectionId = sectionId;
      pendingSectionTimer = window.setTimeout(() => {
        clearPendingSection();
        schedule();
      }, 2400);
    };

    navLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        const sectionId = link.dataset.navSection;
        if (!sectionId || !sectionEntriesById.has(sectionId)) return;

        setPendingSection(sectionId);
        setActiveLink(link);
      });
    });

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
    const interactionIdleMs = 5000;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const canAutoCycle = inputWrap instanceof HTMLElement && cycleCurrent instanceof HTMLElement && cycleCurrentText instanceof HTMLElement && cycleNext instanceof HTMLElement && cycleNextText instanceof HTMLElement;
    let isAutoCycling = canAutoCycle;
    let isManuallyScrollingMenu = false;
    let cycleTimer = 0;
    let cycleAnimationTimer = 0;
    let interactionTimer = 0;
    let cycleIndex = Math.max(0, options.indexOf(initialOption));
    const optionTemplate = (option) => option?.dataset.commandTemplate || option?.dataset.commandValue || "";
    const optionAfter = (index) => options[(index + 1) % options.length] || options[0];
    const setInputTemplateWidth = (template) => {
      if (!(inputWrap instanceof HTMLElement)) return;
      const width = Math.min(Math.max(template.length + 1, 9), 34);
      inputWrap.style.setProperty("--command-input-text-width", `${width}ch`);
    };
    const setActiveOption = (nextOption) => {
      if (!nextOption) return;
      options.forEach((option) => {
        const isActive = option === nextOption;
        option.classList.toggle("is-active", isActive);
        option.setAttribute("aria-selected", isActive ? "true" : "false");
        option.setAttribute("tabindex", isActive ? "0" : "-1");
      });
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
      if (isManuallyScrollingMenu) return;

      const optionRect = option.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const menuTop = menuRect.top + menu.clientTop + 1;
      const menuBottom = menuRect.top + menu.clientTop + menu.clientHeight - 1;
      let nextScrollTop = menu.scrollTop;

      if (optionRect.top < menuTop) {
        nextScrollTop -= menuTop - optionRect.top;
      } else if (optionRect.bottom > menuBottom) {
        nextScrollTop += optionRect.bottom - menuBottom;
      } else {
        return;
      }

      menu.scrollTo({
        top: nextScrollTop,
        behavior: reducedMotion.matches ? "auto" : "smooth"
      });
    };
    const selectCycleOption = (option) => {
      if (!option) return;
      setActiveOption(option);
      keepOptionVisible(option);
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
      if (inputWrap instanceof HTMLElement) inputWrap.classList.remove("is-sliding");
      setCycleState(canAutoCycle);
      const activeOption = options.find((option) => option.classList.contains("is-active")) || options[cycleIndex] || initialOption;
      cycleIndex = Math.max(0, options.indexOf(activeOption));
      input.value = optionTemplate(activeOption);
      updateCycleText(activeOption);
    };
    const resumeAutoCycle = () => {
      if (!canAutoCycle || isAutoCycling) return;
      isManuallyScrollingMenu = false;
      isAutoCycling = true;
      selectCycleOption(options[cycleIndex] || initialOption);
      setCycleState(true);
      if (!document.hidden) cycleToNextOption();
    };
    const scheduleAutoCycleResume = () => {
      window.clearTimeout(interactionTimer);
      interactionTimer = window.setTimeout(() => {
        interactionTimer = 0;
        resumeAutoCycle();
      }, interactionIdleMs);
    };
    const noteManualMenuScroll = () => {
      isManuallyScrollingMenu = true;
      pauseAutoCycle();
      scheduleAutoCycleResume();
    };
    const scheduleCycle = () => {
      if (!isAutoCycling || document.hidden) return;
      window.clearTimeout(cycleTimer);
      cycleTimer = window.setTimeout(cycleToNextOption, cycleDelayMs);
    };
    const cycleToOption = (nextOption, { automatic = true } = {}) => {
      if (!nextOption || (automatic && !isAutoCycling)) return;
      const nextIndex = Math.max(0, options.indexOf(nextOption));
      const completeCycle = () => {
        if (automatic && !isAutoCycling) return;
        cycleIndex = nextIndex;
        selectCycleOption(nextOption);
        if (inputWrap instanceof HTMLElement) inputWrap.classList.remove("is-sliding");
        if (automatic) {
          scheduleCycle();
        } else {
          setCycleState(canAutoCycle);
        }
      };

      if (reducedMotion.matches || !(inputWrap instanceof HTMLElement) || !(cycleCurrent instanceof HTMLElement) || !(cycleCurrentText instanceof HTMLElement) || !(cycleNext instanceof HTMLElement) || !(cycleNextText instanceof HTMLElement)) {
        completeCycle();
        return;
      }

      const currentTemplate = optionTemplate(options[cycleIndex] || initialOption);
      const nextTemplate = optionTemplate(nextOption);
      if (!automatic) setCycleState(true);
      cycleCurrentText.textContent = currentTemplate;
      cycleNextText.textContent = nextTemplate;
      setInputTemplateWidth(currentTemplate.length > nextTemplate.length ? currentTemplate : nextTemplate);
      setActiveOption(nextOption);
      keepOptionVisible(nextOption);
      inputWrap.classList.remove("is-sliding");
      void inputWrap.offsetWidth;
      inputWrap.classList.add("is-sliding");
      window.clearTimeout(cycleAnimationTimer);
      cycleAnimationTimer = window.setTimeout(completeCycle, cycleAnimationMs);
    };
    function cycleToNextOption() {
      cycleToOption(optionAfter(cycleIndex));
    }
    options.forEach((option) => {
      option.addEventListener("click", () => {
        pauseAutoCycle();
        cycleToOption(option, { automatic: false });
        scheduleAutoCycleResume();
      });
    });
    menu.addEventListener("wheel", noteManualMenuScroll, { passive: true });
    menu.addEventListener("touchmove", noteManualMenuScroll, { passive: true });
    menu.addEventListener("pointerdown", (event) => {
      if (event.target === menu) noteManualMenuScroll();
    });
    menu.addEventListener("keydown", (event) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) {
        noteManualMenuScroll();
      }
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
      window.requestAnimationFrame(() => updateWalkthroughKeyPointViewport());
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
    walkthroughVideo.focus({ preventScroll: true });
  }

  function toggleWalkthroughKeyPointPanel() {
    if (!(walkthroughKeyPoints instanceof HTMLElement)) return;

    setWalkthroughKeyPointPanelOpen(!walkthroughKeyPoints.classList.contains("is-key-points-open"));
  }

  function setWalkthroughKeyPointPanelOpen(isOpen) {
    if (walkthroughKeyPoints instanceof HTMLElement) {
      walkthroughKeyPoints.classList.toggle("is-key-points-open", isOpen);
    }

    if (walkthroughTimeToggle instanceof HTMLElement) {
      walkthroughTimeToggle.setAttribute("aria-expanded", String(isOpen));
    }

    window.requestAnimationFrame(() => updateWalkthroughKeyPointViewport());
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
    const updateTimeText = (text) => {
      if (walkthroughTimeLabel instanceof HTMLElement) {
        walkthroughTimeLabel.textContent = text;
        return;
      }

      if (walkthroughTime instanceof HTMLElement) walkthroughTime.textContent = text;
    };

    if (!(walkthroughTime instanceof HTMLElement)) return;
    if (!(walkthroughVideo instanceof HTMLVideoElement)) {
      updateTimeText("0:00 / 0:00");
      updateWalkthroughKeyPointState();
      return;
    }

    updateTimeText(`${formatWalkthroughTime(walkthroughVideo.currentTime)} / ${formatWalkthroughTime(walkthroughVideo.duration)}`);
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
    walkthroughKeyPointList.style.setProperty("--walkthrough-scroll-list-max-height", `${getWalkthroughKeyPointListMaxHeight()}px`);
  }

  function getWalkthroughKeyPointListMaxHeight() {
    if (!(walkthroughKeyPoints instanceof HTMLElement)) return 65;
    if (!(walkthroughTimeToggle instanceof HTMLElement)) return 65;
    if (!(walkthroughKeyPointList instanceof HTMLElement)) return 65;
    if (!(walkthroughVideo instanceof HTMLElement)) return 65;

    const videoFrame = walkthroughVideo.closest(".walkthrough-video-frame");
    const keyPointPanel = walkthroughKeyPointList.closest(".walkthrough-key-point-panel");
    if (!(videoFrame instanceof HTMLElement)) return 65;
    if (!(keyPointPanel instanceof HTMLElement)) return 65;

    const videoFrameRect = videoFrame.getBoundingClientRect();
    const keyPointsRect = walkthroughKeyPoints.getBoundingClientRect();
    const timeToggleRect = walkthroughTimeToggle.getBoundingClientRect();
    const panelStyles = window.getComputedStyle(keyPointPanel);
    const panelChrome =
      getCssPixelValue(panelStyles.marginTop) +
      getCssPixelValue(panelStyles.paddingTop) +
      getCssPixelValue(panelStyles.paddingBottom) +
      getCssPixelValue(panelStyles.borderTopWidth) +
      getCssPixelValue(panelStyles.borderBottomWidth);
    const bottomInset = 8;
    const availableHeight = videoFrameRect.bottom - keyPointsRect.top - timeToggleRect.height - panelChrome - bottomInset;

    return Math.max(48, Math.floor(availableHeight));
  }

  function getCssPixelValue(value) {
    const pixels = Number.parseFloat(value);
    return Number.isFinite(pixels) ? pixels : 0;
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
