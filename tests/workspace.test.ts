import { describe, it, expect } from 'vitest';
import { seedGuides } from '@/data/seed-providers';
import { applicableSteps, restoreWorkspace, routeReadiness, emptyWorkspace } from '@/lib/workspace';
import { nextAction, launchState } from '@/lib/providers';
describe('Managed and custom workspace applicability', () => {
  for (const slug of ['gmail', 'slack', 'github'])
    it(`${slug} has a managed-only sequence and distinct custom progress`, () => {
      const g = seedGuides.find((g) => g.slug === slug)!;
      const managed = applicableSteps(g, 'managed');
      const custom = applicableSteps(g, 'custom');
      expect(managed).toHaveLength(5);
      expect(managed.map((s) => s.title).join(' ')).not.toMatch(
        /Create a Google Cloud|Register an OAuth|Create a Slack app/,
      );
      expect(custom.some((s) => s.stage === 'Register')).toBe(true);
      expect(nextAction(g, [managed[0].id], 'managed').href).toBe('#evidence');
      expect(
        nextAction(
          g,
          custom.map((s) => s.id),
          'managed',
        ).href,
      ).toBe('#evidence');
      expect(launchState(g, 'Register', [], [], 'managed')).toBe('Not applicable');
      expect(launchState(g, 'Configure', [managed[0].id], [], 'managed')).toBe('In progress');
      expect(routeReadiness(g, 'managed').setupEffort.text).toContain('10–20');
    });
  it('keeps unknown availability as the next action even after user reports investigation complete', () => {
    const g = seedGuides.find((g) => g.slug === 'linear')!;
    const steps = applicableSteps(g, 'managed');
    expect(steps).toHaveLength(1);
    expect(nextAction(g, [steps[0].id], 'managed').title).toContain('Check managed');
    expect(routeReadiness(g, 'managed').difficulty).toBe('Unknown');
    expect(routeReadiness(g, 'managed').difficultyExplanation.status).toBe('unverified');
    expect(routeReadiness(g, 'managed').approvalTime.text).toContain('managed route');
    expect(launchState(g, 'Launch', [], [], 'managed')).toBe('Not researched');
  });
  it('keeps custom readiness unknown when OAuth support is unresolved', () => {
    const g = structuredClone(seedGuides[0]);
    g.oauthStatus = 'unknown';
    expect(routeReadiness(g, 'custom').difficulty).toBe('Unknown');
    expect(routeReadiness(g, 'custom').setupEffort.status).toBe('unverified');
  });
  it('does not infer launch exemption from missing custom research', () => {
    const g = seedGuides.find((g) => g.slug === 'notion')!;
    expect(launchState(g, 'Launch', [], [], 'custom')).toBe('Not researched');
  });
  it('migrates old progress deliberately into custom only', () => {
    const g = seedGuides[0];
    const id = applicableSteps(g, 'custom')[0].id;
    const restored = restoreWorkspace(g, { completed: [id], blocked: [] });
    expect(restored.route).toBe('custom');
    expect(restored.progress.custom.completed).toEqual([id]);
    expect(restored.progress.managed.completed).toEqual([]);
  });
  it('restores selected route and route-specific progress without transferring completion', () => {
    const g = seedGuides[0];
    const saved = emptyWorkspace();
    saved.progress.managed.completed = [applicableSteps(g, 'managed')[0].id];
    saved.progress.custom.completed = [applicableSteps(g, 'custom')[0].id];
    saved.route = 'custom';
    expect(restoreWorkspace(g, JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });
});
