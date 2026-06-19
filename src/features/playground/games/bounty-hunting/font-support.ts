const LIMITED_WESTERN_DISPLAY_TEXT = /^[ !$,\-.0-9:?A-Za-z]*$/;

export function canRenderBountyHuntingBarnumText(text: string): boolean {
  return LIMITED_WESTERN_DISPLAY_TEXT.test(text);
}

export function canRenderBountyHuntingBartleText(text: string): boolean {
  return LIMITED_WESTERN_DISPLAY_TEXT.test(text);
}

export function canRenderBountyHuntingTexMexText(text: string): boolean {
  return LIMITED_WESTERN_DISPLAY_TEXT.test(text);
}

export function formatBountyHuntingTexMexTitleText(text: string): string {
  return text.toUpperCase();
}
