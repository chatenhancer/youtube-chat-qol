/** Editor-only undo. Keep previous field values instead of copying theme images. */
export function createThemeHistory() {
  const entries: Array<{ undo: () => void; label: string }> = [];
  let group: { target: object; key: PropertyKey } | null = null;

  function commit(): void {
    group = null;
  }

  function record(undo: () => void, label: string): void {
    commit();
    entries.push({ undo, label });
    if (entries.length > 100) entries.shift();
  }

  return {
    set<T extends object, K extends keyof T>(target: T, key: K, value: T[K], label: string): boolean {
      if (target[key] === value) return false;
      if (group?.target !== target || group.key !== key) {
        const previous = target[key];
        record(() => { target[key] = previous; }, label);
        group = { target, key };
      }
      target[key] = value;
      return true;
    },
    record,
    commit,
    undo(): string | undefined {
      commit();
      const entry = entries.pop();
      entry?.undo();
      return entry?.label;
    },
    clear(): void {
      commit();
      entries.length = 0;
    }
  };
}
