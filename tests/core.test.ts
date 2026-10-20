import { describe, expect, it } from 'vitest';
import { seedGuides } from '@/data/seed-providers';
import {
  normalize,
  matches,
  nextAction,
  launchState,
  approvalLabel,
  difficultyTone,
} from '@/lib/providers';
import { guideSchema, validateEvidence } from '@/lib/validation';
import { assertStageAdvance, canTransition } from '@/lib/research/state';
import { isPublicIp, validateRemoteUrl } from '@/lib/research/network';
import { reconcileGuide } from '@/lib/research/synthesis';
const gmail = seedGuides[0];
describe('Provider discovery', () => {
  it.each([
    [' Google Mail ', 'google mail'],
    ['https://www.gmail.com/path?q=x', 'gmail.com'],
    ['GMAIL.COM', 'gmail.com'],
    [' Git  Hub ', 'git hub'],
  ])('normalizes %s', (input, expected) => expect(normalize(input)).toBe(expected));
  it.each(['Google Mail', 'gmail.com', 'https://mail.google.com/mail'])(
    'resolves Gmail alias %s',
    (q) => expect(matches(gmail, q, true)).toBe(true),
  );
  it('matches partial case-insensitive input', () => expect(matches(gmail, 'GmA')).toBe(true));
  it('does not match a lookalike domain as an exact provider', () =>
    expect(matches(gmail, 'gmail.com.attacker.example', true)).toBe(false));
  it('ships exactly ten providers and three correct featured providers', () => {
    expect(seedGuides).toHaveLength(10);
    expect(seedGuides.filter((g) => g.featured).map((g) => g.name)).toEqual([
      'Gmail',
      'Slack',
      'GitHub',
    ]);
  });
});
describe('Guide and evidence validation', () => {
  it('accepts every seeded guide', () =>
    seedGuides.forEach((g) => expect(validateEvidence(g)).toEqual(g)));
  it('rejects invalid enum values', () =>
    expect(guideSchema.safeParse({ ...gmail, difficulty: 'Hard' }).success).toBe(false));
  it('rejects missing essential fields', () =>
    expect(guideSchema.safeParse({ ...gmail, steps: [] }).success).toBe(false));
  it('rejects dangling citations', () => {
    const g = structuredClone(gmail);
    g.mainBlocker.sourceIds = ['invented'];
    expect(() => validateEvidence(g)).toThrow('Unknown evidence');
  });
  it('rejects claims marked verified without a source', () => {
    const g = structuredClone(gmail);
    g.mainBlocker.sourceIds = [];
    expect(() => validateEvidence(g)).toThrow('require evidence');
  });
  it('rejects false domain labels', () => {
    const g = structuredClone(gmail);
    g.sources[0].domain = 'other.example';
    expect(() => validateEvidence(g)).toThrow('domain mismatch');
  });
  it('rejects duplicate source and step identifiers', () => {
    const g = structuredClone(gmail);
    g.steps[1].id = g.steps[0].id;
    expect(() => validateEvidence(g)).toThrow('Duplicate');
  });
  it('rejects untrusted source classifications for verified claims', () => {
    const g = structuredClone(gmail);
    g.sources.forEach((s) => (s.type = 'third_party'));
    expect(() => validateEvidence(g)).toThrow('official evidence');
  });
  it('rejects invented step destinations', () => {
    const g = structuredClone(gmail);
    g.steps[0].url = 'https://invented.example/';
    expect(() =>
      reconcileGuide(
        g,
        g.sources.map((s) => ({ ...s, text: s.summary })),
      ),
    ).toThrow('not retrieved');
  });
});
describe('Launch decisions', () => {
  it('recommends checking managed auth when that route is selected', () =>
    expect(nextAction(gmail, [], 'managed').href).toBe('#auth-route'));
  it('recommends the first incomplete step', () => {
    const completed = [gmail.steps[0].id];
    expect(nextAction(gmail, completed).href).toBe(`#step-${gmail.steps[1].id}`);
  });
  it('asks for production review after the checklist is reported complete', () =>
    expect(
      nextAction(
        gmail,
        gmail.steps.map((s) => s.id),
      ).href,
    ).toBe('#approval'));
  it('does not produce a registration recommendation for unconfirmed OAuth', () =>
    expect(nextAction({ ...gmail, oauthStatus: 'unknown' }, []).href).toBe('#evidence'));
  it('supports meaningful launch route states', () => {
    const register = gmail.steps.filter((s) => s.stage === 'Register');
    expect(launchState(gmail, 'Register', [])).toBe('Not started');
    expect(launchState(gmail, 'Register', [register[0].id])).toBe('In progress');
    expect(
      launchState(
        gmail,
        'Register',
        register.map((s) => s.id),
      ),
    ).toBe('Completed by user');
    expect(launchState(gmail, 'Register', [], [register[0].id])).toBe('Blocked');
    expect(
      launchState(
        { ...gmail, steps: gmail.steps.filter((s) => s.stage !== 'Launch') },
        'Launch',
        [],
      ),
    ).toBe('Not applicable');
  });
  it('keeps unknown and conditional approval distinct', () => {
    expect(approvalLabel('unknown')).toBe('Approval unknown');
    expect(approvalLabel('conditional')).toBe('Conditional approval');
    expect(difficultyTone('Unknown')).toBe('neutral');
  });
});
describe('Bounded research state', () => {
  it('allows queued→running and running→completed', () => {
    expect(canTransition('queued', 'running')).toBe(true);
    expect(canTransition('running', 'completed')).toBe(true);
  });
  it('rejects terminal state transitions and skipped stages', () => {
    expect(canTransition('failed', 'running')).toBe(false);
    expect(canTransition('completed', 'running')).toBe(false);
    expect(() => assertStageAdvance(1, 3)).toThrow();
    expect(() => assertStageAdvance(6, 7)).not.toThrow();
    expect(() => assertStageAdvance(7, 8)).toThrow();
  });
});
describe('Remote URL safety', () => {
  it.each([
    'http://example.com',
    'file:///etc/passwd',
    'https://localhost/',
    'https://127.0.0.1',
    'https://169.254.169.254/latest/meta-data',
    'https://10.0.0.1',
    'https://[::1]',
    'https://[::ffff:127.0.0.1]',
    'https://foo.internal/',
    'https://user:pass@example.com',
    'https://example.com:8443',
  ])('blocks %s', (url) => expect(() => validateRemoteUrl(url)).toThrow());
  it.each([
    '127.0.0.1',
    '10.1.1.1',
    '172.16.1.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '0.0.0.0',
  ])('rejects nonpublic IP %s', (ip) => expect(isPublicIp(ip)).toBe(false));
  it('permits real public HTTPS documentation', () => {
    expect(validateRemoteUrl('https://docs.github.com/en/apps').hostname).toBe('docs.github.com');
    expect(isPublicIp('8.8.8.8')).toBe(true);
  });
});
