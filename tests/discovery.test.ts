import { beforeEach, describe, expect, it, vi } from 'vitest';
const captured = vi.hoisted(() => vi.fn());
vi.mock('@/lib/research/documents', () => ({ publicDocument: captured }));
import { identifyProvider } from '@/lib/research/discovery';
beforeEach(() => captured.mockReset());
const result = (url: string, title: string, content: string) => ({ url, title, content });
const page = (url: string, title: string, text: string) => ({ document: { url, title, text }, fetchedAt: '2026-10-27T00:00:00.000Z', cacheStatus: 'miss' });
describe('Provider discovery never confers user intent', () => {
  it('returns two credible same-name companies for a human selection', async () => {
    captured.mockResolvedValueOnce(page('https://mercury.com/about', 'Mercury | Business banking', 'Mercury is a financial technology company.')).mockResolvedValueOnce(page('https://mercury.io/about', 'Mercury | Monitoring', 'Mercury monitors applications and infrastructure.'));
    const discovery = await identifyProvider('Mercury', [result('https://mercury.com/about', 'Mercury banking', 'Mercury company'), result('https://mercury.io/about', 'Mercury monitoring', 'Mercury company')]);
    expect(discovery.ambiguous).toBe(true);
    expect(discovery.candidates.map((c) => c.website)).toEqual(['https://mercury.com', 'https://mercury.io']);
    expect(discovery).not.toHaveProperty('identityConfirmation');
  });
  it('requires confirmation even for one strong candidate', async () => {
    captured.mockResolvedValueOnce(page('https://www.figma.com', 'Figma: Collaborative design', 'Figma is a collaborative design platform with developer APIs.'));
    const discovery = await identifyProvider('Figma', [result('https://www.figma.com', 'Figma design', 'Figma design platform')]);
    expect(discovery.ambiguous).toBe(true);
    expect(discovery.candidates[0].name).toBe('Figma');
  });
  it('does not accept brand keywords in a domain as company identity evidence', async () => {
    captured.mockResolvedValueOnce(page('https://quasar.example', 'Unrelated business', 'We sell groceries and home supplies.'));
    const discovery = await identifyProvider('Quasar', [result('https://quasar.example', 'Unrelated business', '')]);
    expect(discovery.candidates).toEqual([]);
    expect(discovery.ambiguous).toBe(true);
  });
  it('preserves an explicit website and its evidenced developer subdomain association', async () => {
    captured.mockResolvedValueOnce(page('https://www.figma.com', 'Figma: Collaborative design', 'Figma is a collaborative design platform with a public API.'));
    const direct = await identifyProvider('https://www.figma.com', [result('https://www.figma.com', '', '')], undefined, 'https://www.figma.com');
    expect(direct).toMatchObject({ ambiguous: false, website: 'https://figma.com', name: 'Figma' });
    captured.mockResolvedValueOnce(page('https://developers.figma.com', 'Figma: Developer documentation', 'Figma developer API documentation.'));
    expect(await identifyProvider('https://developers.figma.com', [result('https://developers.figma.com', '', '')], undefined, 'https://developers.figma.com')).toMatchObject({ ambiguous: false, website: 'https://figma.com' });
  });
  it('surfaces a cross-domain redirect for user confirmation', async () => {
    captured.mockResolvedValueOnce(page('https://another-company.example', 'Different company', 'A separate company at the redirected destination.'));
    const direct = await identifyProvider('https://old-brand.example', [result('https://old-brand.example', '', '')], undefined, 'https://old-brand.example');
    expect(direct.ambiguous).toBe(true);
    expect(direct.candidates[0].website).toBe('https://another-company.example');
    expect(direct.reason).toContain('redirected');
  });
});
