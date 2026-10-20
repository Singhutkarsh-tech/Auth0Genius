/** A small deterministic registrable-domain approximation for provider matching. */
const compoundPublicSuffixes = new Set([
  'co.uk', 'org.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'com.br', 'com.cn',
  'com.sg', 'co.in', 'co.za', 'com.mx', 'com.tr', 'com.tw', 'com.hk', 'co.jp',
]);

export function normalizeProviderDomain(hostname: string) {
  const host = hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  const labels = host.split('.');
  const suffix2 = labels.slice(-2).join('.');
  if (compoundPublicSuffixes.has(suffix2) && labels.length > 2) return labels.slice(-3).join('.');
  return labels.slice(-2).join('.');
}
