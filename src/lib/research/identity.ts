import { validateRemoteUrl } from './network';
import { normalizeProviderDomain } from './domain';
export { normalizeProviderDomain } from './domain';

export type ResearchTarget =
  | { kind: 'name'; value: string }
  | { kind: 'domain' | 'url'; value: string; url: string; origin: string; domain: string };

export function sameOfficialDomain(first: string, second: string) {
  const host = (value: string) => {
    try {
      return new URL(value.includes('://') ? value : `https://${value}`).hostname;
    } catch {
      return value;
    }
  };
  return normalizeProviderDomain(host(first)) === normalizeProviderDomain(host(second));
}

/** Parse input before lookup so bare domains and URLs keep their host as the identity clue. */
export function parseResearchTarget(input: string): ResearchTarget {
  const value = input.trim();
  const explicit = /^[a-z][a-z\d+.-]*:/i.test(value);
  const hasAuthority = /^[a-z][a-z\d+.-]*:\/\//i.test(value);
  const bareDomain = /^[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)+(?:\/[^\s]*)?$/i.test(
    value,
  );
  if (!explicit && !bareDomain) return { kind: 'name', value };
  if (explicit && !hasAuthority) throw new Error('Unsupported website URL format');
  const parsed = validateRemoteUrl(explicit ? value : `https://${value}`);
  return {
    kind: explicit ? 'url' : 'domain',
    value,
    url: parsed.toString(),
    origin: parsed.origin,
    domain: normalizeProviderDomain(parsed.hostname),
  };
}

export const sameProviderDomain = sameOfficialDomain;
