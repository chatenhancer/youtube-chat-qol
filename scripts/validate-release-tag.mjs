/*
 * Release tag guard.
 *
 * Keeps store publishing tied to exact semver tags that match package.json.
 * This prevents accidental tags such as vtest or v0.7.6-fix from submitting
 * packages to browser stores.
 */
import packageJson from '../package.json' with { type: 'json' };

const tagRef = process.env.GITHUB_REF || '';
const tagName = tagRef.startsWith('refs/tags/') ? tagRef.slice('refs/tags/'.length) : '';
const expectedTag = `v${packageJson.version}`;

if (!/^v\d+\.\d+\.\d+$/.test(tagName)) {
  throw new Error(`Invalid release tag "${tagName}". Use an exact semver tag such as ${expectedTag}.`);
}

if (tagName !== expectedTag) {
  throw new Error(`Release tag "${tagName}" does not match package.json version "${packageJson.version}". Expected ${expectedTag}.`);
}

console.log(`Release tag ${tagName} matches package.json.`);
