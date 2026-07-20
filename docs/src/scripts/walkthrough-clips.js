(() => {
  const clipTriggers = Array.from(document.querySelectorAll("[data-walkthrough-clip-open]"));
  const clipModal = document.querySelector("[data-walkthrough-clip-modal]");
  const clipTitle = clipModal?.querySelector("[data-walkthrough-clip-title]");
  const clipVideo = document.querySelector("[data-walkthrough-clip-video]");
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
  let activeClip = null;
  let clearHashOnModalClose = true;
  let loopFrame = 0;
  let pendingStartTime = null;

  clips.forEach((clip, trigger) => {
    if (!clipsByHash.has(clip.hash)) clipsByHash.set(clip.hash, clip);
    trigger.setAttribute("aria-controls", clipModal.id || "walkthrough-clip");
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.addEventListener("click", (event) => {
      if (event instanceof MouseEvent && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
        return;
      }

      event.preventDefault();
      openClip(clips.get(trigger), { updateHash: true });
    });
  });

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
    if (!activeClip || !clipModal.open) return;

    seekToClipStart();
    startPlayback();
  });
  clipVideo.addEventListener("play", startLoopMonitor);
  clipVideo.addEventListener("pause", stopLoopMonitor);
  document.addEventListener("visibilitychange", () => {
    if (!clipModal.open) return;
    if (document.hidden) {
      clipVideo.pause();
      return;
    }

    startPlayback();
  });

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

    if (options.updateHash) updateClipHash(clip);

    if (typeof clipModal.showModal !== "function") {
      const fallbackUrl = new URL(videoUrl);
      fallbackUrl.hash = clip.endSeconds === null
        ? `t=${clip.startSeconds}`
        : `t=${clip.startSeconds},${clip.endSeconds}`;
      window.open(fallbackUrl.href, "_blank", "noopener");
      return;
    }

    activeClip = clip;
    ensureClipVideoSource();
    if (clipTitle instanceof HTMLElement && clip.title) clipTitle.textContent = clip.title;
    seekToClipStart();
    if (!clipModal.open) clipModal.showModal();
    startPlayback();
  }

  function ensureClipVideoSource() {
    if (clipVideo.src === videoUrl.href) return;

    clipVideo.src = videoUrl.href;
    clipVideo.load();
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
      if (clipVideo.paused || !clipModal.open || !activeClip) return;

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
