import { normalizeThemeImage } from '../shared/custom-themes';
import { localizeExtensionPage } from '../shared/extension-page-i18n';

localizeExtensionPage(true);

// Keep a snapshot in this local tab so it survives edits and closing the editor.
const image = normalizeThemeImage(new URLSearchParams(location.hash.slice(1)).get('image'));
const frame = document.querySelector<HTMLIFrameElement>('#themeImage');
if (image && frame) {
  // The browser's image viewer supplies fitting, zooming, and saving.
  frame.src = image;
  frame.hidden = false;
}
