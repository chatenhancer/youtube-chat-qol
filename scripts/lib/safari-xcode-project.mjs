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

export function rewriteSafariManualCodeSigningSettings(project, {
  bundleIdentifier,
  developmentTeam,
  provisioningProfiles,
  signingCertificate
}) {
  const appBundleIdentifier = String(bundleIdentifier || '').trim();
  const teamId = String(developmentTeam || '').trim();
  const certificate = String(signingCertificate || '').trim();

  if (!appBundleIdentifier) {
    throw new Error('Safari app bundle identifier is required.');
  }

  if (!teamId) {
    throw new Error('Safari development team is required.');
  }

  if (!certificate) {
    throw new Error('Safari signing certificate is required.');
  }

  validateManualProvisioningProfiles(appBundleIdentifier, provisioningProfiles);

  return project.replace(
    /(\n\s*[^=\n]+\/\* [^*]+ \*\/ = {\n\s*isa = XCBuildConfiguration;\n\s*buildSettings = {\n)([\s\S]*?)(\n\s*};\n\s*name = [^;]+;\n\s*};)/g,
    (match, prefix, settings, suffix) => {
      const bundleId = readPbxBuildSetting(settings, 'PRODUCT_BUNDLE_IDENTIFIER');
      const sdkRoot = readPbxBuildSetting(settings, 'SDKROOT');
      const profileName = provisioningProfiles[bundleId];

      if (sdkRoot !== 'macosx' || !profileName) return match;

      let nextSettings = settings;
      nextSettings = setPbxBuildSetting(nextSettings, 'CODE_SIGN_STYLE', 'Manual');
      nextSettings = setPbxBuildSetting(nextSettings, 'DEVELOPMENT_TEAM', teamId);
      nextSettings = setPbxBuildSetting(nextSettings, 'CODE_SIGN_IDENTITY', certificate);
      nextSettings = setPbxBuildSetting(
        nextSettings,
        'PROVISIONING_PROFILE_SPECIFIER',
        profileName
      );

      return `${prefix}${nextSettings}${suffix}`;
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

function validateManualProvisioningProfiles(bundleIdentifier, provisioningProfiles) {
  if (!provisioningProfiles || Array.isArray(provisioningProfiles)
    || typeof provisioningProfiles !== 'object') {
    throw new Error('Safari provisioning profiles must be a bundle ID to profile name map.');
  }

  const requiredBundleIdentifiers = [
    bundleIdentifier,
    `${bundleIdentifier}.Extension`
  ];
  const missingBundleIdentifiers = requiredBundleIdentifiers.filter(
    (bundleId) => !String(provisioningProfiles[bundleId] || '').trim()
  );

  if (missingBundleIdentifiers.length > 0) {
    throw new Error(
      'Safari manual signing requires provisioning profiles for: '
      + missingBundleIdentifiers.join(', ')
    );
  }
}

function readPbxBuildSetting(settings, key) {
  const match = new RegExp(`\\n\\s*${escapeRegExp(key)} = ([^;]+);`).exec(settings);
  return match ? unquotePbxValue(match[1]) : '';
}

function setPbxBuildSetting(settings, key, value) {
  const nextValue = quotePbxValue(value);
  const pattern = new RegExp(`(\\n\\s*)${escapeRegExp(key)} = [^;]+;`);

  if (pattern.test(settings)) {
    return settings.replace(pattern, `$1${key} = ${nextValue};`);
  }

  const indent = /\n(\s*)[A-Z0-9_]+ = /.exec(settings)?.[1] || '\t\t\t\t';
  return `${settings}\n${indent}${key} = ${nextValue};`;
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
