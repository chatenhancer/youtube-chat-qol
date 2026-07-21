(() => {
  const clipTriggers = Array.from(document.querySelectorAll("[data-walkthrough-clip-open]"));
  const clipModal = document.querySelector("[data-walkthrough-clip-modal]");
  const clipTitle = clipModal?.querySelector("[data-walkthrough-clip-title]");
  const clipVideo = document.querySelector("[data-walkthrough-clip-video]");
  const clipFrame = document.querySelector("[data-walkthrough-clip-frame]");
  const clipModalPanel = document.querySelector("[data-walkthrough-clip-modal-panel]");
  const clipPreview = document.querySelector("[data-walkthrough-clip-preview]");
  const walkthroughPath = readDocsConfig().walkthrough;

  if (
    !clipTriggers.length ||
    !clipModal ||
    !(clipVideo instanceof HTMLVideoElement) ||
    typeof walkthroughPath !== "string" ||
    !walkthroughPath
  ) {
    return;
  }

  const clips = new Map(
    clipTriggers
      .map((trigger) => [trigger, readClip(trigger)])
      .filter((entry) => entry[1] !== null)
  );
  if (!clips.size) return;

  const clipsByHash = new Map();
  const videoUrl = new URL(walkthroughPath, window.location.href);
  const hoverPreviewQuery = typeof window.matchMedia === "function"
    ? window.matchMedia("(hover: hover) and (pointer: fine)")
    : null;
  const reducedMotionQuery = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  const canPreviewOnHover = (
    clipFrame instanceof HTMLElement &&
    clipModalPanel instanceof HTMLElement &&
    clipPreview instanceof HTMLElement &&
    hoverPreviewQuery?.matches === true
  );
  let activeClip = null;
  let clearHashOnModalClose = true;
  let hoveredTrigger = null;
  let loopFrame = 0;
  let pendingStartTime = null;
  let previewTimer = 0;
  let previewTrigger = null;

  clips.forEach((clip, trigger) => {
    if (!clipsByHash.has(clip.hash)) clipsByHash.set(clip.hash, clip);
    trigger.setAttribute("aria-controls", clipModal.id || "walkthrough-clip");
    trigger.setAttribute("aria-haspopup", "dialog");
    const prepareVideo = () => prepareClipVideo("auto");
    trigger.addEventListener("pointerenter", () => {
      hoveredTrigger = trigger;
      prepareVideo();
      scheduleClipPreview(trigger);
    });
    trigger.addEventListener("pointerleave", () => {
      if (hoveredTrigger === trigger) hoveredTrigger = null;
      closeClipPreview();
    });
    trigger.addEventListener("pointerdown", () => {
      cancelPreviewTimer();
      prepareVideo();
    });
    trigger.addEventListener("focus", prepareVideo);
    trigger.addEventListener("click", (event) => {
      if (event instanceof MouseEvent && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
        return;
      }

      event.preventDefault();
      openClip(clips.get(trigger), {
        continueFromPreview: previewTrigger === trigger && isClipPreviewOpen(),
        updateHash: true
      });
    });
  });

  if (!document.querySelector("[data-walkthrough-video]")) {
    scheduleClipMetadataPreload();
  }

  clipModal.addEventListener("click", (event) => {
    if (event.target === clipModal) closeClip();
  });
  clipModal.addEventListener("close", () => {
    if (clearHashOnModalClose) clearClipHash(activeClip);
    clearHashOnModalClose = true;
    resetClip();
  });

  clipVideo.addEventListener("loadedmetadata", () => {
    applyPendingStartTime();
    enforceClipBounds();
  });
  clipVideo.addEventListener("timeupdate", enforceClipBounds);
  clipVideo.addEventListener("ended", () => {
    if (!activeClip || !isClipPlayerVisible()) return;

    seekToClipStart();
    startActivePlayback();
  });
  clipVideo.addEventListener("play", startLoopMonitor);
  clipVideo.addEventListener("pause", stopLoopMonitor);
  document.addEventListener("visibilitychange", () => {
    if (!isClipPlayerVisible()) return;
    if (document.hidden) {
      clipVideo.pause();
      return;
    }

    startActivePlayback();
  });

  if (canPreviewOnHover) {
    window.addEventListener("resize", positionClipPreview);
    window.addEventListener("scroll", positionClipPreview, true);
  }

  window.addEventListener("hashchange", syncClipToHash);

  if (getClipFromHash()) {
    window.requestAnimationFrame(syncClipToHash);
  }

  function readClip(trigger) {
    if (!(trigger instanceof HTMLElement)) return null;

    const chapter = trigger.dataset.walkthroughClipChapter?.trim().toLowerCase();
    const startSeconds = Number(trigger.dataset.walkthroughClipStart);
    const endValue = trigger.dataset.walkthroughClipEnd;
    const endSeconds = endValue === undefined ? null : Number(endValue);
    if (!chapter || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(chapter)) return null;
    if (!Number.isFinite(startSeconds) || startSeconds < 0) return null;
    if (endSeconds !== null && (!Number.isFinite(endSeconds) || endSeconds <= startSeconds)) return null;

    return {
      hash: `#clip-${chapter}`,
      endSeconds,
      startSeconds,
      title: trigger.dataset.walkthroughClipTitle?.trim() || ""
    };
  }

  function openClip(clip, options = {}) {
    if (!clip) return;

    const continueFromPreview = (
      options.continueFromPreview === true &&
      activeClip === clip &&
      isClipPreviewOpen()
    );
    hoveredTrigger = null;
    closeClipPreview({ keepActive: true, keepPlayback: continueFromPreview });
    if (options.updateHash) updateClipHash(clip);

    if (typeof clipModal.showModal !== "function") {
      clipVideo.pause();
      resetClip();
      const fallbackUrl = new URL(videoUrl);
      fallbackUrl.hash = clip.endSeconds === null
        ? `t=${clip.startSeconds}`
        : `t=${clip.startSeconds},${clip.endSeconds}`;
      window.open(fallbackUrl.href, "_blank", "noopener");
      return;
    }

    activeClip = clip;
    prepareClipVideo("auto");
    if (clipTitle instanceof HTMLElement && clip.title) clipTitle.textContent = clip.title;
    if (!continueFromPreview) seekToClipStart();
    if (!clipModal.open) clipModal.showModal();
    startPlayback();
  }

  function scheduleClipPreview(trigger) {
    if (!canPreviewOnHover || clipModal.open) return;

    cancelPreviewTimer();
    previewTimer = window.setTimeout(() => {
      previewTimer = 0;
      if (hoveredTrigger !== trigger || clipModal.open) return;
      openClipPreview(trigger, clips.get(trigger));
    }, 250);
  }

  function openClipPreview(trigger, clip) {
    if (!canPreviewOnHover || !clip || hoveredTrigger !== trigger || clipModal.open) return;

    activeClip = clip;
    previewTrigger = trigger;
    prepareClipVideo("auto");
    clipPreview.append(clipFrame);
    clipPreview.hidden = false;
    positionClipPreview();
    void clipPreview.offsetWidth;
    clipPreview.classList.add("is-visible");
    seekToClipStart();
    startPreviewPlayback();
  }

  function closeClipPreview(options = {}) {
    cancelPreviewTimer();
    if (!isClipPreviewOpen()) return;

    clipPreview.classList.remove("is-visible");
    clipPreview.hidden = true;
    clipPreview.removeAttribute("data-placement");
    clipModalPanel.append(clipFrame);
    previewTrigger = null;
    if (!options.keepPlayback) clipVideo.pause();
    if (!options.keepActive) {
      pendingStartTime = null;
      activeClip = null;
    }
  }

  function cancelPreviewTimer() {
    if (!previewTimer) return;

    window.clearTimeout(previewTimer);
    previewTimer = 0;
  }

  function isClipPreviewOpen() {
    return canPreviewOnHover && clipPreview.hidden === false;
  }

  function positionClipPreview() {
    if (!isClipPreviewOpen() || !(previewTrigger instanceof HTMLElement)) return;

    const triggerRect = previewTrigger.getBoundingClientRect();
    const previewRect = clipPreview.getBoundingClientRect();
    const viewportMargin = 12;
    const previewGap = 10;
    const previewWidth = previewRect.width;
    const previewHeight = previewRect.height;
    const maximumLeft = Math.max(viewportMargin, window.innerWidth - previewWidth - viewportMargin);
    const desiredLeft = triggerRect.left + triggerRect.width / 2 - previewWidth / 2;
    const left = Math.min(Math.max(viewportMargin, desiredLeft), maximumLeft);
    const above = triggerRect.top - previewGap - previewHeight;
    const below = triggerRect.bottom + previewGap;
    const placeBelow = above < viewportMargin && below + previewHeight <= window.innerHeight - viewportMargin;
    const maximumTop = Math.max(viewportMargin, window.innerHeight - previewHeight - viewportMargin);
    const top = Math.min(Math.max(viewportMargin, placeBelow ? below : above), maximumTop);

    clipPreview.dataset.placement = placeBelow ? "below" : "above";
    clipPreview.style.left = `${Math.round(left)}px`;
    clipPreview.style.top = `${Math.round(top)}px`;
  }

  function prepareClipVideo(preload) {
    if (preload !== "auto" && clipVideo.preload === "auto") return;

    const sourceChanged = clipVideo.src !== videoUrl.href;
    const preloadChanged = clipVideo.preload !== preload;
    if (!sourceChanged && !preloadChanged) return;

    clipVideo.preload = preload;
    if (sourceChanged) clipVideo.src = videoUrl.href;
    clipVideo.load();
  }

  function scheduleClipMetadataPreload() {
    const preloadMetadata = () => {
      if (document.hidden) return;
      prepareClipVideo("metadata");
    };

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(preloadMetadata, { timeout: 4_000 });
      return;
    }

    window.setTimeout(preloadMetadata, 2_000);
  }

  function closeClip(options = {}) {
    clipVideo.pause();
    if (typeof clipModal.close === "function" && clipModal.open) {
      clearHashOnModalClose = options.clearHash !== false;
      clipModal.close();
      return;
    }

    if (options.clearHash !== false) clearClipHash(activeClip);
    resetClip();
  }

  function resetClip() {
    clipVideo.pause();
    stopLoopMonitor();
    pendingStartTime = null;
    activeClip = null;
  }

  function getClipFromHash() {
    return clipsByHash.get(window.location.hash.toLowerCase()) || null;
  }

  function syncClipToHash() {
    const clip = getClipFromHash();
    if (clip) {
      openClip(clip);
      return;
    }

    if (clipModal.open) closeClip({ clearHash: false });
  }

  function updateClipHash(clip) {
    if (window.location.hash.toLowerCase() === clip.hash) return;
    history.pushState(null, "", clip.hash);
  }

  function clearClipHash(clip) {
    if (!clip || window.location.hash.toLowerCase() !== clip.hash) return;
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }

  function seekToClipStart() {
    if (!activeClip) return;

    pendingStartTime = activeClip.startSeconds;
    applyPendingStartTime();
  }

  function applyPendingStartTime() {
    if (pendingStartTime === null || clipVideo.readyState === 0) return;

    const duration = Number.isFinite(clipVideo.duration) ? clipVideo.duration : 0;
    clipVideo.currentTime = duration ? Math.min(duration, pendingStartTime) : pendingStartTime;
    pendingStartTime = null;
  }

  function getClipEndTime() {
    if (!activeClip) return null;
    if (activeClip.endSeconds !== null) return activeClip.endSeconds;
    return Number.isFinite(clipVideo.duration) && clipVideo.duration > activeClip.startSeconds
      ? clipVideo.duration
      : null;
  }

  function enforceClipBounds() {
    if (!activeClip) return;

    const endSeconds = getClipEndTime();
    const currentTime = clipVideo.currentTime;
    if (
      currentTime < activeClip.startSeconds - 0.05 ||
      (endSeconds !== null && currentTime >= endSeconds - 0.05)
    ) {
      seekToClipStart();
    }
  }

  function startLoopMonitor() {
    if (loopFrame) return;

    const monitor = () => {
      loopFrame = 0;
      if (clipVideo.paused || !isClipPlayerVisible() || !activeClip) return;

      enforceClipBounds();
      loopFrame = window.requestAnimationFrame(monitor);
    };
    loopFrame = window.requestAnimationFrame(monitor);
  }

  function stopLoopMonitor() {
    if (!loopFrame) return;

    window.cancelAnimationFrame(loopFrame);
    loopFrame = 0;
  }

  function isClipPlayerVisible() {
    return clipModal.open || isClipPreviewOpen();
  }

  function startActivePlayback() {
    if (clipModal.open) {
      startPlayback();
      return;
    }
    if (isClipPreviewOpen()) startPreviewPlayback();
  }

  function startPreviewPlayback() {
    clipVideo.volume = 0;
    clipVideo.muted = true;
    if (reducedMotionQuery?.matches === true) {
      clipVideo.pause();
      return;
    }

    void clipVideo.play().catch(() => undefined);
  }

  function startPlayback() {
    clipVideo.volume = 1;
    clipVideo.muted = false;
    void clipVideo.play().catch(() => {
      clipVideo.muted = true;
      void clipVideo.play().catch(() => undefined);
    });
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
