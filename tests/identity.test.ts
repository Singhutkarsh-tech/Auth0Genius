import { describe, expect, it } from 'vitest';
import {
  normalizeProviderDomain,
  parseResearchTarget,
  sameOfficialDomain,
} from '@/lib/research/identity';

describe('direct URL research identity', () => {
  it.each([
    ['Figma', { kind: 'name', value: 'Figma' }],
    ['figma.com', { kind: 'domain', value: 'figma.com', url: 'https://figma.com/', origin: 'https://figma.com', domain: 'figma.com' }],
    ['https://www.figma.com', { kind: 'url', value: 'https://www.figma.com', url: 'https://www.figma.com/', origin: 'https://www.figma.com', domain: 'figma.com' }],
    ['https://developers.figma.com', { kind: 'url', value: 'https://developers.figma.com', url: 'https://developers.figma.com/', origin: 'https://developers.figma.com', domain: 'figma.com' }],
    ['https://kite.trade', { kind: 'url', value: 'https://kite.trade', url: 'https://kite.trade/', origin: 'https://kite.trade', domain: 'kite.trade' }],
  ])('parses %s without losing the identity clue', (input, expected) => {
    expect(parseResearchTarget(input)).toEqual(expected);
  });

  it.each([
    ['www.figma.com', 'figma.com'],
    ['developers.figma.com', 'figma.com'],
    ['kite.trade', 'kite.trade'],
    ['api.zerodha.com', 'zerodha.com'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeProviderDomain(input)).toBe(expected);
  });

  it('matches an evidenced official developer subdomain to the provider domain', () => {
    expect(sameOfficialDomain('developers.figma.com', 'www.figma.com')).toBe(true);
    expect(sameOfficialDomain('figma.jp', 'figma.com')).toBe(false);
  });

  it.each([
    'http://figma.com',
    'https://localhost',
    'https://127.0.0.1',
    'javascript:alert(1)',
    'https://user:password@figma.com',
  ])('rejects unsafe URL input %s', (input) => {
    expect(() => parseResearchTarget(input)).toThrow();
  });
});
