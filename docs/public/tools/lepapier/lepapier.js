(() => {
  const appConfig = {
    homeHref: '../../',
    iconSrc: '../../assets/icons/icon-128.png',
    logoSrc: '../../assets/icons/icon.svg',
    name: 'Le Papier',
    metadataContext: 'a public update post',
    storageNamespace: 'lepapier'
  };
  const assetDatabaseName = `${appConfig.storageNamespace}-assets`;
  const assetDatabaseVersion = 2;
  const assetStoreName = 'assets';
  const editableFolderStoreName = 'editable-folders';
  const defaultImageCropRatio = 16 / 9;
  const defaultPaperWidth = 680;
  const maximumImageCropRatio = 3;
  const maximumImageRotation = 8;
  const maximumHistoryEntries = 100;
  const maximumPaperWidth = 920;
  const minimumImageCropRatio = 0.6;
  const minimumPaperWidth = 540;
  const storageKey = `${appConfig.storageNamespace}-draft-v1`;
  const themeStorageKey = `${appConfig.storageNamespace}-theme`;
  const textEncoder = new TextEncoder();
  const crcTable = createCrcTable();
  const fields = new Map();
  const selectedImages = [];
  const documents = [];
  const editableFolders = new Map();
  const importFileRelativePaths = new WeakMap();
  const redoStack = [];
  const undoStack = [];
  let activeDocumentId = '';
  let coverImage = null;
  let titleEdited = false;
  let titleEditedSlug = false;
  let descriptionEdited = false;
  let tagsEdited = false;
  let previewActive = false;
  let saveTimeout = 0;
  let folderSavePromise = Promise.resolve();
  let documentsRevealTimeout = 0;
  let sidebarAvoidanceFrame = 0;
  let sidebarRevealTimeout = 0;
  let toolbarRevealTimeout = 0;
  let aiTimer = 0;
  let aiEnabled = false;
  let aiBusy = false;
  let aiStartupAttempted = false;
  let lastAiSource = '';
  let assetDatabasePromise = null;
  let summarizer = null;
  let languageSession = null;
  let paperWidth = defaultPaperWidth;
  let restoringHistory = false;

  const fieldElements = document.querySelectorAll('[data-field]');
  const preview = document.querySelector('[data-preview]');
  const output = document.querySelector('[data-output]');
  const saveState = document.querySelector('[data-save-state]');
  const documentsSidebar = document.querySelector('[data-documents-sidebar]');
  const sidebar = document.querySelector('[data-sidebar]');
  const editorHeader = document.querySelector('.editor-header');
  const documentList = document.querySelector('[data-document-list]');
  const imageList = document.querySelector('[data-image-list]');
  const imageTemplate = document.querySelector('[data-image-row-template]');
  const imagePicker = document.querySelector('[data-image-picker]');
  const coverPicker = document.querySelector('[data-cover-picker]');
  const coverPreview = document.querySelector('[data-cover-preview]');
  const coverStatus = document.querySelector('[data-cover-status]');
  const coverPath = document.querySelector('[data-cover-path]');
  const bodyInput = document.querySelector('[data-field="body"]');
  const paper = document.querySelector('.paper');
  const paperResizeHandles = document.querySelectorAll('[data-paper-resize]');
  const randomizeImageNamesInput = document.querySelector('[data-randomize-image-names]');
  const smartPunctuationInput = document.querySelector('[data-smart-punctuation]');
  const toolbar = document.querySelector('.toolbar');
  const themeToggle = document.querySelector('[data-theme-toggle]');
  const previewToggle = document.querySelector('[data-preview-toggle]');
  const aiEnableButton = document.querySelector('[data-ai-enable]');
  const aiStatus = document.querySelector('[data-ai-status]');
  const addDocumentButton = document.querySelector('[data-add-document]');
  const downloadAllButton = document.querySelector('[data-download-all]');
  const openEditableFolderButton = document.querySelector('[data-open-editable-folder]');
  const openPostFolderButton = document.querySelector('[data-open-post-folder]');
  const openPostFolderFilesInput = document.querySelector('[data-open-post-folder-files]');

  applyAppConfig();
  initializeTheme();

  for (const field of fieldElements) {
    fields.set(field.dataset.field, field);
    field.addEventListener('beforeinput', () => {
      recordHistory();
    });
    field.addEventListener('input', () => {
      const fieldName = field.dataset.field;
      normalizeFieldSmartPunctuation(field, fieldName);
      if (fieldName === 'body') {
        resizeBodyInput();
      }
      if (fieldName === 'title' && !titleEditedSlug) {
        setFieldValue('slug', slugify(field.value));
      }
      if (fieldName === 'title') titleEdited = true;
      if (fieldName === 'slug') titleEditedSlug = true;
      if (fieldName === 'description') descriptionEdited = true;
      if (fieldName === 'tags') tagsEdited = true;
      sync();
      scheduleAiMetadata();
    });
  }

  themeToggle.addEventListener('click', () => {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme, { persist: true });
  });

  setupPaperResize();
  document.addEventListener('keydown', handleEditorHistoryShortcut);
  document.addEventListener('paste', handlePreviewImagePaste);
  preview.addEventListener('pointerdown', handlePreviewPointerDown);

  updateToolbarScrollState();
  revealDocumentsSidebarTemporarily(2400);
  revealSidebarTemporarily(2400);
  revealToolbarTemporarily(2400);
  window.addEventListener('scroll', updateToolbarScrollState, { passive: true });
  window.addEventListener('pointermove', handleSheetEdgePointerMove);
  window.addEventListener('resize', () => {
    scheduleSidebarAvoidanceUpdate();
    resizeBodyInput();
  });
  sidebar.addEventListener('pointerenter', () => {
    revealSidebar();
  });
  sidebar.addEventListener('pointerleave', () => {
    scheduleSidebarFade();
  });
  sidebar.addEventListener('focusin', () => {
    revealSidebar();
  });
  sidebar.addEventListener('focusout', () => {
    scheduleSidebarFade();
  });
  documentsSidebar.addEventListener('pointerenter', () => {
    revealDocumentsSidebar();
  });
  documentsSidebar.addEventListener('pointerleave', () => {
    scheduleDocumentsSidebarFade();
  });
  documentsSidebar.addEventListener('focusin', () => {
    revealDocumentsSidebar();
  });
  documentsSidebar.addEventListener('focusout', () => {
    scheduleDocumentsSidebarFade();
  });
  toolbar.addEventListener('pointerenter', () => {
    revealToolbar();
  });
  toolbar.addEventListener('pointerleave', () => {
    scheduleToolbarFade();
  });
  toolbar.addEventListener('focusin', () => {
    revealToolbar();
  });
  toolbar.addEventListener('focusout', () => {
    scheduleToolbarFade();
  });
  editorHeader.addEventListener('pointerenter', () => {
    revealToolbar();
  });
  editorHeader.addEventListener('pointerleave', () => {
    scheduleToolbarFade();
  });
  editorHeader.addEventListener('focusin', () => {
    revealToolbar();
  });
  editorHeader.addEventListener('focusout', () => {
    scheduleToolbarFade();
  });

  document.querySelector('[data-reset]').addEventListener('click', () => {
    if (!window.confirm('Clear the saved local draft?')) return;
    recordHistory();
    localStorage.removeItem(storageKey);
    void clearSavedAssets();
    void clearEditableFolderHandles();
    editableFolders.clear();
    const nextDocument = createDefaultDocument();
    documents.splice(0, documents.length, nextDocument);
    activeDocumentId = nextDocument.id;
    selectedImages.splice(0, selectedImages.length);
    coverImage = null;
    titleEdited = false;
    titleEditedSlug = false;
    descriptionEdited = false;
    tagsEdited = false;
    previewActive = false;
    randomizeImageNamesInput.checked = false;
    smartPunctuationInput.checked = true;
    applyDocumentToEditor(nextDocument, { focusWrite: false, restoreCover: false });
    renderPreviewMode({ focusWrite: false });
    renderDocumentsList();
    renderImages();
    renderCover();
    sync();
  });

  document.querySelector('[data-copy]').addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await navigator.clipboard.writeText(buildMarkdown());
    showSaveState('Copied Markdown');
  });

  document.querySelector('[data-download]').addEventListener('click', async () => {
    saveDraftNow();
    try {
      const zip = await createPostZip();
      downloadBlob(`${getPostFolderName()}.zip`, zip);
    } catch (error) {
      console.error(error);
      showSaveState('Could not bundle every image');
    }
  });

  downloadAllButton.addEventListener('click', async () => {
    saveDraftNow();
    try {
      const zip = await createAllPostsZip();
      downloadBlob('blog-posts.zip', zip);
    } catch (error) {
      console.error(error);
      showSaveState('Could not bundle every image');
    }
  });

  addDocumentButton.addEventListener('click', () => {
    addDocument();
  });

  openEditableFolderButton.addEventListener('click', () => {
    void openEditablePostFolder();
  });
  openPostFolderButton.addEventListener('click', () => {
    openPostFolderFilesInput.click();
  });
  openPostFolderFilesInput.addEventListener('change', () => {
    const files = Array.from(openPostFolderFilesInput.files || []);
    openPostFolderFilesInput.value = '';
    if (!files.length) return;
    void openPostFiles(files);
  });

  documentList.addEventListener('click', (event) => {
    const target = getElement(event.target);
    const reconnectButton = target?.closest('[data-reconnect-folder]');
    if (reconnectButton) {
      void reconnectEditableFolderForDocument(reconnectButton.dataset.reconnectFolder);
      return;
    }

    const deleteButton = target?.closest('[data-delete-document]');
    if (deleteButton) {
      deleteDocument(deleteButton.dataset.deleteDocument);
      return;
    }

    const documentButton = target?.closest('[data-switch-document]');
    if (documentButton) {
      switchDocument(documentButton.dataset.switchDocument);
    }
  });

  previewToggle.addEventListener('click', () => {
    previewActive = !previewActive;
    renderPreviewMode();
    persistDraft();
  });
  randomizeImageNamesInput.addEventListener('change', () => {
    persistDraft();
  });
  smartPunctuationInput.addEventListener('change', () => {
    if (smartPunctuationInput.checked) {
      normalizeSmartPunctuationFields({ record: true });
      sync();
      return;
    }

    persistDraft();
  });

  for (const button of document.querySelectorAll('[data-insert]')) {
    button.addEventListener('pointerdown', (event) => {
      if (previewActive) {
        event.preventDefault();
      }
    });
    button.addEventListener('click', () => {
      insertFormatting(button.dataset.insert);
    });
  }

  coverPicker.addEventListener('change', () => {
    const file = coverPicker.files?.[0];
    if (file?.type.startsWith('image/')) {
      recordHistory();
      setCoverFile(file);
    }
    coverPicker.value = '';
    sync();
  });

  imagePicker.addEventListener('change', () => {
    const files = Array.from(imagePicker.files || []);
    if (files.some((file) => file.type.startsWith('image/'))) {
      recordHistory();
    }
    for (const file of files) {
      addImageFile(file);
    }
    imagePicker.value = '';
    renderImages();
    sync();
  });

  setupImageDropZone(coverPicker.closest('.file-drop'), {
    multiple: false,
    onFiles(files) {
      recordHistory();
      setCoverFile(files[0]);
      sync();
    }
  });

  setupImageDropZone(imagePicker.closest('.file-drop'), {
    multiple: true,
    onFiles(files) {
      recordHistory();
      for (const file of files) {
        addImageFile(file);
      }
      renderImages();
      sync();
    }
  });

  setupImageDropZone(paper, {
    multiple: true,
    onFiles(files) {
      insertDroppedImages(files);
    }
  });

  bodyInput.addEventListener('paste', (event) => {
    const files = getClipboardImages(event.clipboardData);
    if (!files.length) return;

    event.preventDefault();
    insertDroppedImages(files);
  });

  aiEnableButton.addEventListener('click', async () => {
    await enableAiMetadata({ manual: true });
  });
  for (const button of document.querySelectorAll('[data-ai-regenerate]')) {
    button.addEventListener('click', () => {
      void regenerateAiMetadataField(button.dataset.aiRegenerate, button);
    });
  }

  const loadedDraft = loadDraft();
  renderImages();
  renderCover();
  renderPreviewMode({ focusWrite: false });
  sync({ persist: false });
  void restoreSavedAssets(loadedDraft);
  void restoreEditableFolders(loadedDraft);
  void startAiMetadataAutomatically();

  function loadDraft() {
    const fallback = createDefaultDocument();
    const saved = readSavedDraft();
    const draft = normalizeSavedDraft(saved, fallback);

    documents.splice(0, documents.length, ...draft.documents);
    activeDocumentId = draft.activeDocumentId;
    randomizeImageNamesInput.checked = Boolean(draft.randomizeImageNames);
    smartPunctuationInput.checked = draft.smartPunctuation !== false;
    applyDocumentToEditor(getActiveDocument() || documents[0], { focusWrite: false, restoreCover: false });
    return draft;
  }

  function readSavedDraft() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || 'null');
    } catch {
      return null;
    }
  }

  function normalizeSavedDraft(saved, fallbackDocument) {
    if (Array.isArray(saved?.documents) && saved.documents.length) {
      const normalizedDocuments = saved.documents
        .map((documentRecord) => normalizeDocumentRecord(documentRecord))
        .filter(Boolean);

      if (normalizedDocuments.length) {
        const activeId = normalizedDocuments.some((documentRecord) => documentRecord.id === saved.activeDocumentId)
          ? saved.activeDocumentId
          : normalizedDocuments[0].id;

        return {
          ...saved,
          activeDocumentId: activeId,
          documents: normalizedDocuments
        };
      }
    }

    return {
      activeDocumentId: fallbackDocument.id,
      documents: [fallbackDocument],
      images: []
    };
  }

  function normalizeDocumentRecord(documentRecord) {
    if (!documentRecord) return null;

    const fieldsRecord = documentRecord.fields;
    if (!fieldsRecord) return null;

    const fieldsValue = {
      body: String(fieldsRecord.body || ''),
      date: fieldsRecord.date || getToday(),
      description: String(fieldsRecord.description || ''),
      image: String(fieldsRecord.image || ''),
      slug: String(fieldsRecord.slug || ''),
      tags: String(fieldsRecord.tags || ''),
      title: String(fieldsRecord.title || '')
    };

    return {
      coverImage: documentRecord.coverImage || null,
      editState: {
        description: Boolean(documentRecord.editState?.description),
        slug: Boolean(documentRecord.editState?.slug),
        tags: Boolean(documentRecord.editState?.tags),
        title: Boolean(documentRecord.editState?.title)
      },
      fields: fieldsValue,
      frontmatterExtras: Array.isArray(documentRecord.frontmatterExtras)
        ? documentRecord.frontmatterExtras.map((line) => String(line)).filter((line) => line.trim())
        : [],
      id: documentRecord.id || createDocumentId(),
      paperWidth: clampPaperWidth(documentRecord.paperWidth),
      updatedAt: Number.isFinite(Number(documentRecord.updatedAt)) ? Number(documentRecord.updatedAt) : Date.now(),
      viewMode: documentRecord.viewMode === 'preview' ? 'preview' : 'write'
    };
  }

  function createDefaultDocument(overrides = {}) {
    const documentRecord = normalizeDocumentRecord({
      fields: {
        body: [
          'Start with the change or story that matters.',
          '',
          '## What changed',
          '',
          '- Add the important details here.',
          '',
          '## Why it matters',
          '',
          'Explain what users can do now.'
        ].join('\n'),
        date: getToday(),
        description: '',
        image: '',
        slug: '',
        tags: '',
        title: ''
      },
      id: createDocumentId(),
      paperWidth,
      updatedAt: Date.now(),
      viewMode: previewActive ? 'preview' : 'write',
      ...overrides
    });

    return documentRecord;
  }

  function createDocumentId() {
    if ('randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `document-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function restoreSavedAssets(draft) {
    const images = await Promise.all((draft?.images || []).map((asset) => restoreSavedAsset(asset)));

    selectedImages.splice(0, selectedImages.length, ...images.filter(Boolean));
    renderImages();
    await restoreActiveDocumentCover();
    sync({ persist: false });
  }

  async function restoreEditableFolders(draft) {
    if (!('indexedDB' in window)) return;

    await Promise.all((draft?.documents || []).map(async (documentRecord) => {
      try {
        const record = await readEditableFolderHandle(documentRecord.id);
        if (!record?.directoryHandle) return;

        const connected = await getEditableFolderPermissionState(record.directoryHandle) === 'granted';
        editableFolders.set(documentRecord.id, {
          connected,
          directoryHandle: record.directoryHandle
        });
      } catch {
        // Ignore stale or unsupported handles; the normal ZIP workflow still works.
      }
    }));

    renderDocumentsList();
  }

  async function restoreActiveDocumentCover() {
    const documentRecord = getActiveDocument();
    const documentId = documentRecord?.id;
    const coverMetadata = documentRecord?.coverImage;
    coverImage = getLiveAsset(coverMetadata);
    renderCover();

    if (!coverMetadata?.id || coverImage) return;

    const restoredCover = await restoreSavedAsset(coverMetadata);
    if (activeDocumentId !== documentId) return;

    coverImage = restoredCover;
    renderCover();
  }

  async function restoreSavedAsset(metadata) {
    if (!metadata?.id) return null;

    try {
      const record = await readAsset(metadata.id);
      if (!record?.file) return null;
      return {
        file: record.file,
        id: metadata.id,
        name: metadata.name,
        path: metadata.path,
        sourcePath: metadata.sourcePath,
        url: URL.createObjectURL(record.file)
      };
    } catch {
      return null;
    }
  }

  function serializeAssetMetadata(asset) {
    if (!asset) return null;
    return {
      id: asset.id,
      name: asset.name,
      path: asset.path,
      sourcePath: asset.sourcePath
    };
  }

  function getLiveAsset(metadata) {
    if (!metadata?.id && !metadata?.path) return null;

    const candidates = [coverImage, ...selectedImages];
    return candidates.find((asset) => {
      if (!asset) return false;
      return asset.id === metadata.id || assetMatchesPath(asset, metadata.path);
    }) || null;
  }

  function assetMatchesPath(asset, path) {
    if (!asset || !path) return false;

    const requestedPath = normalizePostAssetPath(path);
    return [asset.path, asset.sourcePath]
      .some((candidate) => normalizePostAssetPath(candidate) === requestedPath);
  }

  function createAssetId() {
    if ('randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `asset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function saveAsset(asset) {
    if (!asset?.id || !('indexedDB' in window)) return;

    const database = await getAssetDatabase();
    await runAssetTransaction(database, 'readwrite', (store) => {
      store.put({
        file: asset.file,
        id: asset.id
      });
    });
  }

  async function readAsset(id) {
    if (!('indexedDB' in window)) return null;

    const database = await getAssetDatabase();
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(assetStoreName, 'readonly');
      const request = transaction.objectStore(assetStoreName).get(id);
      request.addEventListener('success', () => {
        resolve(request.result || null);
      });
      request.addEventListener('error', () => {
        reject(request.error);
      });
    });
  }

  async function clearSavedAssets() {
    if (!('indexedDB' in window)) return;

    const database = await getAssetDatabase();
    await runAssetTransaction(database, 'readwrite', (store) => {
      store.clear();
    });
  }

  async function saveEditableFolderHandle(documentId, directoryHandle) {
    if (!documentId || !directoryHandle || !('indexedDB' in window)) return;

    const database = await getAssetDatabase();
    await runDatabaseTransaction(database, editableFolderStoreName, 'readwrite', (store) => {
      store.put({
        directoryHandle,
        id: documentId
      });
    });
  }

  async function readEditableFolderHandle(documentId) {
    if (!documentId || !('indexedDB' in window)) return null;

    const database = await getAssetDatabase();
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(editableFolderStoreName, 'readonly');
      const request = transaction.objectStore(editableFolderStoreName).get(documentId);
      request.addEventListener('success', () => {
        resolve(request.result || null);
      });
      request.addEventListener('error', () => {
        reject(request.error);
      });
    });
  }

  async function deleteEditableFolderHandle(documentId) {
    if (!documentId || !('indexedDB' in window)) return;

    const database = await getAssetDatabase();
    await runDatabaseTransaction(database, editableFolderStoreName, 'readwrite', (store) => {
      store.delete(documentId);
    });
  }

  async function clearEditableFolderHandles() {
    if (!('indexedDB' in window)) return;

    const database = await getAssetDatabase();
    await runDatabaseTransaction(database, editableFolderStoreName, 'readwrite', (store) => {
      store.clear();
    });
  }

  function getAssetDatabase() {
    if (assetDatabasePromise) return assetDatabasePromise;

    assetDatabasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(assetDatabaseName, assetDatabaseVersion);
      request.addEventListener('upgradeneeded', () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(assetStoreName)) {
          database.createObjectStore(assetStoreName, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(editableFolderStoreName)) {
          database.createObjectStore(editableFolderStoreName, { keyPath: 'id' });
        }
      });
      request.addEventListener('success', () => {
        resolve(request.result);
      });
      request.addEventListener('error', () => {
        reject(request.error);
      });
    });

    return assetDatabasePromise;
  }

  function runAssetTransaction(database, mode, action) {
    return runDatabaseTransaction(database, assetStoreName, mode, action);
  }

  function runDatabaseTransaction(database, storeName, mode, action) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      action(transaction.objectStore(storeName));
      transaction.addEventListener('complete', () => {
        resolve();
      });
      transaction.addEventListener('error', () => {
        reject(transaction.error);
      });
      transaction.addEventListener('abort', () => {
        reject(transaction.error);
      });
    });
  }

  function sync({ persist = true } = {}) {
    const markdown = buildMarkdown();
    output.textContent = markdown;
    resizeBodyInput();
    if (previewActive) {
      renderPreview();
    }
    if (persist) {
      persistDraft();
    }
  }

  function persistDraft() {
    window.clearTimeout(saveTimeout);
    showSaveState('Saving...');
    saveTimeout = window.setTimeout(() => {
      saveDraftNow();
    }, 180);
  }

  function saveDraftNow({ touch = true } = {}) {
    window.clearTimeout(saveTimeout);

    updateActiveDocumentFromEditor({ touch });
    const draft = {
      activeDocumentId,
      documents,
      version: 3
    };
    draft.images = selectedImages.map(serializeAssetMetadata);
    draft.randomizeImageNames = randomizeImageNamesInput.checked;
    draft.smartPunctuation = smartPunctuationInput.checked;
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
      renderDocumentsList();
      showSaveState('Saved locally');
    } catch (error) {
      logEditorError('Could not save the local blog editor draft.', error, {
        activeDocumentId,
        documentCount: documents.length
      });
      showSaveState('Could not save locally');
    }
  }

  async function saveCurrentDocument() {
    saveDraftNow();

    const documentRecord = getCurrentDocumentForExport();
    const saveJob = folderSavePromise.then(() => saveDocumentToEditableFolder(documentRecord));
    folderSavePromise = saveJob.catch(() => undefined);
    await saveJob;
  }

  async function saveDocumentToEditableFolder(documentRecord) {
    const editableFolder = editableFolders.get(documentRecord.id);
    if (!editableFolder) return;

    try {
      const connected = editableFolder.connected || await reconnectEditableFolder(documentRecord.id, { markConnected: false, silent: true });
      if (!connected) return;

      showSaveState('Saving to folder...');
      await writePostToEditableFolder(documentRecord, editableFolder.directoryHandle);
      editableFolder.connected = true;
      renderDocumentsList();
      saveDraftNow({ touch: false });
      showSaveState('Saved to folder');
    } catch (error) {
      markEditableFolderDisconnected(documentRecord.id);
      logEditorError('Could not save the current blog post to its editable folder.', error, {
        documentId: documentRecord.id,
        slug: getDocumentFieldValue(documentRecord, 'slug'),
        title: getDocumentFieldValue(documentRecord, 'title')
      });
      showSaveState('Could not save to folder');
    }
  }

  async function reconnectEditableFolderForDocument(documentId) {
    saveDraftNow({ touch: false });

    const documentRecord = getDocumentForExportById(documentId);
    if (!documentRecord) {
      showSaveState('Document no longer exists');
      return;
    }

    const connected = await reconnectEditableFolder(documentId, { markConnected: false, silent: true });
    if (!connected) {
      showSaveState('Could not reconnect folder');
      return;
    }

    try {
      const editableFolder = editableFolders.get(documentId);
      await createEditableFolderPostFiles(documentRecord, editableFolder?.directoryHandle);
      if (editableFolder) {
        editableFolder.connected = true;
      }
      saveDraftNow({ touch: false });
      renderDocumentsList();
      showSaveState('Folder reconnected');
    } catch (error) {
      markEditableFolderDisconnected(documentId);
      logEditorError('Could not validate the editable folder post after reconnecting.', error, {
        documentId,
        slug: getDocumentFieldValue(documentRecord, 'slug'),
        title: getDocumentFieldValue(documentRecord, 'title')
      });
      showSaveState('Could not bundle every image');
    }
  }

  function markEditableFolderDisconnected(documentId) {
    const editableFolder = editableFolders.get(documentId);
    if (!editableFolder) return;

    editableFolder.connected = false;
    renderDocumentsList();
  }

  function showSaveState(text) {
    saveState.textContent = text;
  }

  function applyAppConfig() {
    document.title = appConfig.name;

    for (const icon of document.querySelectorAll('[data-app-icon]')) {
      icon.setAttribute('href', appConfig.iconSrc);
    }

    const brandLink = document.querySelector('[data-app-home]');
    if (brandLink) {
      brandLink.setAttribute('href', appConfig.homeHref);
      brandLink.setAttribute('aria-label', `${appConfig.name} home`);
    }

    const brandLogo = document.querySelector('[data-app-logo]');
    if (brandLogo) {
      brandLogo.setAttribute('src', appConfig.logoSrc);
      brandLogo.setAttribute('alt', '');
    }
  }

  function logEditorError(message, error, details = {}) {
    console.error(`[${appConfig.name}] ${message}`, details, error);
  }

  function getActiveDocument() {
    return documents.find((documentRecord) => documentRecord.id === activeDocumentId) || documents[0] || null;
  }

  function updateActiveDocumentFromEditor({ touch }) {
    const documentRecord = getActiveDocument();
    if (!documentRecord) return null;

    const values = {};
    for (const [name, field] of fields) {
      values[name] = field.value;
    }

    documentRecord.coverImage = serializeAssetMetadata(coverImage);
    documentRecord.editState = {
      description: descriptionEdited,
      slug: titleEditedSlug,
      tags: tagsEdited,
      title: titleEdited
    };
    documentRecord.fields = values;
    documentRecord.paperWidth = paperWidth;
    documentRecord.viewMode = previewActive ? 'preview' : 'write';
    if (touch) {
      documentRecord.updatedAt = Date.now();
    }

    return documentRecord;
  }

  function applyDocumentToEditor(documentRecord, { focusWrite = true, restoreCover = true } = {}) {
    if (!documentRecord) return;

    for (const [name, field] of fields) {
      field.value = documentRecord.fields?.[name] || '';
    }
    if (!getFieldValue('date')) {
      setFieldValue('date', getToday());
    }

    coverImage = getLiveAsset(documentRecord.coverImage);
    titleEdited = Boolean(documentRecord.editState?.title);
    titleEditedSlug = Boolean(documentRecord.editState?.slug);
    descriptionEdited = Boolean(documentRecord.editState?.description);
    tagsEdited = Boolean(documentRecord.editState?.tags);
    previewActive = documentRecord.viewMode === 'preview';
    setPaperWidth(documentRecord.paperWidth);
    renderPreviewMode({ focusWrite });
    renderCover();
    renderDocumentsList();
    if (restoreCover) {
      void restoreActiveDocumentCover().then(() => {
        sync({ persist: false });
      });
    }
  }

  function addDocument() {
    saveDraftNow();
    const currentDocument = getActiveDocument();
    const nextDocument = createDefaultDocument({
      paperWidth: currentDocument?.paperWidth || paperWidth,
      viewMode: currentDocument?.viewMode || (previewActive ? 'preview' : 'write')
    });
    documents.push(nextDocument);
    activeDocumentId = nextDocument.id;
    resetEditorHistory();
    applyDocumentToEditor(nextDocument);
    sync();
  }

  async function openPostFiles(files) {
    const markdownFile = findImportMarkdownFile(files);
    if (!markdownFile) {
      showSaveState('Select an index.md file to open');
      return;
    }

    saveDraftNow({ touch: false });
    showSaveState('Opening post folder...');

    try {
      const source = await markdownFile.text();
      const importedPost = await createImportedPost(markdownFile, source, files);

      selectedImages.push(...importedPost.images);
      await saveImportedAssets(importedPost.assets);

      documents.push(importedPost.documentRecord);
      activeDocumentId = importedPost.documentRecord.id;
      coverImage = importedPost.coverImage;
      resetEditorHistory();
      applyDocumentToEditor(importedPost.documentRecord, { focusWrite: false, restoreCover: false });
      renderImages();
      renderCover();
      sync();
      showSaveState('Opened post folder');
    } catch (error) {
      console.error(error);
      showSaveState('Could not open post folder');
    }
  }

  async function openEditablePostFolder() {
    if (!('showDirectoryPicker' in window)) {
      showSaveState('Editable folders need a Chromium browser');
      return;
    }

    try {
      const directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      const permissionGranted = await ensureEditableFolderPermission(directoryHandle);
      if (!permissionGranted) {
        showSaveState('Folder write permission was not granted');
        return;
      }

      const files = await readEditableFolderFiles(directoryHandle);
      const markdownFile = findImportMarkdownFile(files);
      if (!markdownFile) {
        showSaveState('Select a folder with index.md');
        return;
      }

      saveDraftNow({ touch: false });
      showSaveState('Opening editable folder...');

      const source = await markdownFile.text();
      const importedPost = await createImportedPost(markdownFile, source, files);

      selectedImages.push(...importedPost.images);
      await saveImportedAssets(importedPost.assets);

      documents.push(importedPost.documentRecord);
      activeDocumentId = importedPost.documentRecord.id;
      editableFolders.set(importedPost.documentRecord.id, {
        connected: true,
        directoryHandle
      });
      await saveEditableFolderHandle(importedPost.documentRecord.id, directoryHandle);
      coverImage = importedPost.coverImage;
      resetEditorHistory();
      applyDocumentToEditor(importedPost.documentRecord, { focusWrite: false, restoreCover: false });
      renderImages();
      renderCover();
      sync();
      showSaveState('Opened editable folder');
    } catch (error) {
      if (error?.name === 'AbortError') {
        showSaveState('Folder open cancelled');
        return;
      }

      console.error(error);
      showSaveState('Could not open editable folder');
    }
  }

  async function reconnectEditableFolder(documentId, { markConnected = true, silent = false } = {}) {
    const editableFolder = editableFolders.get(documentId);
    if (!editableFolder?.directoryHandle) {
      if (!silent) showSaveState('No editable folder is stored for this post');
      return false;
    }

    try {
      const permissionGranted = await ensureEditableFolderPermission(editableFolder.directoryHandle);
      if (!permissionGranted) {
        editableFolder.connected = false;
        renderDocumentsList();
        if (!silent) showSaveState('Folder write permission was not granted');
        return false;
      }

      if (markConnected) {
        editableFolder.connected = true;
        renderDocumentsList();
      }

      if (!silent) showSaveState('Folder reconnected');
      return true;
    } catch (error) {
      console.error(error);
      editableFolder.connected = false;
      renderDocumentsList();
      if (!silent) showSaveState('Could not reconnect folder');
      return false;
    }
  }

  async function ensureEditableFolderPermission(directoryHandle) {
    const permission = { mode: 'readwrite' };
    if (await directoryHandle.queryPermission(permission) === 'granted') return true;
    return await directoryHandle.requestPermission(permission) === 'granted';
  }

  async function getEditableFolderPermissionState(directoryHandle) {
    try {
      return await directoryHandle.queryPermission({ mode: 'readwrite' });
    } catch {
      return 'prompt';
    }
  }

  async function readEditableFolderFiles(directoryHandle) {
    const files = [];
    await collectEditableFolderFiles(directoryHandle, '', files);
    return files;
  }

  async function collectEditableFolderFiles(directoryHandle, prefix, files) {
    for await (const [name, handle] of directoryHandle.entries()) {
      const relativePath = `${prefix}${name}`;
      if (handle.kind === 'directory') {
        await collectEditableFolderFiles(handle, `${relativePath}/`, files);
        continue;
      }

      if (handle.kind !== 'file') continue;
      const file = await handle.getFile();
      importFileRelativePaths.set(file, relativePath);
      files.push(file);
    }
  }

  async function createImportedPost(markdownFile, source, files) {
    const { body, frontmatter, frontmatterExtras } = parseImportedMarkdown(source);
    const importPlan = createPostImportPlan(frontmatter, body, files, markdownFile);
    const title = String(frontmatter.title || '').trim() || getImportTitleFromFile(markdownFile);
    const slug = String(frontmatter.slug || '').trim() || slugify(title);
    const importedBody = rewriteImportedMarkdownAssetPaths(body.trim(), importPlan.assetPathMap);
    const importedImagePath = importPlan.coverImage?.path || normalizeImportedAssetReference(frontmatter.image);
    const documentRecord = normalizeDocumentRecord({
      coverImage: serializeAssetMetadata(importPlan.coverImage),
      editState: {
        description: true,
        slug: true,
        tags: true,
        title: true
      },
      fields: {
        body: importedBody,
        date: String(frontmatter.date || '').trim() || getToday(),
        description: String(frontmatter.description || ''),
        image: importedImagePath,
        slug,
        tags: formatImportedTags(frontmatter.tags),
        title
      },
      frontmatterExtras,
      id: createDocumentId(),
      paperWidth,
      updatedAt: Date.now(),
      viewMode: previewActive ? 'preview' : 'write'
    });

    return {
      assets: importPlan.assets,
      coverImage: importPlan.coverImage,
      documentRecord,
      images: importPlan.images
    };
  }

  function createPostImportPlan(frontmatter, body, files, markdownFile) {
    const imageFiles = files.filter(isImportImageFile);
    const fileIndex = createImportFileIndex(imageFiles);
    const assetPathMap = new Map();
    const fileAssetMap = new Map();
    const usedNames = new Set([
      coverImage?.name,
      ...selectedImages.map((image) => image.name)
    ].filter(Boolean));

    let importedCoverImage = null;
    const imageReference = String(frontmatter.image || '').trim();
    if (imageReference) {
      const imageFile = resolveImportFileForReference(imageReference, fileIndex, markdownFile);
      if (imageFile) {
        importedCoverImage = getOrCreateImportedAsset(imageFile, imageReference, fileAssetMap, usedNames);
        addImportedAssetPathAlias(assetPathMap, imageReference, importedCoverImage.path);
      }
    }

    for (const imageReference of getImportedMarkdownImageReferences(body)) {
      const imageFile = resolveImportFileForReference(imageReference, fileIndex, markdownFile);
      if (!imageFile) continue;

      const asset = getOrCreateImportedAsset(imageFile, imageReference, fileAssetMap, usedNames);
      addImportedAssetPathAlias(assetPathMap, imageReference, asset.path);
    }

    for (const imageFile of imageFiles) {
      getOrCreateImportedAsset(imageFile, importFileRelativePaths.get(imageFile) || imageFile.name, fileAssetMap, usedNames);
    }

    const assets = Array.from(fileAssetMap.values());
    return {
      assetPathMap,
      assets,
      coverImage: importedCoverImage,
      images: assets.filter((asset) => asset !== importedCoverImage)
    };
  }

  async function saveImportedAssets(assets) {
    await Promise.all(assets.map(async (asset) => {
      try {
        await saveAsset(asset);
      } catch {
        showSaveState('Some imported images could not be saved for refresh');
      }
    }));
  }

  function findImportMarkdownFile(files) {
    const markdownFiles = files.filter((file) => /\.md$/i.test(file.name) || file.type === 'text/markdown');
    return markdownFiles.find((file) => file.name.toLowerCase() === 'index.md') || markdownFiles[0] || null;
  }

  function parseImportedMarkdown(source) {
    const frontmatterMatch = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/.exec(source);
    if (!frontmatterMatch) {
      return {
        body: source,
        frontmatter: {},
        frontmatterExtras: []
      };
    }

    const frontmatterSource = frontmatterMatch[1];
    return {
      body: source.slice(frontmatterMatch[0].length),
      frontmatter: parseImportedFrontmatter(frontmatterSource),
      frontmatterExtras: getImportedExtraFrontmatterLines(frontmatterSource)
    };
  }

  function parseImportedFrontmatter(source) {
    const data = {};
    let listKey = '';

    for (const rawLine of String(source || '').split('\n')) {
      const line = rawLine.trimEnd();
      const listMatch = /^\s*-\s+(.+)$/.exec(line);
      if (listKey && listMatch) {
        data[listKey].push(unquoteImportedYamlValue(listMatch[1]));
        continue;
      }

      const fieldMatch = /^([A-Za-z0-9_-]+):(?:\s*(.*))?$/.exec(line);
      if (!fieldMatch) {
        listKey = '';
        continue;
      }

      const [, key, rawValue = ''] = fieldMatch;
      const value = rawValue.trim();
      if (!value) {
        data[key] = [];
        listKey = key;
        continue;
      }

      data[key] = unquoteImportedYamlValue(value);
      listKey = '';
    }

    return data;
  }

  function getImportedExtraFrontmatterLines(source) {
    const knownKeys = new Set(['date', 'description', 'image', 'slug', 'tags', 'title']);
    const lines = [];
    let shouldKeepBlock = false;

    for (const rawLine of String(source || '').split('\n')) {
      const line = rawLine.trimEnd();
      const fieldMatch = /^([A-Za-z0-9_-]+):/.exec(line);
      if (fieldMatch) {
        shouldKeepBlock = !knownKeys.has(fieldMatch[1]);
      }

      if (shouldKeepBlock && line.trim()) {
        lines.push(line);
      }
    }

    return lines;
  }

  function unquoteImportedYamlValue(value) {
    const trimmed = String(value || '').trim();
    if (trimmed === '[]') return [];
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed.slice(1, -1);
      }
    }
    if (trimmed.startsWith('\'') && trimmed.endsWith('\'')) {
      return trimmed.slice(1, -1).replace(/''/g, '\'');
    }
    return trimmed;
  }

  function createImportFileIndex(files) {
    const index = new Map();

    for (const file of files) {
      const path = getImportFilePath(file);
      if (path && !index.has(path)) {
        index.set(path, file);
      }
    }

    return index;
  }

  function getImportFilePath(file) {
    return normalizeImportPath(importFileRelativePaths.get(file) || file.webkitRelativePath || file.name);
  }

  function resolveImportFileForReference(reference, fileIndex, markdownFile) {
    if (!isImportableAssetReference(reference)) return null;

    const resolvedReferencePath = getImportReferencePath(reference, markdownFile);
    return fileIndex.get(resolvedReferencePath) || null;
  }

  function getImportReferencePath(reference, markdownFile) {
    const referencePath = normalizeImportedAssetReference(reference);
    const markdownPath = getImportFilePath(markdownFile);
    const slashIndex = markdownPath.lastIndexOf('/');
    const markdownDirectory = slashIndex >= 0 ? markdownPath.slice(0, slashIndex) : '';
    return normalizeImportPath(markdownDirectory ? `${markdownDirectory}/${referencePath}` : referencePath);
  }

  function getOrCreateImportedAsset(file, reference, fileAssetMap, usedNames) {
    if (fileAssetMap.has(file)) return fileAssetMap.get(file);

    const referenceFileName = normalizeImportedAssetReference(reference).split('/').pop() || file.name;
    const sourcePath = normalizeImportedAssetReference(reference) || normalizeImportPath(importFileRelativePaths.get(file) || file.name);
    const name = dedupeFileName(sanitizeFileName(referenceFileName), Array.from(usedNames));
    usedNames.add(name);

    const asset = {
      file,
      id: createAssetId(),
      name,
      path: sourcePath || name,
      sourcePath,
      url: URL.createObjectURL(file)
    };
    fileAssetMap.set(file, asset);
    return asset;
  }

  function addImportedAssetPathAlias(assetPathMap, reference, assetPath) {
    const normalizedReference = normalizeImportedAssetReference(reference);
    assetPathMap.set(reference, assetPath);
    assetPathMap.set(normalizedReference, assetPath);
    assetPathMap.set(`./${normalizedReference}`, assetPath);
  }

  function rewriteImportedMarkdownAssetPaths(markdown, assetPathMap) {
    if (!assetPathMap.size) return markdown;

    return markdown.replace(/(!\[[^\]]*]\()([^)]+)(\)(?:\{[^}]*\})?)/g, (match, prefix, path, suffix) => {
      const replacement = assetPathMap.get(path) || assetPathMap.get(normalizeImportedAssetReference(path));
      return replacement ? `${prefix}${replacement}${suffix}` : match;
    });
  }

  function getImportedMarkdownImageReferences(markdown) {
    const references = [];
    const imagePattern = /!\[[^\]]*]\(([^)]+)\)/g;
    for (const match of String(markdown || '').matchAll(imagePattern)) {
      const reference = match[1].trim();
      if (isImportableAssetReference(reference)) {
        references.push(reference);
      }
    }
    return references;
  }

  function normalizeImportedAssetReference(path) {
    const trimmed = String(path || '')
      .trim()
      .replace(/^["']|["']$/g, '')
      .split(/[?#]/)[0];

    return normalizeImportPath(trimmed)
      .replace(/^\.\//, '')
      .replace(/^\/+/, '');
  }

  function normalizeImportPath(path) {
    return String(path || '')
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/')
      .replace(/^\.\//, '');
  }

  function isImportableAssetReference(path) {
    const trimmed = String(path || '').trim();
    return Boolean(trimmed)
      && !/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(trimmed)
      && !/^(?:data|mailto|tel):/i.test(trimmed);
  }

  function isImportImageFile(file) {
    return file.type.startsWith('image/') || /\.(?:png|jpe?g|gif|webp|avif|svg)$/i.test(file.name);
  }

  function formatImportedTags(value) {
    if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean).join(', ');
    return String(value || '');
  }

  function getImportTitleFromFile(file) {
    return file.name
      .replace(/\.md$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim() || 'Untitled post';
  }

  function switchDocument(documentId) {
    if (!documentId || documentId === activeDocumentId) return;

    const nextDocument = documents.find((documentRecord) => documentRecord.id === documentId);
    if (!nextDocument) return;

    saveDraftNow({ touch: false });
    activeDocumentId = nextDocument.id;
    resetEditorHistory();
    applyDocumentToEditor(nextDocument);
    sync({ persist: false });
    saveDraftNow({ touch: false });
  }

  function deleteDocument(documentId) {
    if (!documentId) return;

    const documentIndex = documents.findIndex((documentRecord) => documentRecord.id === documentId);
    if (documentIndex < 0) return;

    const documentRecord = documents[documentIndex];
    const label = getDocumentTitle(documentRecord);
    if (!window.confirm(`Delete "${label}" from this local editor workspace?`)) return;

    documents.splice(documentIndex, 1);
    editableFolders.delete(documentId);
    void deleteEditableFolderHandle(documentId);
    if (!documents.length) {
      documents.push(createDefaultDocument());
    }
    if (activeDocumentId === documentId) {
      activeDocumentId = documents[Math.min(documentIndex, documents.length - 1)].id;
      resetEditorHistory();
      applyDocumentToEditor(getActiveDocument(), { focusWrite: false });
    }
    sync();
  }

  function renderDocumentsList() {
    if (!documentList) return;

    documentList.replaceChildren();
    for (const documentRecord of documents) {
      const row = document.createElement('article');
      row.className = 'document-row';
      row.dataset.active = String(documentRecord.id === activeDocumentId);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'document-switch';
      button.dataset.switchDocument = documentRecord.id;

      const title = document.createElement('strong');
      title.textContent = getDocumentTitle(documentRecord);
      title.title = title.textContent;

      const meta = document.createElement('span');
      meta.className = 'document-meta';

      const updatedAt = document.createElement('time');
      updatedAt.dateTime = new Date(documentRecord.updatedAt || Date.now()).toISOString();
      updatedAt.textContent = formatDocumentEditTime(documentRecord.updatedAt);
      meta.append(updatedAt);

      const editableFolder = editableFolders.get(documentRecord.id);
      if (editableFolder?.connected) {
        const synced = document.createElement('span');
        synced.className = 'document-sync-badge';
        synced.textContent = 'Synced';
        synced.title = 'Saves back to the opened folder.';
        meta.append(synced);
      }

      button.append(title, meta);

      const reconnectButton = editableFolder && !editableFolder.connected
        ? createReconnectFolderButton(documentRecord.id)
        : null;

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'document-delete';
      deleteButton.dataset.deleteDocument = documentRecord.id;
      deleteButton.setAttribute('aria-label', `Delete ${title.textContent}`);
      deleteButton.title = 'Delete document';
      deleteButton.innerHTML = [
        '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">',
        '<path d="M7 21a2 2 0 0 1-2-2V7H4V5h5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1h5v2h-1v12a2 2 0 0 1-2 2H7Zm10-14H7v12h10V7ZM11 9v8H9V9h2Zm4 0v8h-2V9h2ZM11 5h2V4h-2v1Z"></path>',
        '</svg>'
      ].join('');

      row.append(...[button, reconnectButton, deleteButton].filter(Boolean));
      documentList.append(row);
    }
  }

  function createReconnectFolderButton(documentId) {
    const reconnectButton = document.createElement('button');
    reconnectButton.type = 'button';
    reconnectButton.className = 'document-sync-reconnect';
    reconnectButton.dataset.reconnectFolder = documentId;
    reconnectButton.textContent = 'Reconnect';
    reconnectButton.title = 'Reconnect the editable folder.';
    return reconnectButton;
  }

  function getDocumentTitle(documentRecord) {
    return documentRecord?.fields?.title?.trim() || 'Untitled post';
  }

  function formatDocumentEditTime(value) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp)) return 'No edits yet';

    const date = new Date(timestamp);
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    if (sameDay) {
      return `Edited ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }

    return `Edited ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  }

  function resetEditorHistory() {
    undoStack.splice(0, undoStack.length);
    redoStack.splice(0, redoStack.length);
  }

  function handleEditorHistoryShortcut(event) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;

    const key = event.key.toLowerCase();
    if (key === 's') {
      event.preventDefault();
      void saveCurrentDocument();
      return;
    }

    if (key !== 'z') return;

    const action = event.shiftKey ? redoEditorChange : undoEditorChange;
    const stack = event.shiftKey ? redoStack : undoStack;
    if (!stack.length) return;

    event.preventDefault();
    action();
  }

  function recordHistory() {
    if (restoringHistory) return;

    const snapshot = createEditorSnapshot();
    const lastSnapshot = undoStack.at(-1);
    if (lastSnapshot && snapshotsEqual(lastSnapshot, snapshot)) return;

    undoStack.push(snapshot);
    if (undoStack.length > maximumHistoryEntries) {
      undoStack.shift();
    }
    redoStack.splice(0, redoStack.length);
  }

  function undoEditorChange() {
    const snapshot = undoStack.pop();
    if (!snapshot) return;

    redoStack.push(createEditorSnapshot());
    restoreEditorSnapshot(snapshot);
  }

  function redoEditorChange() {
    const snapshot = redoStack.pop();
    if (!snapshot) return;

    undoStack.push(createEditorSnapshot());
    restoreEditorSnapshot(snapshot);
  }

  function createEditorSnapshot() {
    const values = {};
    for (const [name, field] of fields) {
      values[name] = field.value;
    }

    return {
      coverImage,
      editState: {
        description: descriptionEdited,
        slug: titleEditedSlug,
        tags: tagsEdited,
        title: titleEdited
      },
      fields: values,
      images: [...selectedImages],
      paperWidth,
      previewActive
    };
  }

  function restoreEditorSnapshot(snapshot) {
    restoringHistory = true;
    try {
      for (const [name, field] of fields) {
        field.value = snapshot.fields?.[name] || '';
      }
      coverImage = snapshot.coverImage || null;
      selectedImages.splice(0, selectedImages.length, ...(snapshot.images || []));
      titleEdited = Boolean(snapshot.editState?.title);
      titleEditedSlug = Boolean(snapshot.editState?.slug);
      descriptionEdited = Boolean(snapshot.editState?.description);
      tagsEdited = Boolean(snapshot.editState?.tags);
      previewActive = Boolean(snapshot.previewActive);
      setPaperWidth(snapshot.paperWidth);
      renderPreviewMode({ focusWrite: false });
      renderImages();
      renderCover();
      sync();
    } finally {
      restoringHistory = false;
    }
  }

  function snapshotsEqual(first, second) {
    return JSON.stringify(getSnapshotSignature(first)) === JSON.stringify(getSnapshotSignature(second));
  }

  function getSnapshotSignature(snapshot) {
    return {
      coverImage: getAssetSignature(snapshot.coverImage),
      editState: snapshot.editState,
      fields: snapshot.fields,
      images: (snapshot.images || []).map(getAssetSignature),
      paperWidth: snapshot.paperWidth,
      previewActive: snapshot.previewActive
    };
  }

  function getAssetSignature(asset) {
    if (!asset) return null;
    return {
      id: asset.id,
      name: asset.name,
      path: asset.path
    };
  }

  function initializeTheme() {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    const savedTheme = localStorage.getItem(themeStorageKey);
    setTheme(savedTheme || (systemTheme.matches ? 'dark' : 'light'), { persist: false });
    systemTheme.addEventListener('change', (event) => {
      if (localStorage.getItem(themeStorageKey)) return;
      setTheme(event.matches ? 'dark' : 'light', { persist: false });
    });
  }

  function setTheme(theme, { persist }) {
    const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = normalizedTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', normalizedTheme === 'dark' ? '#0f1218' : '#ffffff');
    themeToggle.setAttribute('aria-pressed', String(normalizedTheme === 'dark'));
    themeToggle.textContent = normalizedTheme === 'dark' ? 'Light mode' : 'Dark mode';
    if (persist) {
      localStorage.setItem(themeStorageKey, normalizedTheme);
    }
  }

  function setupPaperResize() {
    for (const handle of paperResizeHandles) {
      handle.addEventListener('dblclick', () => {
        recordHistory();
        setPaperWidth(defaultPaperWidth);
        persistDraft();
      });

      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        recordHistory();
        handle.setPointerCapture(event.pointerId);
        document.body.classList.add('is-resizing-sheet');

        const side = handle.dataset.paperResize === 'right' ? 'right' : 'left';
        const startX = event.clientX;
        const startWidth = paperWidth;

        const handlePointerMove = (moveEvent) => {
          const delta = moveEvent.clientX - startX;
          setPaperWidth(side === 'right' ? startWidth + delta : startWidth - delta);
        };

        const handlePointerUp = () => {
          document.body.classList.remove('is-resizing-sheet');
          persistDraft();
          handle.removeEventListener('pointermove', handlePointerMove);
          handle.removeEventListener('pointerup', handlePointerUp);
          handle.removeEventListener('pointercancel', handlePointerUp);
        };

      handle.addEventListener('pointermove', handlePointerMove);
      handle.addEventListener('pointerup', handlePointerUp);
      handle.addEventListener('pointercancel', handlePointerUp);
    });
    }
  }

  function setPaperWidth(value) {
    paperWidth = clampPaperWidth(value);
    document.documentElement.style.setProperty('--paper-width', `${paperWidth}px`);
    scheduleSidebarAvoidanceUpdate();
    resizeBodyInput();
  }

  function resizeBodyInput() {
    if (previewActive || bodyInput.hidden) return;

    bodyInput.style.height = 'auto';
    bodyInput.style.height = `${bodyInput.scrollHeight}px`;
  }

  function clampPaperWidth(value) {
    return Math.min(maximumPaperWidth, Math.max(minimumPaperWidth, Number.isFinite(Number(value)) ? Number(value) : defaultPaperWidth));
  }

  function scheduleSidebarAvoidanceUpdate() {
    window.cancelAnimationFrame(sidebarAvoidanceFrame);
    sidebarAvoidanceFrame = window.requestAnimationFrame(updateSidebarAvoidance);
  }

  function updateSidebarAvoidance() {
    if (window.matchMedia('(max-width: 1120px)').matches) {
      setSidebarAvoidance(0);
      return;
    }

    setSidebarAvoidance(0);
    const paperRect = paper.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();
    const gap = 24;
    setSidebarAvoidance(Math.max(0, Math.ceil(paperRect.right + gap - sidebarRect.left)));
  }

  function setSidebarAvoidance(value) {
    document.documentElement.style.setProperty('--sidebar-avoidance', `${Math.max(0, value)}px`);
  }

  function revealSidebarTemporarily(delay = 1800) {
    revealSidebar();
    scheduleSidebarFade(delay);
  }

  function handleSheetEdgePointerMove(event) {
    const sheetRect = paper.getBoundingClientRect();
    const revealDistance = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width')) + 110;
    const verticalSlack = 80;
    if (event.clientY < sheetRect.top - verticalSlack || event.clientY > sheetRect.bottom + verticalSlack) {
      return;
    }

    if (event.clientX < sheetRect.left && event.clientX >= sheetRect.left - revealDistance) {
      revealDocumentsSidebarTemporarily();
    } else if (event.clientX > sheetRect.right && event.clientX <= sheetRect.right + revealDistance) {
      revealSidebarTemporarily();
    }
  }

  function revealDocumentsSidebarTemporarily(delay = 1800) {
    revealDocumentsSidebar();
    scheduleDocumentsSidebarFade(delay);
  }

  function revealDocumentsSidebar() {
    window.clearTimeout(documentsRevealTimeout);
    documentsSidebar.classList.remove('is-asleep');
    documentsSidebar.classList.add('is-awake');
  }

  function scheduleDocumentsSidebarFade(delay = 1800) {
    window.clearTimeout(documentsRevealTimeout);
    documentsRevealTimeout = window.setTimeout(() => {
      if (documentsSidebar.matches(':hover, :focus-within')) return;
      documentsSidebar.classList.remove('is-awake');
      documentsSidebar.classList.add('is-asleep');
    }, delay);
  }

  function revealSidebar() {
    window.clearTimeout(sidebarRevealTimeout);
    sidebar.classList.remove('is-asleep');
    sidebar.classList.add('is-awake');
  }

  function scheduleSidebarFade(delay = 1800) {
    window.clearTimeout(sidebarRevealTimeout);
    sidebarRevealTimeout = window.setTimeout(() => {
      if (sidebar.matches(':hover, :focus-within')) return;
      sidebar.classList.remove('is-awake');
      sidebar.classList.add('is-asleep');
    }, delay);
  }

  function revealToolbarTemporarily(delay = 1800) {
    revealToolbar();
    scheduleToolbarFade(delay);
  }

  function revealToolbar() {
    window.clearTimeout(toolbarRevealTimeout);
    toolbar.classList.add('is-awake');
    editorHeader.classList.add('is-awake');
  }

  function scheduleToolbarFade(delay = 1800) {
    window.clearTimeout(toolbarRevealTimeout);
    toolbarRevealTimeout = window.setTimeout(() => {
      if (toolbar.matches(':hover, :focus-within') || editorHeader.matches(':hover, :focus-within')) return;
      toolbar.classList.remove('is-awake');
      editorHeader.classList.remove('is-awake');
    }, delay);
  }

  function updateToolbarScrollState() {
    document.body.classList.toggle('is-editor-at-top', window.scrollY < 8);
  }

  function renderPreviewMode({ focusWrite = true } = {}) {
    previewToggle.setAttribute('aria-pressed', String(previewActive));
    previewToggle.querySelector('span').textContent = previewActive ? 'Write' : 'Preview';
    bodyInput.hidden = previewActive;
    preview.hidden = !previewActive;
    if (previewActive) {
      renderPreview();
    } else if (focusWrite) {
      resizeBodyInput();
      bodyInput.focus();
    } else {
      resizeBodyInput();
    }
  }

  function renderPreview() {
    preview.innerHTML = renderPostPreview();
    attachPreviewTextEditing();
    attachPreviewImageSelection();
    attachPreviewImageResizing();
    attachPreviewImageCropping();
    attachPreviewImageRotation();
    attachPreviewImageActions();
    attachMediaTextEditing();
  }

  function normalizeFieldSmartPunctuation(field, fieldName) {
    if (!smartPunctuationInput.checked) return;
    if (!['body', 'description', 'title'].includes(fieldName)) return;

    const value = field.value;
    const normalized = fieldName === 'body'
      ? replaceMarkdownProseSmartPunctuation(value)
      : replaceStraightSmartPunctuation(value);
    if (normalized === value) return;

    const selectionStart = field.selectionStart;
    const selectionEnd = field.selectionEnd;
    field.value = normalized;
    if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
      field.setSelectionRange(selectionStart, selectionEnd);
    }
  }

  function normalizeSmartPunctuationFields({ record = false } = {}) {
    if (!smartPunctuationInput.checked) return;

    let changed = false;
    for (const fieldName of ['title', 'description', 'body']) {
      const field = fields.get(fieldName);
      if (!field) continue;

      const value = field.value;
      const normalized = fieldName === 'body'
        ? replaceMarkdownProseSmartPunctuation(value)
        : replaceStraightSmartPunctuation(value);
      if (normalized === value) continue;

      if (record && !changed) {
        recordHistory();
      }
      field.value = normalized;
      changed = true;
    }

    if (changed) {
      resizeBodyInput();
    }
  }

  function replaceMarkdownProseSmartPunctuation(value) {
    const lines = String(value).split('\n');
    let inCodeFence = false;
    let openQuote = true;

    return lines.map((line) => {
      if (line.startsWith('```')) {
        inCodeFence = !inCodeFence;
        return line;
      }
      if (inCodeFence) return line;

      let inInlineCode = false;
      let result = '';
      for (const character of line) {
        if (character === '`') {
          inInlineCode = !inInlineCode;
          result += character;
          continue;
        }
        if (!inInlineCode) {
          const replacement = replaceSmartPunctuationCharacter(character, openQuote);
          result += replacement.value;
          openQuote = replacement.openQuote;
        } else {
          result += character;
        }
      }
      return result;
    }).join('\n');
  }

  function replaceStraightSmartPunctuation(value) {
    let openQuote = true;
    let result = '';
    for (const character of String(value)) {
      const replacement = replaceSmartPunctuationCharacter(character, openQuote);
      result += replacement.value;
      openQuote = replacement.openQuote;
    }
    return result;
  }

  function replaceSmartPunctuationCharacter(character, openQuote) {
    if (character === '\'') {
      return { openQuote, value: '’' };
    }
    if (character === '"') {
      return {
        openQuote: !openQuote,
        value: openQuote ? '«' : '»'
      };
    }
    return { openQuote, value: character };
  }

  function renderPostPreview() {
    const title = getFieldValue('title') || 'Untitled post';
    const date = getFieldValue('date') || getToday();
    const description = getFieldValue('description');
    const tags = parseTags(getFieldValue('tags'));
    const cover = getPreviewCover();
    const body = getFieldValue('body');
    const bodyHtml = renderMarkdown(body);
    const tagHtml = tags.length
      ? `<ul class="preview-tags" data-preview-tags>${tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join('')}</ul>`
      : '';
    const coverHtml = cover
      ? `<figure class="preview-cover"><img src="${escapeAttribute(cover.src)}" alt="${escapeAttribute(cover.alt)}"></figure>`
      : '';

    return [
      '<header class="preview-header">',
      `<time datetime="${escapeAttribute(date)}">${escapeHtml(formatDisplayDate(date))}</time>`,
      `<h1 class="preview-title" data-preview-field="title">${escapeHtml(title)}</h1>`,
      description ? `<p class="preview-description" data-preview-field="description">${escapeHtml(description)}</p>` : '',
      tagHtml,
      '</header>',
      coverHtml,
      `<div class="preview-body">${bodyHtml}</div>`
    ].join('');
  }

  function getPreviewCover() {
    if (coverImage?.url) {
      return {
        alt: getFieldValue('title') || 'Post cover',
        src: coverImage.url
      };
    }
    return null;
  }

  function buildMarkdown({ assetPathMap = new Map(), documentRecord = getCurrentDocumentForExport() } = {}) {
    const title = getDocumentFieldValue(documentRecord, 'title') || 'Untitled post';
    const slug = getDocumentFieldValue(documentRecord, 'slug') || slugify(title) || 'untitled-post';
    const date = getDocumentFieldValue(documentRecord, 'date') || getToday();
    const description = getDocumentFieldValue(documentRecord, 'description');
    const image = getMappedAssetPath(getDocumentFieldValue(documentRecord, 'image'), assetPathMap);
    const tags = parseTags(getDocumentFieldValue(documentRecord, 'tags'));
    const body = rewriteMarkdownAssetPaths(getDocumentFieldValue(documentRecord, 'body').trim(), assetPathMap);
    const frontmatter = [
      '---',
      `title: ${quoteYaml(title)}`,
      `date: ${date}`,
      `description: ${quoteYaml(description)}`,
      `slug: ${quoteYaml(slug)}`
    ];

    if (image) {
      frontmatter.push(`image: ${quoteYaml(image)}`);
    }

    for (const line of documentRecord.frontmatterExtras || []) {
      if (line.trim()) {
        frontmatter.push(line);
      }
    }

    if (tags.length) {
      frontmatter.push('tags:');
      for (const tag of tags) {
        frontmatter.push(`  - ${quoteYaml(tag)}`);
      }
    } else {
      frontmatter.push('tags: []');
    }

    frontmatter.push('---');
    return `${frontmatter.join('\n')}\n\n${body}\n`;
  }

  async function createPostZip() {
    const documentRecord = getCurrentDocumentForExport();
    const folderName = getPostFolderName(documentRecord);
    return createZip(await createPostZipFilesForDocument(documentRecord, folderName));
  }

  async function createAllPostsZip() {
    const documentRecords = getDocumentsForExport();
    const usedFolders = new Set();
    const files = [];

    for (const documentRecord of documentRecords) {
      const folderName = dedupeFolderName(getPostFolderName(documentRecord), usedFolders);
      usedFolders.add(folderName);
      files.push(...await createPostZipFilesForDocument(documentRecord, folderName));
    }

    return createZip(files);
  }

  async function createPostZipFilesForDocument(documentRecord, folderName) {
    const assetFiles = await getUniqueAssetFiles([documentRecord]);
    const assetPathMap = createExportAssetPathMap(assetFiles);
    const files = [{
      data: textEncoder.encode(buildMarkdown({ assetPathMap, documentRecord })),
      path: `docs/src/content/blog/${folderName}/index.md`
    }];

    for (const asset of assetFiles) {
      const mappedPath = getMappedAssetPath(asset.path, assetPathMap);
      const assetPath = normalizePostAssetPath(mappedPath);
      files.push({
        data: new Uint8Array(await asset.file.arrayBuffer()),
        path: `docs/src/content/blog/${folderName}/${assetPath}`
      });
    }

    return files;
  }

  async function writePostToEditableFolder(documentRecord, directoryHandle) {
    const files = await createEditableFolderPostFiles(documentRecord, directoryHandle);

    for (const file of files) {
      try {
        await writeFileToEditableFolder(directoryHandle, file.path, file.data);
      } catch (error) {
        logEditorError('Could not write a blog post file to the editable folder.', error, {
          path: file.path,
          size: file.data.byteLength
        });
        throw error;
      }
    }
  }

  async function createEditableFolderPostFiles(documentRecord, directoryHandle = editableFolders.get(documentRecord.id)?.directoryHandle) {
    const assetFiles = await getUniqueAssetFiles([documentRecord]);
    const assetPathMap = createEditableFolderAssetPathMap(assetFiles);
    const files = [{
      data: textEncoder.encode(buildMarkdown({ assetPathMap, documentRecord })),
      path: 'index.md'
    }];

    for (const asset of assetFiles) {
      const mappedPath = getMappedAssetPath(asset.path, assetPathMap);
      files.push({
        data: await readAssetForEditableFolder(asset, directoryHandle),
        path: normalizePostAssetPath(mappedPath)
      });
    }

    return files;
  }

  async function readAssetForEditableFolder(asset, directoryHandle) {
    const sourcePath = normalizePostAssetPath(asset.sourcePath);
    if (directoryHandle && sourcePath) {
      try {
        const sourceFile = await readEditableFolderFile(directoryHandle, sourcePath);
        if (!isImportImageFile(sourceFile)) {
          throw new Error(`Editable folder asset is not an image: ${sourcePath}`);
        }
        return new Uint8Array(await sourceFile.arrayBuffer());
      } catch (error) {
        logEditorError('Could not read a blog post asset from its exact editable folder path.', error, {
          name: asset.name,
          outputPath: asset.path,
          sourcePath
        });
        throw error;
      }
    }

    try {
      return new Uint8Array(await asset.file.arrayBuffer());
    } catch (error) {
      logEditorError('Could not read a blog post asset before saving to the editable folder.', error, {
        name: asset.name,
        path: asset.path,
        sourcePath: asset.sourcePath
      });
      throw error;
    }
  }

  function createEditableFolderAssetPathMap(assets) {
    const map = new Map();
    for (const asset of assets) {
      const sourcePath = normalizePostAssetPath(asset.sourcePath || asset.path);
      addAssetPathAliases(map, asset, `./${sourcePath}`);
    }
    return map;
  }

  async function writeFileToEditableFolder(directoryHandle, path, data) {
    const parts = normalizePostAssetPath(path).split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) return;

    let currentDirectory = directoryHandle;
    for (const part of parts) {
      currentDirectory = await currentDirectory.getDirectoryHandle(part, { create: true });
    }

    const fileHandle = await currentDirectory.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(data);
      await writable.close();
    } catch (error) {
      await writable.abort().catch((abortError) => {
        logEditorError('Could not abort a failed editable folder file write.', abortError, {
          path
        });
      });
      throw error;
    }
  }

  async function getUniqueAssetFiles(documentRecords) {
    const assets = [];
    const seenPaths = new Set();

    for (const documentRecord of documentRecords) {
      const requestedAssetPaths = getReferencedBodyAssetPaths(documentRecord);
      const imagePath = getDocumentFieldValue(documentRecord, 'image');
      if (isImportableAssetReference(imagePath)) {
        requestedAssetPaths.add(imagePath);
      }

      for (const assetPath of requestedAssetPaths) {
        const asset = await resolveAssetForPath(assetPath, documentRecord);
        if (!asset) throw new Error(`Could not bundle image: ${assetPath}`);
        addAsset(asset);
      }
    }

    return assets;

    function addAsset(asset) {
      if (!asset || seenPaths.has(asset.path)) return;
      seenPaths.add(asset.path);
      assets.push(asset);
    }
  }

  async function resolveAssetForPath(path, documentRecord) {
    const liveAsset = getLiveAsset({ path });
    if (liveAsset) return liveAsset;

    const coverMetadata = documents
      .map((documentRecord) => documentRecord.coverImage)
      .find((metadata) => assetMatchesPath(metadata, path));
    if (coverMetadata) {
      const restoredAsset = await restoreSavedAsset(coverMetadata);
      if (restoredAsset) return restoredAsset;
    }

    return await restoreAssetFromEditableFolder(path, documentRecord);
  }

  async function restoreAssetFromEditableFolder(path, documentRecord) {
    const editableFolder = editableFolders.get(documentRecord.id);
    if (!editableFolder?.directoryHandle) return null;

    try {
      const imageFile = await readEditableFolderFile(editableFolder.directoryHandle, path);
      if (!isImportImageFile(imageFile)) return null;

      const asset = createEditableFolderAsset(imageFile, normalizePostAssetPath(path));
      trackRecoveredEditableAsset(asset, documentRecord, path);
      await saveAsset(asset);
      return asset;
    } catch (error) {
      logEditorError('Could not restore a referenced image from the editable folder.', error, {
        documentId: documentRecord.id,
        path
      });
      return null;
    }
  }

  async function readEditableFolderFile(directoryHandle, path) {
    const normalizedPath = normalizePostAssetPath(path);
    const parts = normalizedPath.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) throw new Error(`Missing editable folder file path: ${path}`);

    let currentDirectory = directoryHandle;
    for (const part of parts) {
      currentDirectory = await currentDirectory.getDirectoryHandle(part);
    }

    const fileHandle = await currentDirectory.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    importFileRelativePaths.set(file, normalizedPath);
    return file;
  }

  function createEditableFolderAsset(file, reference) {
    const sourcePath = normalizeImportPath(importFileRelativePaths.get(file) || file.webkitRelativePath || file.name);
    const referencePath = normalizeImportedAssetReference(reference) || normalizeImportedAssetReference(sourcePath);
    const referenceFileName = referencePath.split('/').pop() || sourcePath.split('/').pop() || file.name;
    const name = dedupeFileName(sanitizeFileName(referenceFileName), getCurrentAssetNames());
    return {
      file,
      id: createAssetId(),
      name,
      path: referencePath || name,
      sourcePath,
      url: URL.createObjectURL(file)
    };
  }

  function getCurrentAssetNames() {
    return [
      coverImage?.name,
      ...selectedImages.map((image) => image.name)
    ].filter(Boolean);
  }

  function trackRecoveredEditableAsset(asset, documentRecord, reference) {
    if (getLiveAsset({ path: asset.path }) || getLiveAsset({ path: asset.sourcePath })) return;

    const imagePath = getDocumentFieldValue(documentRecord, 'image');
    if (normalizePostAssetPath(imagePath) === normalizePostAssetPath(reference)) {
      documentRecord.coverImage = serializeAssetMetadata(asset);
      if (documentRecord.id === activeDocumentId) {
        coverImage = asset;
        renderCover();
      }
      return;
    }

    selectedImages.push(asset);
    renderImages();
  }

  function getReferencedBodyAssetPaths(documentRecord) {
    const paths = new Set();
    const body = getDocumentFieldValue(documentRecord, 'body');
    const imagePattern = /!\[[^\]]*]\(([^)]+)\)/g;

    for (const match of body.matchAll(imagePattern)) {
      const path = match[1].trim();
      if (isImportableAssetReference(path)) {
        paths.add(path);
      }
    }

    return paths;
  }

  function getCurrentDocumentForExport() {
    return updateActiveDocumentFromEditor({ touch: false }) || getActiveDocument() || createDefaultDocument();
  }

  function getDocumentForExportById(documentId) {
    updateActiveDocumentFromEditor({ touch: false });
    return documents.find((documentRecord) => documentRecord.id === documentId) || null;
  }

  function getDocumentsForExport() {
    updateActiveDocumentFromEditor({ touch: false });
    return documents.length ? documents : [getCurrentDocumentForExport()];
  }

  function getDocumentFieldValue(documentRecord, name) {
    return documentRecord?.fields?.[name]?.trim?.() || '';
  }

  function createRandomizedAssetPathMap(assets) {
    const map = new Map();
    const usedNames = new Set();
    for (const asset of assets) {
      const randomizedName = createRandomizedAssetFileName(asset.name, usedNames);
      map.set(asset.path, randomizedName);
      usedNames.add(randomizedName);
    }
    return map;
  }

  function createExportAssetPathMap(assets, { randomize = randomizeImageNamesInput.checked } = {}) {
    const localPathMap = randomize ? createRandomizedAssetPathMap(assets) : new Map();
    const map = new Map();

    for (const asset of assets) {
      const fileName = localPathMap.get(asset.path) || asset.name;
      addAssetPathAliases(map, asset, `./${fileName}`);
    }

    return map;
  }

  function addAssetPathAliases(map, asset, outputPath) {
    for (const candidate of [asset.path, asset.sourcePath]) {
      const alias = normalizePostAssetPath(candidate);
      if (!alias) continue;

      map.set(alias, outputPath);
      map.set(`./${alias}`, outputPath);
    }
  }

  function normalizePostAssetPath(path) {
    return String(path || '')
      .replace(/^\.\//, '')
      .replace(/^\/+/, '');
  }

  function createRandomizedAssetFileName(fileName, usedNames) {
    const extension = getFileExtension(fileName);
    let name = '';
    do {
      name = `${createShortRandomId()}${extension}`;
    } while (usedNames.has(name));
    return name;
  }

  function createShortRandomId() {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function getMappedAssetPath(path, assetPathMap) {
    return assetPathMap.get(path) || path;
  }

  function rewriteMarkdownAssetPaths(markdown, assetPathMap) {
    if (!assetPathMap.size) return markdown;

    return markdown.replace(/(!\[[^\]]*]\()([^)]+)(\)(?:\{[^}]*\})?)/g, (match, prefix, path, suffix) => {
      return assetPathMap.has(path) ? `${prefix}${assetPathMap.get(path)}${suffix}` : match;
    });
  }

  function insertFormatting(type) {
    if (previewActive) {
      if (applyPreviewFormatting(type)) {
        return;
      }
      previewActive = false;
      renderPreviewMode();
    }

    const selection = getSelectionRange(bodyInput);
    const selected = bodyInput.value.slice(selection.start, selection.end);
    const snippets = {
      bold: `**${selected || 'bold text'}**`,
      code: selected.includes('\n') ? `\`\`\`\n${selected || 'code'}\n\`\`\`` : `\`${selected || 'code'}\``,
      heading: `## ${selected || 'Section heading'}`,
      image: `![${selected || 'Alt text'}](${getDefaultImagePath()})`,
      italic: `*${selected || 'italic text'}*`,
      link: `[${selected || 'Link text'}](https://example.com)`,
      list: selected ? selected.split('\n').map((line) => `- ${line}`).join('\n') : '- List item',
      quote: selected ? selected.split('\n').map((line) => `> ${line}`).join('\n') : '> Quote'
    };

    recordHistory();
    replaceSelection(bodyInput, snippets[type] || selected);
    sync();
    scheduleAiMetadata();
  }

  function applyPreviewFormatting(type) {
    const selectionRange = getPreviewSelectionSourceRange();
    if (!selectionRange) return false;

    const {
      absoluteEnd,
      absoluteStart,
      body,
      selection,
      sourceEnd,
      sourceStart
    } = selectionRange;

    let updatedBody = '';
    if (type === 'bold') {
      updatedBody = toggleMarkdownWrapper(body, absoluteStart, absoluteEnd, '**');
    } else if (type === 'italic') {
      updatedBody = toggleMarkdownWrapper(body, absoluteStart, absoluteEnd, '*');
    } else if (type === 'code') {
      updatedBody = toggleMarkdownWrapper(body, absoluteStart, absoluteEnd, '`');
    } else if (type === 'link') {
      updatedBody = toggleMarkdownLink(body, absoluteStart, absoluteEnd);
    } else if (type === 'heading') {
      updatedBody = toggleHeadingBlock(body, sourceStart, sourceEnd);
    } else if (type === 'quote') {
      updatedBody = toggleLinePrefix(body, sourceStart, sourceEnd, '> ');
    } else if (type === 'list') {
      updatedBody = toggleLinePrefix(body, sourceStart, sourceEnd, '- ');
    } else {
      return false;
    }

    if (!updatedBody || updatedBody === body) return false;

    recordHistory();
    setFieldValue('body', updatedBody);
    selection.removeAllRanges();
    sync();
    scheduleAiMetadata();
    return true;
  }

  function getPreviewSelectionSourceRange() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

    const range = selection.getRangeAt(0);
    const previewBody = preview.querySelector('.preview-body');
    if (!previewBody || !nodeContains(previewBody, range.startContainer) || !nodeContains(previewBody, range.endContainer)) {
      return null;
    }

    if (getElement(range.startContainer)?.closest('.preview-media-copy') || getElement(range.endContainer)?.closest('.preview-media-copy')) {
      return null;
    }

    const sourceElement = getSourceElement(range.startContainer);
    if (!sourceElement || sourceElement !== getSourceElement(range.endContainer)) {
      return null;
    }

    const selectedText = selection.toString();
    if (!selectedText.trim()) return null;

    const sourceStart = Number(sourceElement.dataset.sourceStart);
    const sourceEnd = Number(sourceElement.dataset.sourceEnd);
    const body = fields.get('body')?.value || '';
    const renderedStart = getRenderedOffset(sourceElement, range.startContainer, range.startOffset);
    const renderedEnd = getRenderedOffset(sourceElement, range.endContainer, range.endOffset);
    const sourceRange = findRenderedSelectionInSource(body.slice(sourceStart, sourceEnd), selectedText, renderedStart, renderedEnd);
    if (!sourceRange) return null;

    return {
      absoluteEnd: sourceStart + sourceRange.end,
      absoluteStart: sourceStart + sourceRange.start,
      body,
      selection,
      sourceEnd,
      sourceStart
    };
  }

  function setCoverFile(file) {
    if (coverImage?.url) URL.revokeObjectURL(coverImage.url);

    const name = dedupeFileName(sanitizeFileName(file.name), selectedImages.map((image) => image.name));
    coverImage = {
      file,
      id: createAssetId(),
      name,
      path: name,
      url: URL.createObjectURL(file)
    };
    void saveAsset(coverImage).catch(() => {
      showSaveState('Cover image could not be saved for refresh');
    });
    setFieldValue('image', coverImage.path);
    renderCover();
  }

  function addImageFile(file) {
    if (!file.type.startsWith('image/')) return null;

    const usedNames = [
      coverImage?.name,
      ...selectedImages.map((image) => image.name)
    ].filter(Boolean);
    const name = dedupeFileName(sanitizeFileName(file.name), usedNames);
    const image = {
      file,
      id: createAssetId(),
      name,
      path: name,
      url: URL.createObjectURL(file)
    };
    selectedImages.push(image);
    void saveAsset(image).catch(() => {
      showSaveState('Image could not be saved for refresh');
    });
    return image;
  }

  function insertDroppedImages(files) {
    if (previewActive) {
      previewActive = false;
      renderPreviewMode();
    }

    const snippets = [];
    for (const file of files) {
      const image = addImageFile(file);
      if (image) {
        snippets.push(`![${getImageAltText(image.name)}](${image.path})`);
      }
    }

    if (!snippets.length) return;

    recordHistory();
    replaceSelection(bodyInput, snippets.join('\n\n'));
    renderImages();
    sync();
    scheduleAiMetadata();
  }

  function setupImageDropZone(dropZone, options) {
    if (!dropZone) return;

    let dragDepth = 0;

    dropZone.addEventListener('dragenter', (event) => {
      if (!hasImageDrag(event)) return;
      event.preventDefault();
      dragDepth += 1;
      dropZone.classList.add('is-dragging');
    });

    dropZone.addEventListener('dragover', (event) => {
      if (!hasImageDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });

    dropZone.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        dropZone.classList.remove('is-dragging');
      }
    });

    dropZone.addEventListener('drop', (event) => {
      const files = getDroppedImages(event.dataTransfer, options.multiple);
      event.preventDefault();
      dragDepth = 0;
      dropZone.classList.remove('is-dragging');
      if (!files.length) return;
      options.onFiles(files);
    });
  }

  function hasImageDrag(event) {
    const types = Array.from(event.dataTransfer?.types || []);
    return types.includes('Files');
  }

  function getDroppedImages(dataTransfer, multiple) {
    const files = Array.from(dataTransfer?.files || [])
      .filter((file) => file.type.startsWith('image/'));
    return multiple ? files : files.slice(0, 1);
  }

  function getClipboardImages(dataTransfer) {
    return Array.from(dataTransfer?.files || [])
      .filter((file) => file.type.startsWith('image/'));
  }

  function handlePreviewImagePaste(event) {
    if (!previewActive || isEditableTarget(event.target)) return;

    const frame = getSelectedPreviewImageFrame();
    if (!frame) return;

    const [file] = getClipboardImages(event.clipboardData);
    if (!file) return;

    event.preventDefault();
    replacePreviewImage(frame, file);
  }

  function handlePreviewPointerDown(event) {
    const target = getElement(event.target);
    if (target?.closest('.preview-image-frame')) return;
    clearPreviewImageSelection();
  }

  function getImageAltText(fileName) {
    return fileName
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim() || 'Image';
  }

  function renderCover() {
    const imageFieldValue = getFieldValue('image');
    coverStatus.textContent = coverImage ? 'Ready' : imageFieldValue ? 'Path only' : 'No cover';
    coverPreview.hidden = !coverImage;

    if (!coverImage) return;

    coverPreview.querySelector('img').src = coverImage.url;
    coverPath.textContent = coverImage.path;
  }

  function renderImages() {
    imageList.replaceChildren();
    for (const image of selectedImages) {
      const row = imageTemplate.content.firstElementChild.cloneNode(true);
      const thumbnail = row.querySelector('img');
      const name = row.querySelector('[data-image-name]');
      const path = row.querySelector('[data-image-path]');
      const insert = row.querySelector('[data-insert-image]');
      const insertInline = row.querySelector('[data-insert-inline-image]');
      const download = row.querySelector('[data-download-image]');

      thumbnail.src = image.url;
      thumbnail.alt = '';
      name.textContent = image.name;
      path.textContent = image.path;
      insert.addEventListener('click', () => {
        if (previewActive) {
          previewActive = false;
          renderPreviewMode();
        }
        recordHistory();
        replaceSelection(bodyInput, `![Alt text](${image.path})`);
        sync();
      });
      insertInline.addEventListener('click', () => {
        if (previewActive) {
          previewActive = false;
          renderPreviewMode();
        }
        recordHistory();
        replaceSelection(bodyInput, `![Alt text](${image.path}){display=inline}`);
        sync();
      });
      download.href = image.url;
      download.download = image.name;

      imageList.append(row);
    }
  }

  async function startAiMetadataAutomatically() {
    if (aiStartupAttempted) return;
    aiStartupAttempted = true;

    if (!('Summarizer' in self)) {
      setAiStatus('Chrome built-in AI is not available in this browser.');
      return;
    }

    await enableAiMetadata({ manual: false });
  }

  async function enableAiMetadata({ manual, schedule = true }) {
    if (aiEnabled) {
      if (schedule) scheduleAiMetadata();
      return true;
    }

    if (!('Summarizer' in self)) {
      setAiStatus('Chrome built-in AI is not available in this browser.');
      return false;
    }

    try {
      setAiStatus(manual ? 'Checking Chrome AI...' : 'Starting Chrome AI...');
      const availability = await Summarizer.availability();
      if (availability === 'unavailable') {
        setAiStatus('Chrome built-in AI is unavailable here.');
        return;
      }

      summarizer = await Summarizer.create({
        format: 'plain-text',
        length: 'short',
        sharedContext: capitalize(appConfig.metadataContext),
        type: 'tldr',
        monitor(monitor) {
          monitor.addEventListener('downloadprogress', (event) => {
            setAiStatus(`Downloading Chrome AI model ${Math.round(event.loaded * 100)}%...`);
          });
        }
      });

      languageSession = await createLanguageModelSession();
      aiEnabled = true;
      setAiStatus(languageSession ? 'Chrome AI ready.' : 'Chrome AI ready for descriptions.');
      aiEnableButton.textContent = 'Refresh metadata';
      if (schedule) scheduleAiMetadata(0);
      return true;
    } catch (error) {
      setAiStatus(`Chrome AI could not start: ${error?.message || 'unknown error'}`);
      return false;
    }
  }

  async function createLanguageModelSession() {
    if (!('LanguageModel' in self)) return null;

    try {
      const availability = await LanguageModel.availability({
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }]
      });
      if (availability === 'unavailable') return null;

      return await LanguageModel.create({
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
        initialPrompts: [{
          content: 'You suggest concise blog metadata. Return only the requested values.',
          role: 'system'
        }]
      });
    } catch {
      return null;
    }
  }

  function scheduleAiMetadata(delay = 1800) {
    window.clearTimeout(aiTimer);
    if (!aiEnabled || aiBusy) return;
    aiTimer = window.setTimeout(() => {
      void updateAiMetadata();
    }, delay);
  }

  async function updateAiMetadata() {
    if (!aiEnabled || !summarizer || aiBusy) return;

    const bodyText = stripMarkdown(getFieldValue('body'));
    if (bodyText.length < 80) {
      setAiStatus('Chrome AI ready. Write more text for suggestions.');
      return;
    }

    const source = getAiMetadataSource(bodyText);
    if (source === lastAiSource) return;
    lastAiSource = source;
    aiBusy = true;
    let recordedHistory = false;
    const ensureHistory = () => {
      if (recordedHistory) return;
      recordHistory();
      recordedHistory = true;
    };

    try {
      setAiStatus('Updating metadata...');
      if (!titleEdited && !getFieldValue('title')) {
        const title = await suggestTitle(source);
        if (title) {
          ensureHistory();
          setFieldValue('title', title);
          if (!titleEditedSlug) {
            setFieldValue('slug', slugify(title));
          }
        }
      }

      if (bodyText.length < 240) {
        sync();
        setAiStatus('Title suggested. Write more text for description and tags.');
        return;
      }

      if (!descriptionEdited) {
        const summary = await summarizer.summarize(bodyText, {
          context: `Summarize this ${appConfig.metadataContext} in one clear sentence. Title: ${getFieldValue('title') || 'Untitled post'}`
        });
        ensureHistory();
        setFieldValue('description', cleanAiDescription(summary));
      }

      if (!tagsEdited) {
        const tags = await suggestTags(source);
        if (tags.length) {
          ensureHistory();
          setFieldValue('tags', tags.join(', '));
        }
      }

      sync();
      setAiStatus('Metadata updated.');
    } catch (error) {
      setAiStatus(`Chrome AI metadata failed: ${error?.message || 'unknown error'}`);
    } finally {
      aiBusy = false;
    }
  }

  async function regenerateAiMetadataField(fieldName, button) {
    if (!['title', 'description', 'tags'].includes(fieldName)) return;
    if (aiBusy) {
      setAiStatus('Chrome AI is already updating metadata.');
      return;
    }

    window.clearTimeout(aiTimer);
    const ready = await enableAiMetadata({ manual: true, schedule: false });
    if (!ready || !summarizer) return;

    const bodyText = stripMarkdown(getFieldValue('body'));
    if (bodyText.length < 80) {
      setAiStatus('Write more text before regenerating metadata.');
      return;
    }

    setMetadataButtonBusy(button, true);
    aiBusy = true;
    try {
      setAiStatus(`Regenerating ${fieldName}...`);
      const source = getAiMetadataSource(bodyText);
      recordHistory();

      if (fieldName === 'title') {
        const title = await suggestTitle(source);
        if (title) {
          setFieldValue('title', title);
          titleEdited = true;
          if (!titleEditedSlug) {
            setFieldValue('slug', slugify(title));
          }
        }
      } else if (fieldName === 'description') {
        const summary = await summarizer.summarize(bodyText, {
          context: `Summarize this ${appConfig.metadataContext} in one clear sentence. Title: ${getFieldValue('title') || 'Untitled post'}`
        });
        setFieldValue('description', cleanAiDescription(summary));
        descriptionEdited = true;
      } else {
        const tags = await suggestTags(source);
        if (tags.length) {
          setFieldValue('tags', tags.join(', '));
          tagsEdited = true;
        }
      }

      lastAiSource = source;
      sync();
      setAiStatus(`${capitalize(fieldName)} regenerated.`);
    } catch (error) {
      setAiStatus(`Chrome AI ${fieldName} failed: ${error?.message || 'unknown error'}`);
    } finally {
      aiBusy = false;
      setMetadataButtonBusy(button, false);
    }
  }

  function getAiMetadataSource(bodyText) {
    return `${getFieldValue('title')}\n${bodyText.slice(0, 5000)}`;
  }

  function setMetadataButtonBusy(button, busy) {
    if (!button) return;
    button.classList.toggle('is-busy', busy);
    button.disabled = busy;
  }

  async function suggestTitle(source) {
    if (languageSession) {
      try {
        const response = await languageSession.prompt([
          {
            content: [
              'Suggest one concise public blog post title.',
              'Return only the title, with no quotes, punctuation wrapper, or explanation.',
              'Keep it under 70 characters.',
              source.slice(0, 4200)
            ].join('\n\n'),
            role: 'user'
          }
        ]);
        const title = cleanAiTitle(response);
        if (title) return title;
      } catch {
        languageSession = null;
      }
    }

    return suggestLocalTitle(source);
  }

  async function suggestTags(source) {
    if (languageSession) {
      try {
        const response = await languageSession.prompt([
          {
            content: [
              'Suggest 3 to 5 lowercase tags for this blog post.',
              'Return only comma-separated tags, no explanation.',
              source.slice(0, 4200)
            ].join('\n\n'),
            role: 'user'
          }
        ]);
        const tags = parseTags(response).slice(0, 5);
        if (tags.length) return tags;
      } catch {
        languageSession = null;
      }
    }

    return suggestLocalTags(source);
  }

  function suggestLocalTags(source) {
    const normalized = source.toLowerCase();
    const candidates = [
      ['release', /\b(release|version|update|shipping|published)\b/],
      ['playground', /\b(playground|game|chess|lobby|invite)\b/],
      ['translation', /\b(translate|translation|language)\b/],
      ['inbox', /\b(inbox|mention|keyword|alert)\b/],
      ['popup', /\b(popup|settings|bookmark|status)\b/],
      ['docs', /\b(docs|website|walkthrough|blog)\b/]
    ];
    const tags = candidates
      .filter(([, pattern]) => pattern.test(normalized))
      .map(([tag]) => tag);
    return tags.length ? tags.slice(0, 5) : ['update'];
  }

  function suggestLocalTitle(source) {
    const body = getFieldValue('body');
    const heading = /^#{1,3}\s+(.+)$/m.exec(body);
    if (heading) {
      return cleanAiTitle(heading[1]);
    }

    return cleanAiTitle(stripMarkdown(source).split(/[.!?]/)[0]);
  }

  function setAiStatus(text) {
    aiStatus.textContent = text;
  }

  function capitalize(value) {
    return String(value || '').replace(/^./, (character) => character.toUpperCase());
  }

  function getDefaultImagePath() {
    return 'image.png';
  }

  function getSelectionRange(input) {
    return {
      end: input.selectionEnd || 0,
      start: input.selectionStart || 0
    };
  }

  function nodeContains(root, node) {
    const element = getElement(node);
    return Boolean(element && (element === root || root.contains(element)));
  }

  function getElement(node) {
    if (!node) return null;
    return node.nodeType === 1 ? node : node.parentElement;
  }

  function isEditableTarget(target) {
    const element = getElement(target);
    return Boolean(element?.closest('input, textarea, [contenteditable="true"]'));
  }

  function getSourceElement(node) {
    return getElement(node)?.closest('[data-source-start][data-source-end]') || null;
  }

  function getRenderedOffset(root, container, offset) {
    const range = document.createRange();
    range.setStart(root, 0);
    range.setEnd(container, offset);
    return range.toString().length;
  }

  function findRenderedSelectionInSource(source, selectedText, renderedStart, renderedEnd) {
    const mapped = createRenderedTextSourceMap(source);
    const expectedText = mapped.text.slice(renderedStart, renderedEnd);
    const textIndex = expectedText === selectedText
      ? renderedStart
      : mapped.text.indexOf(selectedText);
    if (textIndex < 0) return null;

    const start = mapped.sourceIndexes[textIndex];
    const lastIndex = mapped.sourceIndexes[textIndex + selectedText.length - 1];
    if (!Number.isInteger(start) || !Number.isInteger(lastIndex)) return null;

    return {
      end: lastIndex + 1,
      start
    };
  }

  function createRenderedTextSourceMap(source) {
    let text = '';
    const sourceIndexes = [];
    let index = getBlockContentStart(source);

    while (index < source.length) {
      if (source.startsWith('![', index)) {
        const imageEnd = getMarkdownInlineEnd(source, index);
        if (imageEnd > index) {
          index = imageEnd;
          continue;
        }
      }

      if (source[index] === '[') {
        const link = getMarkdownLinkRange(source, index);
        if (link) {
          for (let cursor = link.labelStart; cursor < link.labelEnd; cursor += 1) {
            text += source[cursor];
            sourceIndexes.push(cursor);
          }
          index = link.end;
          continue;
        }
      }

      if (source.startsWith('**', index)) {
        index += 2;
        continue;
      }

      if (source[index] === '*' || source[index] === '`') {
        index += 1;
        continue;
      }

      text += source[index];
      sourceIndexes.push(index);
      index += 1;
    }

    return {
      sourceIndexes,
      text
    };
  }

  function getBlockContentStart(source) {
    const heading = /^(#{1,3})\s+/.exec(source);
    if (heading) return heading[0].length;
    if (source.startsWith('- ') || source.startsWith('> ')) return 2;
    return 0;
  }

  function getMarkdownInlineEnd(source, start) {
    const closeBracket = source.indexOf(']', start + 2);
    if (closeBracket < 0 || source[closeBracket + 1] !== '(') return -1;

    const closeParen = source.indexOf(')', closeBracket + 2);
    return closeParen < 0 ? -1 : closeParen + 1;
  }

  function getMarkdownLinkRange(source, start) {
    const closeBracket = source.indexOf(']', start + 1);
    if (closeBracket < 0 || source[closeBracket + 1] !== '(') return null;

    const closeParen = source.indexOf(')', closeBracket + 2);
    if (closeParen < 0) return null;

    return {
      end: closeParen + 1,
      labelEnd: closeBracket,
      labelStart: start + 1
    };
  }

  function toggleMarkdownWrapper(source, start, end, wrapper) {
    const wrapperStart = start - wrapper.length;
    const hasWrapper = hasExactMarkdownWrapper(source, start, end, wrapper);

    if (hasWrapper) {
      return `${source.slice(0, wrapperStart)}${source.slice(start, end)}${source.slice(end + wrapper.length)}`;
    }

    return `${source.slice(0, start)}${wrapper}${source.slice(start, end)}${wrapper}${source.slice(end)}`;
  }

  function hasExactMarkdownWrapper(source, start, end, wrapper) {
    const wrapperStart = start - wrapper.length;
    if (wrapperStart < 0) return false;
    if (source.slice(wrapperStart, start) !== wrapper) return false;
    if (source.slice(end, end + wrapper.length) !== wrapper) return false;

    if (wrapper === '*') {
      return source[wrapperStart - 1] !== '*' && source[end + wrapper.length] !== '*';
    }

    return true;
  }

  function toggleMarkdownLink(source, start, end) {
    const linkStart = start - 1;
    const linkSuffixStart = end;
    if (source[linkStart] === '[' && source.slice(linkSuffixStart, linkSuffixStart + 2) === '](') {
      const linkEnd = source.indexOf(')', linkSuffixStart + 2);
      if (linkEnd > linkSuffixStart) {
        return `${source.slice(0, linkStart)}${source.slice(start, end)}${source.slice(linkEnd + 1)}`;
      }
    }

    return `${source.slice(0, start)}[${source.slice(start, end)}](https://example.com)${source.slice(end)}`;
  }

  function toggleHeadingBlock(source, start, end) {
    return replaceSourceRange(source, start, end, (block) => {
      const heading = /^(#{1,3})\s+(.+)$/.exec(block);
      return heading ? heading[2] : `## ${block}`;
    });
  }

  function toggleLinePrefix(source, start, end, prefix) {
    return replaceSourceRange(source, start, end, (block) => {
      return block.split('\n').map((line) => {
        if (!line.trim()) return line;
        return line.startsWith(prefix) ? line.slice(prefix.length) : `${prefix}${line}`;
      }).join('\n');
    });
  }

  function replaceSourceRange(source, start, end, replacer) {
    return `${source.slice(0, start)}${replacer(source.slice(start, end))}${source.slice(end)}`;
  }

  function replaceSelection(input, text) {
    const { start, end } = getSelectionRange(input);
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    const prefix = before && !before.endsWith('\n') && needsBlockPadding(text) ? '\n\n' : '';
    const suffix = after && !after.startsWith('\n') && needsBlockPadding(text) ? '\n\n' : '';
    input.value = `${before}${prefix}${text}${suffix}${after}`;
    const cursor = before.length + prefix.length + text.length;
    input.focus();
    input.setSelectionRange(cursor, cursor);
  }

  function needsBlockPadding(text) {
    return /^(#{1,6}\s|> |- |\`\`\`)/.test(text);
  }

  function getLineStarts(markdown) {
    const starts = [];
    let offset = 0;
    for (const line of String(markdown || '').split('\n')) {
      starts.push(offset);
      offset += line.length + 1;
    }
    return starts;
  }

  function getSourceAttributes(enabled, start, end) {
    return enabled ? ` data-source-start="${start}" data-source-end="${end}"` : '';
  }

  function renderMarkdown(markdown, { sourceMap = true, imageState = { nextIndex: 0 } } = {}) {
    const lines = String(markdown || '').split('\n');
    const lineStarts = getLineStarts(markdown);
    const html = [];
    let listItems = [];
    let inCode = false;
    let codeLines = [];
    let mediaBlockIndex = 0;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const lineStart = lineStarts[index] || 0;
      const lineEnd = lineStart + line.length;
      if (line.startsWith('```')) {
        if (inCode) {
          html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
          codeLines = [];
          inCode = false;
        } else {
          flushList();
          inCode = true;
        }
        continue;
      }

      if (inCode) {
        codeLines.push(line);
        continue;
      }

      const mediaDirection = getMediaBlockDirection(line.trim());
      if (mediaDirection) {
        const blockLines = [];
        index += 1;
        while (index < lines.length && lines[index].trim() !== ':::') {
          blockLines.push(lines[index]);
          index += 1;
        }
        flushList();
        html.push(renderMediaBlock(blockLines, mediaBlockIndex, mediaDirection, imageState));
        mediaBlockIndex += 1;
        continue;
      }

      if (!line.trim()) {
        flushList();
        continue;
      }

      const heading = /^(#{1,3})\s+(.+)$/.exec(line);
      if (heading) {
        flushList();
        html.push(`<h${heading[1].length}${getSourceAttributes(sourceMap, lineStart, lineEnd)}>${renderInline(heading[2], imageState)}</h${heading[1].length}>`);
        continue;
      }

      if (line.startsWith('- ')) {
        listItems.push(`<li${getSourceAttributes(sourceMap, lineStart, lineEnd)}>${renderInline(line.slice(2), imageState)}</li>`);
        continue;
      }

      if (line.startsWith('> ')) {
        flushList();
        html.push(`<blockquote${getSourceAttributes(sourceMap, lineStart, lineEnd)}>${renderInline(line.slice(2), imageState)}</blockquote>`);
        continue;
      }

      flushList();
      html.push(`<p${getSourceAttributes(sourceMap, lineStart, lineEnd)}>${renderInline(line, imageState)}</p>`);
    }

    if (inCode) {
      html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    }
    flushList();
    return html.join('\n') || '<p>Start writing to see the preview.</p>';

    function flushList() {
      if (!listItems.length) return;
      html.push(`<ul>${listItems.join('')}</ul>`);
      listItems = [];
    }
  }

  function renderMediaBlock(lines, index, direction, imageState = { nextIndex: 0 }) {
    const imageIndex = lines.findIndex((line) => getMarkdownImageMatch(line.trim()));
    if (imageIndex < 0) {
      return renderMarkdown(lines.join('\n'), { imageState, sourceMap: false });
    }

    const imageLine = lines[imageIndex].trim();
    const sideText = lines.slice(imageIndex + 1).join('\n').trim();
    const copyText = sideText || 'Write side text here.';
    const copyHtml = sideText ? renderMarkdown(sideText, { imageState, sourceMap: false }) : `<p>${escapeHtml(copyText)}</p>`;
    const imageHtml = `<div class="preview-media-image">${renderInline(imageLine, imageState)}</div>`;
    const copy = [
      `<div class="preview-media-copy${sideText ? '' : ' is-placeholder'}" contenteditable="true" data-media-copy data-media-index="${index}" role="textbox" aria-label="Image side text">`,
      copyHtml,
      '</div>'
    ].join('');
    const content = direction === 'left' ? [copy, imageHtml] : [imageHtml, copy];

    return [
      `<section class="preview-media-block" data-media-index="${index}" data-media-direction="${direction}">`,
      ...content,
      '</section>'
    ].join('');
  }

  function renderInline(source, imageState = { nextIndex: 0 }) {
    let html = escapeHtml(source);
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)(?:\{([^}]*)\})?/g, (_match, alt, href, attributes) => {
      const path = unescapeHtml(href);
      const resolvedHref = getPreviewAssetUrl(path);
      const { align, cropRatio, display, focusX, focusY, rotation, shadow, width } = parseImageAttributes(attributes);
      const percent = clampImageWidth(width);
      const cropEnabled = cropRatio > 0;
      const activeCropRatio = cropEnabled ? cropRatio : defaultImageCropRatio;
      const style = [
        `--preview-image-width: ${percent}%`,
        `--preview-image-rotation: ${rotation}deg`,
        `--preview-image-crop-ratio: ${activeCropRatio}`,
        `--preview-image-focus-x: ${focusX}%`,
        `--preview-image-focus-y: ${focusY}%`
      ].join('; ');
      const imageIndex = imageState.nextIndex;
      imageState.nextIndex += 1;
      return [
        `<span class="preview-image-frame" data-image-index="${imageIndex}" data-image-path="${escapeAttribute(path)}" data-image-width="${percent}" data-image-rotation="${rotation}" data-image-crop="${cropEnabled ? 'true' : 'false'}" data-image-crop-ratio="${activeCropRatio}" data-image-focus-x="${focusX}" data-image-focus-y="${focusY}" data-image-align="${escapeAttribute(align)}" data-image-display="${escapeAttribute(display)}" data-image-shadow="${shadow ? 'smooth' : 'none'}" style="${escapeAttribute(style)}" tabindex="0" title="Click to select, then paste an image to replace it">`,
        '<span class="preview-image-crop-box" title="Drag to reposition crop">',
        `<img src="${escapeAttribute(resolvedHref)}" alt="${escapeAttribute(unescapeHtml(alt))}">`,
        '</span>',
        '<span class="preview-image-tools">',
        '<button type="button" data-image-align-center>Center</button>',
        '<button type="button" data-image-side-text="right">Text right</button>',
        '<button type="button" data-image-side-text="left">Text left</button>',
        `<button type="button" data-image-crop-toggle aria-pressed="${cropEnabled ? 'true' : 'false'}">Crop</button>`,
        `<button type="button" data-image-display-inline aria-pressed="${display === 'inline' ? 'true' : 'false'}">Inline</button>`,
        `<button type="button" data-image-shadow-toggle aria-pressed="${shadow ? 'true' : 'false'}">Shadow</button>`,
        '</span>',
        '<span class="preview-image-rotate" aria-hidden="true" title="Drag to tilt image"><svg viewBox="0 0 28 24" focusable="false"><path d="M4.6 13.6C6.9 8.4 21.1 8.4 23.4 13.6M4.6 13.6l.3-4.45M4.6 13.6l4.55-.35M23.4 13.6l-.3-4.45M23.4 13.6l-4.55-.35"></path></svg></span>',
        '<span class="preview-image-crop-resize" aria-hidden="true" title="Drag to change crop height"></span>',
        '<span class="preview-image-resize" aria-hidden="true"></span>',
        '</span>'
      ].join('');
    });
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
      return `<a href="${escapeAttribute(unescapeHtml(href))}">${label}</a>`;
    });
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    return html;
  }

  function attachPreviewImageSelection() {
    for (const frame of preview.querySelectorAll('.preview-image-frame')) {
      frame.addEventListener('click', () => {
        selectPreviewImageFrame(frame);
      });
      frame.addEventListener('focus', () => {
        selectPreviewImageFrame(frame);
      });
      frame.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        clearPreviewImageSelection();
        frame.blur();
      });
    }
  }

  function attachPreviewImageResizing() {
    for (const frame of preview.querySelectorAll('.preview-image-frame')) {
      const handle = frame.querySelector('.preview-image-resize');
      const image = frame.querySelector('img');
      const path = frame.dataset.imagePath;
      if (!handle || !image || !path) continue;

      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        handle.setPointerCapture(event.pointerId);

        const startX = event.clientX;
        const parentWidth = Math.max(1, frame.parentElement.getBoundingClientRect().width);
        const startWidth = clampImageWidth(Number(frame.dataset.imageWidth || 100));

        const handlePointerMove = (moveEvent) => {
          const delta = ((moveEvent.clientX - startX) / parentWidth) * 100;
          const width = clampImageWidth(Math.round(startWidth + delta));
          frame.dataset.imageWidth = String(width);
          frame.style.setProperty('--preview-image-width', `${width}%`);
        };

        const handlePointerUp = () => {
          const width = clampImageWidth(Number(frame.dataset.imageWidth || startWidth));
          updateMarkdownImageWidth(path, width);
          handle.removeEventListener('pointermove', handlePointerMove);
          handle.removeEventListener('pointerup', handlePointerUp);
          handle.removeEventListener('pointercancel', handlePointerUp);
        };

        handle.addEventListener('pointermove', handlePointerMove);
        handle.addEventListener('pointerup', handlePointerUp);
        handle.addEventListener('pointercancel', handlePointerUp);
      });
    }
  }

  function attachPreviewImageCropping() {
    for (const frame of preview.querySelectorAll('.preview-image-frame')) {
      const cropBox = frame.querySelector('.preview-image-crop-box');
      const cropHandle = frame.querySelector('.preview-image-crop-resize');
      const path = frame.dataset.imagePath;
      if (!cropBox || !cropHandle || !path) continue;

      cropBox.addEventListener('dblclick', (event) => {
        if (frame.dataset.imageCrop !== 'true') return;
        event.preventDefault();
        event.stopPropagation();
        updateMarkdownImageCropFocus(path, 50, 50);
      });

      cropBox.addEventListener('pointerdown', (event) => {
        if (frame.dataset.imageCrop !== 'true') return;
        event.preventDefault();
        event.stopPropagation();
        cropBox.setPointerCapture(event.pointerId);
        document.body.classList.add('is-cropping-image');

        const startX = event.clientX;
        const startY = event.clientY;
        const bounds = cropBox.getBoundingClientRect();
        const startFocusX = clampImageFocus(Number(frame.dataset.imageFocusX || 50));
        const startFocusY = clampImageFocus(Number(frame.dataset.imageFocusY || 50));

        const handlePointerMove = (moveEvent) => {
          const focusX = clampImageFocus(startFocusX - ((moveEvent.clientX - startX) / Math.max(1, bounds.width)) * 100);
          const focusY = clampImageFocus(startFocusY - ((moveEvent.clientY - startY) / Math.max(1, bounds.height)) * 100);
          setPreviewImageCropFocus(frame, focusX, focusY);
        };

        const handlePointerUp = () => {
          document.body.classList.remove('is-cropping-image');
          updateMarkdownImageCropFocus(path, Number(frame.dataset.imageFocusX || startFocusX), Number(frame.dataset.imageFocusY || startFocusY));
          cropBox.removeEventListener('pointermove', handlePointerMove);
          cropBox.removeEventListener('pointerup', handlePointerUp);
          cropBox.removeEventListener('pointercancel', handlePointerUp);
        };

        cropBox.addEventListener('pointermove', handlePointerMove);
        cropBox.addEventListener('pointerup', handlePointerUp);
        cropBox.addEventListener('pointercancel', handlePointerUp);
      });

      cropHandle.addEventListener('pointerdown', (event) => {
        if (frame.dataset.imageCrop !== 'true') return;
        event.preventDefault();
        event.stopPropagation();
        cropHandle.setPointerCapture(event.pointerId);
        document.body.classList.add('is-cropping-image');

        const startY = event.clientY;
        const startRatio = clampImageCropRatio(Number(frame.dataset.imageCropRatio || defaultImageCropRatio));
        const startHeight = cropBox.getBoundingClientRect().height;

        const handlePointerMove = (moveEvent) => {
          const nextHeight = Math.max(40, startHeight + moveEvent.clientY - startY);
          const ratio = clampImageCropRatio((startHeight * startRatio) / nextHeight);
          setPreviewImageCropRatio(frame, ratio);
        };

        const handlePointerUp = () => {
          document.body.classList.remove('is-cropping-image');
          updateMarkdownImageCrop(path, Number(frame.dataset.imageCropRatio || startRatio));
          cropHandle.removeEventListener('pointermove', handlePointerMove);
          cropHandle.removeEventListener('pointerup', handlePointerUp);
          cropHandle.removeEventListener('pointercancel', handlePointerUp);
        };

        cropHandle.addEventListener('pointermove', handlePointerMove);
        cropHandle.addEventListener('pointerup', handlePointerUp);
        cropHandle.addEventListener('pointercancel', handlePointerUp);
      });
    }
  }

  function attachPreviewImageRotation() {
    for (const frame of preview.querySelectorAll('.preview-image-frame')) {
      const handle = frame.querySelector('.preview-image-rotate');
      const path = frame.dataset.imagePath;
      if (!handle || !path) continue;

      handle.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
        updateMarkdownImageRotation(path, 0);
      });

      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        handle.setPointerCapture(event.pointerId);
        document.body.classList.add('is-tilting-image');

        const startX = event.clientX;
        const startRotation = clampImageRotation(Number(frame.dataset.imageRotation || 0));

        const handlePointerMove = (moveEvent) => {
          const rotation = clampImageRotation(startRotation + ((moveEvent.clientX - startX) / 12));
          frame.dataset.imageRotation = String(rotation);
          frame.style.setProperty('--preview-image-rotation', `${rotation}deg`);
        };

        const handlePointerUp = () => {
          document.body.classList.remove('is-tilting-image');
          const rotation = clampImageRotation(Number(frame.dataset.imageRotation || startRotation));
          updateMarkdownImageRotation(path, rotation);
          handle.removeEventListener('pointermove', handlePointerMove);
          handle.removeEventListener('pointerup', handlePointerUp);
          handle.removeEventListener('pointercancel', handlePointerUp);
        };

        handle.addEventListener('pointermove', handlePointerMove);
        handle.addEventListener('pointerup', handlePointerUp);
        handle.addEventListener('pointercancel', handlePointerUp);
      });
    }
  }

  function attachPreviewImageActions() {
    for (const button of preview.querySelectorAll('[data-image-align-center]')) {
      const frame = button.closest('.preview-image-frame');
      const path = frame?.dataset.imagePath;
      if (!path || frame.closest('.preview-media-block') || frame.dataset.imageDisplay === 'inline') {
        button.hidden = true;
        continue;
      }

      button.addEventListener('click', () => {
        updateMarkdownImageAlignment(path, 'center');
      });
    }

    for (const button of preview.querySelectorAll('[data-image-side-text]')) {
      const frame = button.closest('.preview-image-frame');
      const path = frame?.dataset.imagePath;
      if (!path || frame.closest('.preview-media-block') || frame.dataset.imageDisplay === 'inline') {
        button.hidden = true;
        continue;
      }

      button.addEventListener('click', () => {
        wrapImageWithSideText(path, button.dataset.imageSideText === 'left' ? 'left' : 'right');
      });
    }

    for (const button of preview.querySelectorAll('[data-image-shadow-toggle]')) {
      const frame = button.closest('.preview-image-frame');
      const path = frame?.dataset.imagePath;
      if (!path) continue;

      button.addEventListener('click', () => {
        updateMarkdownImageShadow(path, frame.dataset.imageShadow !== 'smooth');
      });
    }

    for (const button of preview.querySelectorAll('[data-image-crop-toggle]')) {
      const frame = button.closest('.preview-image-frame');
      const path = frame?.dataset.imagePath;
      if (!path || frame.dataset.imageDisplay === 'inline') {
        button.hidden = true;
        continue;
      }

      button.addEventListener('click', () => {
        updateMarkdownImageCrop(path, frame.dataset.imageCrop === 'true' ? 0 : defaultImageCropRatio);
      });
    }

    for (const button of preview.querySelectorAll('[data-image-display-inline]')) {
      const frame = button.closest('.preview-image-frame');
      const path = frame?.dataset.imagePath;
      if (!path || frame.closest('.preview-media-block')) {
        button.hidden = true;
        continue;
      }

      button.addEventListener('click', () => {
        updateMarkdownImageDisplay(path, frame.dataset.imageDisplay === 'inline' ? 'block' : 'inline');
      });
    }
  }

  function replacePreviewImage(frame, file) {
    const oldPath = frame.dataset.imagePath;
    const imageIndex = Number(frame.dataset.imageIndex);
    if (!oldPath || !Number.isInteger(imageIndex)) return;

    const body = fields.get('body')?.value || '';
    const occurrence = getMarkdownImageOccurrences(body)
      .find((item) => item.index === imageIndex && item.path === oldPath);
    if (!occurrence) return;

    recordHistory();
    const image = addImageFile(file);
    if (!image) return;

    const replacement = `![${occurrence.alt}](${image.path})${occurrence.rawAttributes ? `{${occurrence.rawAttributes}}` : ''}`;
    const updatedBody = `${body.slice(0, occurrence.start)}${replacement}${body.slice(occurrence.end)}`;
    setFieldValue('body', updatedBody);
    renderImages();
    renderPreview();
    selectPreviewImageByIndex(imageIndex);
    sync();
    scheduleAiMetadata();
  }

  function selectPreviewImageByIndex(imageIndex) {
    const frame = preview.querySelector(`.preview-image-frame[data-image-index="${imageIndex}"]`);
    if (!frame) return;

    selectPreviewImageFrame(frame);
    frame.focus({ preventScroll: true });
  }

  function selectPreviewImageFrame(frame) {
    for (const selected of preview.querySelectorAll('.preview-image-frame.is-selected')) {
      if (selected !== frame) selected.classList.remove('is-selected');
    }
    frame.classList.add('is-selected');
  }

  function clearPreviewImageSelection() {
    for (const selected of preview.querySelectorAll('.preview-image-frame.is-selected')) {
      selected.classList.remove('is-selected');
    }
  }

  function getSelectedPreviewImageFrame() {
    return preview.querySelector('.preview-image-frame.is-selected');
  }

  function setPreviewImageCropRatio(frame, ratio) {
    const cropRatio = clampImageCropRatio(ratio);
    frame.dataset.imageCropRatio = String(cropRatio);
    frame.style.setProperty('--preview-image-crop-ratio', String(cropRatio));
  }

  function setPreviewImageCropFocus(frame, focusX, focusY) {
    const x = clampImageFocus(focusX);
    const y = clampImageFocus(focusY);
    frame.dataset.imageFocusX = String(x);
    frame.dataset.imageFocusY = String(y);
    frame.style.setProperty('--preview-image-focus-x', `${x}%`);
    frame.style.setProperty('--preview-image-focus-y', `${y}%`);
  }

  function attachPreviewTextEditing() {
    for (const element of preview.querySelectorAll('[data-preview-field]')) {
      makePreviewTextEditable(element);
      element.addEventListener('blur', () => {
        updatePreviewFieldText(element);
      });
    }

    for (const element of preview.querySelectorAll('[data-preview-tags] li')) {
      makePreviewTextEditable(element);
      element.addEventListener('blur', updatePreviewTagsText);
    }

    for (const element of preview.querySelectorAll('.preview-body [data-source-start][data-source-end]')) {
      if (element.querySelector('.preview-image-frame')) continue;

      makePreviewTextEditable(element);
      element.addEventListener('blur', () => {
        updatePreviewMarkdownText(element);
      });
    }
  }

  function makePreviewTextEditable(element) {
    element.contentEditable = 'true';
    element.spellcheck = true;
    element.dataset.previewEditable = 'true';
    element.setAttribute('role', 'textbox');
    element.setAttribute('aria-label', 'Edit text');

    element.addEventListener('beforeinput', () => {
      if (element.dataset.editing === 'true') return;
      recordHistory();
      element.dataset.editing = 'true';
    });
    element.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      event.preventDefault();
      element.blur();
    });
    element.addEventListener('paste', (event) => {
      const text = event.clipboardData?.getData('text/plain');
      if (!text) return;

      event.preventDefault();
      insertPlainTextAtSelection(text);
    });
  }

  function updatePreviewFieldText(element) {
    const fieldName = element.dataset.previewField;
    if (!['title', 'description'].includes(fieldName)) return;

    const nextText = normalizePreviewEditedText(element.innerText);
    if (getFieldValue(fieldName) !== nextText) {
      setFieldValue(fieldName, nextText);
      if (fieldName === 'title') {
        titleEdited = true;
        if (!titleEditedSlug) {
          setFieldValue('slug', slugify(nextText));
        }
      } else {
        descriptionEdited = true;
      }
      sync();
      scheduleAiMetadata();
    }

    delete element.dataset.editing;
  }

  function updatePreviewTagsText() {
    const tagElements = Array.from(preview.querySelectorAll('[data-preview-tags] li'));
    const nextTags = tagElements
      .map((element) => normalizePreviewEditedText(element.innerText))
      .filter(Boolean)
      .join(', ');
    if (getFieldValue('tags') !== nextTags) {
      setFieldValue('tags', nextTags);
      tagsEdited = true;
      sync();
      scheduleAiMetadata();
    }

    for (const element of tagElements) {
      delete element.dataset.editing;
    }
  }

  function updatePreviewMarkdownText(element) {
    const sourceStart = Number(element.dataset.sourceStart);
    const sourceEnd = Number(element.dataset.sourceEnd);
    if (!Number.isInteger(sourceStart) || !Number.isInteger(sourceEnd)) return;

    const body = fields.get('body')?.value || '';
    const nextText = normalizePreviewEditedText(element.innerText);
    const replacement = formatPreviewMarkdownBlock(element, nextText);
    if (replacement && body.slice(sourceStart, sourceEnd) !== replacement) {
      setFieldValue('body', replaceSourceRange(body, sourceStart, sourceEnd, () => replacement));
      sync();
      scheduleAiMetadata();
    }

    delete element.dataset.editing;
  }

  function formatPreviewMarkdownBlock(element, text) {
    if (!text) return '';

    const tagName = element.tagName.toLowerCase();
    if (tagName === 'h1') return `# ${text}`;
    if (tagName === 'h2') return `## ${text}`;
    if (tagName === 'h3') return `### ${text}`;
    if (tagName === 'li') {
      return text.split('\n').filter(Boolean).map((line) => `- ${line}`).join('\n');
    }
    if (tagName === 'blockquote') {
      return text.split('\n').filter(Boolean).map((line) => `> ${line}`).join('\n');
    }
    return text.split('\n').filter(Boolean).join('\n\n');
  }

  function normalizePreviewEditedText(value) {
    const text = String(value || '').replace(/\u00a0/g, ' ').trim();
    return smartPunctuationInput.checked ? replaceStraightSmartPunctuation(text) : text;
  }

  function insertPlainTextAtSelection(text) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    selection.deleteFromDocument();
    const textNode = document.createTextNode(text);
    const range = selection.getRangeAt(0);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function attachMediaTextEditing() {
    for (const copy of preview.querySelectorAll('[data-media-copy]')) {
      makePreviewTextEditable(copy);
      copy.addEventListener('focus', () => {
        if (!copy.classList.contains('is-placeholder')) return;
        copy.classList.remove('is-placeholder');
        copy.textContent = '';
      }, { once: true });

      copy.addEventListener('blur', () => {
        updateMediaBlockText(Number(copy.dataset.mediaIndex), normalizePreviewEditedText(copy.innerText));
      });
    }
  }

  function updateMarkdownImageWidth(path, width) {
    const escapedPath = escapeRegExp(path);
    const pattern = new RegExp(`(!\\[[^\\]]*\\]\\(${escapedPath}\\))(?:\\{([^}]*)\\})?`);
    const body = fields.get('body')?.value || '';
    const updatedBody = body.replace(pattern, (_match, imageMarkdown, attributes) => {
      return `${imageMarkdown}${formatImageAttributes({ ...parseImageAttributes(attributes), width })}`;
    });
    if (updatedBody === body) return;

    recordHistory();
    setFieldValue('body', updatedBody);
    sync();
  }

  function updateMarkdownImageAlignment(path, align) {
    const escapedPath = escapeRegExp(path);
    const pattern = new RegExp(`(!\\[[^\\]]*\\]\\(${escapedPath}\\))(?:\\{([^}]*)\\})?`);
    const body = fields.get('body')?.value || '';
    const updatedBody = body.replace(pattern, (_match, imageMarkdown, attributes) => {
      return `${imageMarkdown}${formatImageAttributes({ ...parseImageAttributes(attributes), align })}`;
    });
    if (updatedBody === body) return;

    recordHistory();
    setFieldValue('body', updatedBody);
    sync();
  }

  function updateMarkdownImageShadow(path, shadow) {
    const escapedPath = escapeRegExp(path);
    const pattern = new RegExp(`(!\\[[^\\]]*\\]\\(${escapedPath}\\))(?:\\{([^}]*)\\})?`);
    const body = fields.get('body')?.value || '';
    const updatedBody = body.replace(pattern, (_match, imageMarkdown, attributes) => {
      return `${imageMarkdown}${formatImageAttributes({ ...parseImageAttributes(attributes), shadow })}`;
    });
    if (updatedBody === body) return;

    recordHistory();
    setFieldValue('body', updatedBody);
    sync();
  }

  function updateMarkdownImageRotation(path, rotation) {
    const escapedPath = escapeRegExp(path);
    const pattern = new RegExp(`(!\\[[^\\]]*\\]\\(${escapedPath}\\))(?:\\{([^}]*)\\})?`);
    const body = fields.get('body')?.value || '';
    const updatedBody = body.replace(pattern, (_match, imageMarkdown, attributes) => {
      return `${imageMarkdown}${formatImageAttributes({ ...parseImageAttributes(attributes), rotation: clampImageRotation(rotation) })}`;
    });
    if (updatedBody === body) return;

    recordHistory();
    setFieldValue('body', updatedBody);
    sync();
  }

  function updateMarkdownImageCrop(path, cropRatio) {
    const escapedPath = escapeRegExp(path);
    const pattern = new RegExp(`(!\\[[^\\]]*\\]\\(${escapedPath}\\))(?:\\{([^}]*)\\})?`);
    const body = fields.get('body')?.value || '';
    const updatedBody = body.replace(pattern, (_match, imageMarkdown, attributes) => {
      const nextAttributes = { ...parseImageAttributes(attributes), cropRatio: clampImageCropRatio(cropRatio) };
      if (nextAttributes.cropRatio <= 0) {
        nextAttributes.focusX = 50;
        nextAttributes.focusY = 50;
      }
      return `${imageMarkdown}${formatImageAttributes(nextAttributes)}`;
    });
    if (updatedBody === body) return;

    recordHistory();
    setFieldValue('body', updatedBody);
    sync();
  }

  function updateMarkdownImageCropFocus(path, focusX, focusY) {
    const escapedPath = escapeRegExp(path);
    const pattern = new RegExp(`(!\\[[^\\]]*\\]\\(${escapedPath}\\))(?:\\{([^}]*)\\})?`);
    const body = fields.get('body')?.value || '';
    const updatedBody = body.replace(pattern, (_match, imageMarkdown, attributes) => {
      const nextAttributes = {
        ...parseImageAttributes(attributes),
        focusX: clampImageFocus(focusX),
        focusY: clampImageFocus(focusY)
      };
      if (nextAttributes.cropRatio <= 0) {
        nextAttributes.cropRatio = defaultImageCropRatio;
      }
      return `${imageMarkdown}${formatImageAttributes(nextAttributes)}`;
    });
    if (updatedBody === body) return;

    recordHistory();
    setFieldValue('body', updatedBody);
    sync();
  }

  function updateMarkdownImageDisplay(path, display) {
    const escapedPath = escapeRegExp(path);
    const pattern = new RegExp(`(!\\[[^\\]]*\\]\\(${escapedPath}\\))(?:\\{([^}]*)\\})?`);
    const body = fields.get('body')?.value || '';
    const updatedBody = body.replace(pattern, (_match, imageMarkdown, attributes) => {
      const nextAttributes = { ...parseImageAttributes(attributes), display };
      if (display === 'inline') {
        nextAttributes.align = 'left';
        nextAttributes.cropRatio = 0;
        nextAttributes.focusX = 50;
        nextAttributes.focusY = 50;
      }
      return `${imageMarkdown}${formatImageAttributes(nextAttributes)}`;
    });
    if (updatedBody === body) return;

    recordHistory();
    setFieldValue('body', updatedBody);
    sync();
  }

  function wrapImageWithSideText(path, direction) {
    const lines = (fields.get('body')?.value || '').split('\n');
    let inMediaBlock = false;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const trimmed = line.trim();
      if (getMediaBlockDirection(trimmed)) {
        inMediaBlock = true;
        continue;
      }
      if (inMediaBlock && trimmed === ':::') {
        inMediaBlock = false;
        continue;
      }
      if (inMediaBlock || !lineReferencesImagePath(line, path)) continue;

      recordHistory();
      lines.splice(index, 1, `:::media-${direction}`, '', line.trim(), '', 'Write side text here.', '', ':::');
      setFieldValue('body', lines.join('\n'));
      sync();
      return;
    }
  }

  function updateMediaBlockText(mediaIndex, text) {
    if (!Number.isInteger(mediaIndex)) return;

    const lines = (fields.get('body')?.value || '').split('\n');
    let currentMediaIndex = -1;

    for (let index = 0; index < lines.length; index += 1) {
      const direction = getMediaBlockDirection(lines[index].trim());
      if (!direction) continue;

      currentMediaIndex += 1;
      const startIndex = index;
      let endIndex = index + 1;
      while (endIndex < lines.length && lines[endIndex].trim() !== ':::') {
        endIndex += 1;
      }
      if (currentMediaIndex !== mediaIndex) {
        index = endIndex;
        continue;
      }

      const blockLines = lines.slice(startIndex + 1, endIndex);
      const imageLine = blockLines.find((line) => getMarkdownImageMatch(line.trim()));
      if (!imageLine) return;

      const nextBlockLines = [`:::media-${direction}`, '', imageLine.trim()];
      if (text) {
        nextBlockLines.push('', ...text.split('\n'));
      }
      nextBlockLines.push('');
      nextBlockLines.push(':::');
      recordHistory();
      lines.splice(startIndex, endIndex - startIndex + 1, ...nextBlockLines);
      setFieldValue('body', lines.join('\n'));
      sync();
      return;
    }
  }

  function lineReferencesImagePath(line, path) {
    const match = getMarkdownImageMatch(line.trim());
    return match ? match.path === path : false;
  }

  function getMarkdownImageMatch(line) {
    const match = /^!\[([^\]]*)]\(([^)]+)\)(?:\{([^}]*)\})?$/.exec(line);
    if (!match) return null;
    const attributes = parseImageAttributes(match[3]);
    return {
      align: attributes.align,
      alt: match[1],
      cropRatio: attributes.cropRatio,
      display: attributes.display,
      focusX: attributes.focusX,
      focusY: attributes.focusY,
      path: match[2],
      rotation: attributes.rotation,
      shadow: attributes.shadow,
      width: attributes.width
    };
  }

  function getMarkdownImageOccurrences(markdown) {
    const lines = String(markdown || '').split('\n');
    const lineStarts = getLineStarts(markdown);
    const occurrences = [];
    let inCode = false;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      if (line.startsWith('```')) {
        inCode = !inCode;
        continue;
      }
      if (inCode) continue;

      addImageOccurrencesFromLine(line, lineStarts[lineIndex] || 0, occurrences);
    }

    return occurrences;
  }

  function addImageOccurrencesFromLine(line, lineStart, occurrences) {
    const pattern = /!\[([^\]]*)]\(([^)]+)\)(?:\{([^}]*)\})?/g;
    let match = pattern.exec(line);
    while (match) {
      occurrences.push({
        alt: match[1],
        end: lineStart + match.index + match[0].length,
        index: occurrences.length,
        path: match[2],
        rawAttributes: match[3] || '',
        start: lineStart + match.index
      });
      match = pattern.exec(line);
    }
  }

  function getMediaBlockDirection(line) {
    if (line === ':::media-right') return 'right';
    if (line === ':::media-left') return 'left';
    return null;
  }

  function parseImageAttributes(value) {
    const attributes = {
      align: 'left',
      cropRatio: 0,
      display: 'block',
      focusX: 50,
      focusY: 50,
      rotation: 0,
      shadow: false,
      width: 100
    };

    for (const part of String(value || '').split(/[;\s]+/)) {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex < 1) continue;
      const rawName = part.slice(0, separatorIndex);
      const rawValue = part.slice(separatorIndex + 1);
      const name = rawName?.trim();
      const option = rawValue?.trim();
      if (name === 'width') {
        attributes.width = clampImageWidth(Number(String(option || '').replace(/%$/, '')));
      }
      if (name === 'align' && ['left', 'center', 'right'].includes(option)) {
        attributes.align = option;
      }
      if (name === 'display' && ['block', 'inline'].includes(option)) {
        attributes.display = option;
      }
      if (name === 'crop') {
        attributes.cropRatio = parseImageCropRatio(option);
      }
      if (name === 'focus') {
        const focus = parseImageFocus(option);
        attributes.focusX = focus.x;
        attributes.focusY = focus.y;
      }
      if (['rotate', 'rotation', 'tilt'].includes(name)) {
        attributes.rotation = clampImageRotation(option?.replace(/deg$/, ''));
      }
      if (name === 'shadow') {
        attributes.shadow = ['smooth', 'true'].includes(option);
      }
    }

    return attributes;
  }

  function formatImageAttributes(attributes) {
    const parts = [];
    const width = clampImageWidth(attributes.width);
    const align = ['left', 'center', 'right'].includes(attributes.align) ? attributes.align : 'left';
    const cropRatio = clampImageCropRatio(attributes.cropRatio);
    const focusX = clampImageFocus(attributes.focusX);
    const focusY = clampImageFocus(attributes.focusY);
    const rotation = clampImageRotation(attributes.rotation);
    if (width !== 100) {
      parts.push(`width=${width}%`);
    }
    if (align !== 'left') {
      parts.push(`align=${align}`);
    }
    if (attributes.display === 'inline') {
      parts.push('display=inline');
    }
    if (attributes.shadow) {
      parts.push('shadow=smooth');
    }
    if (cropRatio > 0 && attributes.display !== 'inline') {
      parts.push(`crop=${formatImageCropRatio(cropRatio)}`);
      if (focusX !== 50 || focusY !== 50) {
        parts.push(`focus=${formatImageFocus(focusX, focusY)}`);
      }
    }
    if (rotation !== 0) {
      parts.push(`rotate=${rotation}deg`);
    }
    return parts.length ? `{${parts.join(';')}}` : '';
  }

  function clampImageWidth(value) {
    return Math.min(100, Math.max(25, Number.isFinite(value) ? value : 100));
  }

  function parseImageCropRatio(value) {
    const source = String(value || '').trim();
    if (!source || source === 'false' || source === 'none') return 0;
    if (source === 'true') return defaultImageCropRatio;
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

  function formatImageCropRatio(value) {
    const ratio = clampImageCropRatio(value);
    if (Math.abs(ratio - (16 / 9)) < 0.01) return '16:9';
    if (Math.abs(ratio - 1) < 0.01) return '1:1';
    if (Math.abs(ratio - (4 / 3)) < 0.01) return '4:3';
    return trimNumber(ratio, 2);
  }

  function formatImageFocus(focusX, focusY) {
    return `${trimNumber(clampImageFocus(focusX), 1)}%,${trimNumber(clampImageFocus(focusY), 1)}%`;
  }

  function clampImageCropRatio(value) {
    const ratio = Number.parseFloat(value);
    if (!Number.isFinite(ratio) || ratio <= 0) return 0;
    return Math.min(maximumImageCropRatio, Math.max(minimumImageCropRatio, Math.round(ratio * 100) / 100));
  }

  function clampImageFocus(value) {
    const focus = Number.parseFloat(value);
    if (!Number.isFinite(focus)) return 50;
    return Math.min(100, Math.max(0, Math.round(focus * 10) / 10));
  }

  function clampImageRotation(value) {
    const rotation = Number.parseFloat(value);
    if (!Number.isFinite(rotation)) return 0;
    return Math.min(maximumImageRotation, Math.max(-maximumImageRotation, Math.round(rotation * 2) / 2));
  }

  function trimNumber(value, maximumFractionDigits) {
    return Number(value).toFixed(maximumFractionDigits).replace(/\.?0+$/, '');
  }

  function getFieldValue(name) {
    return fields.get(name)?.value.trim() || '';
  }

  function setFieldValue(name, value) {
    const field = fields.get(name);
    if (field) {
      field.value = value;
    }
  }

  function getPostFolderName(documentRecord = getCurrentDocumentForExport()) {
    const date = getDocumentFieldValue(documentRecord, 'date') || getToday();
    const slug = getPostSlug(documentRecord);
    return `${date}-${slug}`;
  }

  function getPostSlug(documentRecord = getCurrentDocumentForExport()) {
    return getDocumentFieldValue(documentRecord, 'slug') || slugify(getDocumentFieldValue(documentRecord, 'title')) || 'untitled-post';
  }

  function dedupeFolderName(folderName, usedFolders) {
    let candidate = folderName;
    let index = 2;
    while (usedFolders.has(candidate)) {
      candidate = `${folderName}-${index}`;
      index += 1;
    }
    return candidate;
  }

  function parseTags(value) {
    return String(value)
      .split(',')
      .map((tag) => slugify(tag.trim()))
      .filter(Boolean);
  }

  function quoteYaml(value) {
    return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s*\n\s*/g, ' ')}"`;
  }

  function slugify(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  function sanitizeFileName(value) {
    const dotIndex = value.lastIndexOf('.');
    const basename = dotIndex > 0 ? value.slice(0, dotIndex) : value;
    const extension = dotIndex > 0 ? value.slice(dotIndex + 1).toLowerCase() : 'png';
    return `${slugify(basename) || 'image'}.${extension.replace(/[^a-z0-9]/g, '') || 'png'}`;
  }

  function getFileExtension(fileName) {
    const dotIndex = String(fileName || '').lastIndexOf('.');
    const extension = dotIndex > 0 ? fileName.slice(dotIndex).toLowerCase().replace(/[^.a-z0-9]/g, '') : '.png';
    return extension === '.' ? '.png' : extension;
  }

  function dedupeFileName(fileName, usedNames) {
    const used = new Set(usedNames);
    if (!used.has(fileName)) return fileName;

    const dotIndex = fileName.lastIndexOf('.');
    const basename = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
    const extension = dotIndex > 0 ? fileName.slice(dotIndex) : '';
    let index = 2;
    let candidate = `${basename}-${index}${extension}`;
    while (used.has(candidate)) {
      index += 1;
      candidate = `${basename}-${index}${extension}`;
    }
    return candidate;
  }

  function stripMarkdown(value) {
    return String(value)
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#>*_`~-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanAiDescription(value) {
    return String(value || '')
      .replace(/^[-*\s]+/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);
  }

  function cleanAiTitle(value) {
    return String(value || '')
      .replace(/^\s*(title|post title)\s*:\s*/i, '')
      .replace(/^[-*"'\s]+|[-*"'\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 90);
  }

  function downloadBlob(fileName, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function createZip(files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const now = new Date();
    const { dosDate, dosTime } = getDosDateTime(now);

    for (const file of files) {
      const nameBytes = textEncoder.encode(file.path);
      const data = file.data;
      const crc = crc32(data);
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, dosTime, true);
      localView.setUint16(12, dosDate, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localHeader.set(nameBytes, 30);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, dosTime, true);
      centralView.setUint16(14, dosDate, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);

      localParts.push(localHeader, data);
      centralParts.push(centralHeader);
      offset += localHeader.length + data.length;
    }

    const centralDirectory = concatUint8Arrays(centralParts);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralDirectory.length, true);
    endView.setUint32(16, offset, true);

    return new Blob([...localParts, centralDirectory, end], { type: 'application/zip' });
  }

  function concatUint8Arrays(parts) {
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }

  function createCrcTable() {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[index] = value >>> 0;
    }
    return table;
  }

  function crc32(data) {
    let crc = 0xffffffff;
    for (const byte of data) {
      crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function getDosDateTime(date) {
    const year = Math.max(1980, date.getFullYear());
    return {
      dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
      dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
    };
  }

  function getToday() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDisplayDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return value;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return new Intl.DateTimeFormat('en', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  }

  function getPreviewAssetUrl(path) {
    const asset = [coverImage, ...selectedImages].find((image) => assetMatchesPath(image, path));
    return asset?.url || path;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function unescapeHtml(value) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value;
  }
})();
