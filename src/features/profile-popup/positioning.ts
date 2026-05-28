export function positionProfileCard(card: HTMLElement, anchor: HTMLElement): void {
  const anchorRect = anchor.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const margin = 8;
  const width = cardRect.width;
  const height = cardRect.height;

  let left = anchorRect.right + margin;
  if (left + width + margin > window.innerWidth) {
    left = anchorRect.left - width - margin;
  }

  let top = anchorRect.top;
  if (top + height + margin > window.innerHeight) {
    top = window.innerHeight - height - margin;
  }

  card.style.left = `${Math.max(margin, Math.round(left))}px`;
  card.style.top = `${Math.max(margin, Math.round(top))}px`;
}

export function keepProfileCardInViewport(card: HTMLElement): void {
  const rect = card.getBoundingClientRect();
  const margin = 8;

  let left = rect.left;
  if (left + rect.width + margin > window.innerWidth) {
    left -= left + rect.width + margin - window.innerWidth;
  }
  if (left < margin) {
    left = margin;
  }

  let top = rect.top;
  if (top + rect.height + margin > window.innerHeight) {
    top -= top + rect.height + margin - window.innerHeight;
  }
  if (top < margin) {
    top = margin;
  }

  card.style.left = `${Math.round(left)}px`;
  card.style.top = `${Math.round(top)}px`;
}
