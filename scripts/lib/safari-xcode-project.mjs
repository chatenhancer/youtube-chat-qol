export function rewriteSafariProductBundleIdentifiers(project, bundleIdentifier) {
  const appBundleIdentifier = String(bundleIdentifier || '').trim();
  if (!appBundleIdentifier) {
    throw new Error('Safari app bundle identifier is required.');
  }

  const extensionBundleIdentifier = `${appBundleIdentifier}.Extension`;

  return project.replace(
    /(PRODUCT_BUNDLE_IDENTIFIER = )([^;]+)(;)/g,
    (match, prefix, rawValue, suffix) => {
      const currentValue = unquotePbxValue(rawValue);
      const nextValue = currentValue.endsWith('.Extension')
        ? extensionBundleIdentifier
        : appBundleIdentifier;

      return `${prefix}${quotePbxValue(nextValue)}${suffix}`;
    }
  );
}

export function readSafariProductBundleIdentifiers(project) {
  return [
    ...new Set(Array.from(
      project.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g),
      (match) => unquotePbxValue(match[1])
    ))
  ].sort();
}

function quotePbxValue(value) {
  const text = String(value || '').trim();
  return /^[A-Za-z0-9_.-]+$/.test(text)
    ? text
    : JSON.stringify(text);
}

function unquotePbxValue(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) return trimmed;

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed.slice(1, -1);
  }
}
