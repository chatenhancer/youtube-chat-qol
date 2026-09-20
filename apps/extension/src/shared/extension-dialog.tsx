import { jsx, el } from './jsx-dom';

let dismissDialog: (() => void) | null = null;

export function closeExtensionDialog(): void {
  dismissDialog?.();
}

/** Shared confirmation surface; retain reset's existing classes and appearance. */
export function showExtensionDialog({
  actions,
  items = [],
  listLabel,
  message
}: {
  actions: Array<{ className?: string; label: string; onClick: () => void }>;
  items?: string[];
  listLabel?: string;
  message: string;
}): void {
  closeExtensionDialog();
  const previousFocus = document.activeElement;
  const main = document.querySelector('main');
  const overlay = el<HTMLDivElement>(
    <div
      class="popup-reset-dialog-backdrop"
      onClick={(event: MouseEvent) => {
        if (event.target === event.currentTarget) closeExtensionDialog();
      }}
    >
      <section
        class="popup-reset-dialog"
        aria-modal="true"
        role="dialog"
        aria-describedby="popupDialogMessage"
      >
        <p id="popupDialogMessage" class="popup-reset-dialog-message">
          {message}
        </p>
        {items.length && listLabel ? (
          <p class="popup-reset-dialog-list-label">{listLabel}</p>
        ) : null}
        {items.length ? (
          <ul class="popup-reset-dialog-list">
            {items.map((item) => (
              <li>{item}</li>
            ))}
          </ul>
        ) : null}
        <div class="popup-reset-dialog-actions">
          {actions.map((action) => (
            <button
              type="button"
              class={`popup-reset-dialog-button ${action.className || ''}`}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeExtensionDialog();
    }
    if (event.key !== 'Tab') return;
    const buttons = [...overlay.querySelectorAll('button')];
    const next = event.shiftKey ? buttons.at(-1) : buttons[0];
    const end = event.shiftKey ? buttons[0] : buttons.at(-1);
    if (document.activeElement === end) {
      event.preventDefault();
      next?.focus();
    }
  });
  dismissDialog = () => {
    overlay.remove();
    if (main) main.inert = false;
    dismissDialog = null;
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
  };
  if (main) main.inert = true;
  document.body.append(overlay);
  overlay.querySelector('button')?.focus();
}
