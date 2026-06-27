export function createSafariExportOptionsPlist({
  developmentTeam,
  env = process.env
}) {
  const signingStyle = getSafariExportSigningStyle(env);
  const values = {
    destination: env.YTCQ_SAFARI_EXPORT_DESTINATION || 'upload',
    manageAppVersionAndBuildNumber: false,
    method: env.YTCQ_SAFARI_EXPORT_METHOD || 'app-store-connect',
    signingStyle,
    stripSwiftSymbols: true,
    teamID: developmentTeam,
    uploadSymbols: true
  };

  if (env.YTCQ_SAFARI_BUNDLE_ID) {
    values.distributionBundleIdentifier = env.YTCQ_SAFARI_BUNDLE_ID;
  }

  if (signingStyle === 'manual') {
    values.signingCertificate = env.YTCQ_SAFARI_EXPORT_SIGNING_CERTIFICATE
      || 'Mac App Distribution';
    values.installerSigningCertificate = env.YTCQ_SAFARI_EXPORT_INSTALLER_SIGNING_CERTIFICATE
      || 'Mac Installer Distribution';
    values.provisioningProfiles = readManualProvisioningProfiles(env);
  }

  return toPlist(values);
}

export function getSafariExportProvisioningArgs({ env = process.env } = {}) {
  if (getSafariExportSigningStyle(env) === 'manual') return [];
  return env.YTCQ_SAFARI_ALLOW_PROVISIONING_UPDATES === '0'
    ? []
    : ['-allowProvisioningUpdates'];
}

export function getSafariExportSigningStyle(env = process.env) {
  const signingStyle = env.YTCQ_SAFARI_EXPORT_SIGNING_STYLE || 'automatic';
  if (signingStyle !== 'automatic' && signingStyle !== 'manual') {
    throw new Error(
      'YTCQ_SAFARI_EXPORT_SIGNING_STYLE must be "automatic" or "manual".'
    );
  }

  return signingStyle;
}

function readManualProvisioningProfiles(env) {
  const rawProfiles = env.YTCQ_SAFARI_EXPORT_PROVISIONING_PROFILES;
  if (!rawProfiles) {
    throw new Error(
      'YTCQ_SAFARI_EXPORT_SIGNING_STYLE=manual requires '
      + 'YTCQ_SAFARI_EXPORT_PROVISIONING_PROFILES as a JSON object mapping '
      + 'bundle identifiers to provisioning profile names.'
    );
  }

  let profiles;
  try {
    profiles = JSON.parse(rawProfiles);
  } catch {
    throw new Error('YTCQ_SAFARI_EXPORT_PROVISIONING_PROFILES must be valid JSON.');
  }

  if (!profiles || Array.isArray(profiles) || typeof profiles !== 'object') {
    throw new Error('YTCQ_SAFARI_EXPORT_PROVISIONING_PROFILES must be a JSON object.');
  }

  const entries = Object.entries(profiles);
  if (entries.length === 0) {
    throw new Error('YTCQ_SAFARI_EXPORT_PROVISIONING_PROFILES cannot be empty.');
  }

  for (const [bundleId, profileName] of entries) {
    if (!bundleId.trim() || typeof profileName !== 'string' || !profileName.trim()) {
      throw new Error(
        'YTCQ_SAFARI_EXPORT_PROVISIONING_PROFILES must map non-empty bundle '
        + 'identifiers to non-empty provisioning profile names.'
      );
    }
  }

  return profiles;
}

function toPlist(values) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
${plistValue(values)}
</plist>
`;
}

function plistValue(value, depth = 0) {
  const indent = '\t'.repeat(depth);
  const nextIndent = '\t'.repeat(depth + 1);

  if (typeof value === 'boolean') return `${indent}<${value ? 'true' : 'false'}/>`;
  if (typeof value === 'string') return `${indent}<string>${escapeXml(value)}</string>`;

  if (value && !Array.isArray(value) && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, nextValue]) =>
      `${nextIndent}<key>${escapeXml(key)}</key>\n${plistValue(nextValue, depth + 1)}`
    );

    return `${indent}<dict>\n${entries.join('\n')}\n${indent}</dict>`;
  }

  throw new Error(`Unsupported plist value: ${String(value)}`);
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
