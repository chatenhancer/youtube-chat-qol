export function maskGithubActionsValue(value, {
  env = process.env,
  output = console.log
} = {}) {
  const text = String(value ?? '');
  if (!env.GITHUB_ACTIONS || !text.trim()) return;

  output(`::add-mask::${escapeWorkflowCommandData(text)}`);
}

export function maskGithubActionsValues(values, options = {}) {
  const seen = new Set();

  for (const value of values) {
    const text = String(value ?? '');
    if (!text.trim() || seen.has(text)) continue;

    seen.add(text);
    maskGithubActionsValue(text, options);
  }
}

function escapeWorkflowCommandData(value) {
  return value
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}
