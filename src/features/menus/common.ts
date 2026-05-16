/**
 * Shared menu item builders.
 *
 * These helpers create lightweight DOM that visually follows YouTube's menu
 * structure without depending on private Polymer constructors. Settings-menu
 * and per-message action modules both use this path.
 */
interface MenuActionItemOptions {
  className?: string;
  setting?: string;
  label: string;
  iconPath: string;
  onClick: () => void;
}

interface PaperItemOptions {
  label: string;
  iconPath: string;
}

export function createMenuActionItem({
  className = 'ytcq-settings-item',
  setting = '',
  label,
  iconPath,
  onClick
}: MenuActionItemOptions): HTMLElement {
  const item = document.createElement('div');
  item.className = `style-scope ytd-menu-popup-renderer ${className}`;
  item.setAttribute('system-icons', '');
  item.setAttribute('role', 'menuitem');
  item.setAttribute('use-icons', '');
  item.setAttribute('tabindex', '-1');
  item.setAttribute('aria-selected', 'false');
  if (setting) item.setAttribute('data-ytcq-setting', setting);
  item.appendChild(createPaperItem({ label, iconPath }));
  wireMenuItemClick(item, onClick);
  return item;
}

export function createMenuToggleItem({
  setting,
  label,
  checked,
  iconPath,
  onClick
}: {
  setting: string;
  label: string;
  checked: boolean;
  iconPath: string;
  onClick: () => void;
}): HTMLElement {
  const item = createMenuActionItem({
    className: 'ytcq-settings-item ytcq-toggle-item',
    setting,
    label,
    iconPath,
    onClick
  });
  item.setAttribute('aria-checked', String(Boolean(checked)));
  const toggle = document.createElement('span');
  toggle.className = 'ytcq-menu-toggle';
  toggle.setAttribute('aria-hidden', 'true');
  item.querySelector('.ytcq-paper-item')?.appendChild(toggle);
  return item;
}

export function createPaperItem({ label, iconPath }: PaperItemOptions): HTMLElement {
  const paperItem = document.createElement('div');
  paperItem.className = 'ytcq-paper-item';
  paperItem.setAttribute('role', 'option');
  paperItem.setAttribute('tabindex', '0');
  paperItem.setAttribute('aria-disabled', 'false');

  const icon = document.createElement('span');
  icon.className = 'ytcq-menu-icon';
  icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true"><path d="${iconPath}"></path></svg>`;

  const text = document.createElement('span');
  text.className = 'ytcq-menu-label';
  text.textContent = label;

  paperItem.append(icon, text);
  return paperItem;
}

export function closeMenu(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Escape',
    code: 'Escape',
    keyCode: 27,
    bubbles: true,
    cancelable: true
  }));
}

export function clampMenuToViewport(menu: HTMLElement): void {
  window.requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    const overflowRight = rect.right - (window.innerWidth - 8);
    const overflowLeft = 8 - rect.left;

    if (overflowRight > 0) {
      menu.style.left = `${Math.max(8, rect.left - overflowRight)}px`;
      menu.style.right = 'auto';
    } else if (overflowLeft > 0) {
      menu.style.left = `${rect.left + overflowLeft}px`;
      menu.style.right = 'auto';
    }
  });
}

function wireMenuItemClick(item: HTMLElement, onClick: () => void): void {
  const handler = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  };
  item.addEventListener('click', handler);
  item.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      handler(event);
    }
  });
}
