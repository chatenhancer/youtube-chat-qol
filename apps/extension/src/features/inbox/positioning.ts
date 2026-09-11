/** Shared placement for the live Inbox and its onboarding example. */
export function positionInboxCard(card: HTMLElement, anchor?: HTMLElement): void {
  const anchorGap = 8;
  const cardRect = card.getBoundingClientRect();
  const width = cardRect.width;
  const height = cardRect.height;
  const connectedAnchor = anchor?.isConnected ? anchor : null;
  const anchorRect = connectedAnchor
    ? connectedAnchor.getBoundingClientRect()
    : {
        left: window.innerWidth,
        right: window.innerWidth,
        top: 0,
        bottom: 0
      };

  let left = anchorRect.right - width;
  if (left < 0) {
    left = anchorRect.left;
  }
  if (left + width > window.innerWidth) {
    left = window.innerWidth - width;
  }

  let top = connectedAnchor ? anchorRect.bottom + anchorGap : 0;
  if (top + height > window.innerHeight) {
    top = connectedAnchor ? anchorRect.top - height - anchorGap : 0;
  }

  card.style.left = `${Math.max(0, Math.round(left))}px`;
  card.style.top = `${Math.max(0, Math.round(top))}px`;
}
