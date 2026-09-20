/** The popup and editor use the same moving hover/focus highlight. */
export function initTabHighlight(tabList: HTMLElement): () => void {
  const tabs = [...tabList.querySelectorAll<HTMLButtonElement>('.popup-tab')];
  let previewed: HTMLButtonElement | null = null;
  const animate = () => tabList.classList.add('popup-tab-highlight-animated');
  function refresh(): void {
    const active = tabs.find((tab) =>
      tab.getAttribute('aria-selected') === 'true' || tab.getAttribute('aria-pressed') === 'true'
    );
    const tab = previewed || active;
    if (!tab) {
      tabList.style.setProperty('--ytcq-popup-tab-highlight-opacity', '0');
      return;
    }
    tabList.style.setProperty('--ytcq-popup-tab-highlight-x', `${tab.offsetLeft}px`);
    tabList.style.setProperty('--ytcq-popup-tab-highlight-width', `${tab.offsetWidth}px`);
    tabList.style.setProperty('--ytcq-popup-tab-highlight-height', `${tab.offsetHeight}px`);
    tabList.style.setProperty('--ytcq-popup-tab-highlight-opacity', '1');
  }
  for (const tab of tabs) {
    const preview = () => {
      animate();
      previewed = tab;
      refresh();
    };
    tab.addEventListener('pointerenter', preview);
    tab.addEventListener('focus', preview);
    tab.addEventListener('click', animate);
  }
  tabList.addEventListener('pointerleave', () => {
    previewed = null;
    refresh();
  });
  tabList.addEventListener('focusout', (event) => {
    if (event.relatedTarget instanceof Node && tabList.contains(event.relatedTarget)) return;
    previewed = null;
    refresh();
  });
  window.addEventListener('resize', refresh);
  refresh();
  return refresh;
}
