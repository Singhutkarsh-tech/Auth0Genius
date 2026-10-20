import type { Guide } from './validation';
import { applicableSteps, type AuthRoute } from './workspace';
export function normalize(input: string): string {
  const value = input.trim().toLowerCase();
  if (/^https?:\/\//.test(value) || /^[\w.-]+\.[a-z]{2,}(?:\/.*)?$/.test(value)) {
    try {
      const u = new URL(value.includes('://') ? value : `https://${value}`);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return value;
    }
  }
  return value.replace(/\s+/g, ' ');
}
export function matches(guide: Guide, input: string, exact = false) {
  const q = normalize(input);
  const values = [guide.name, guide.slug, guide.website, ...guide.aliases].map(normalize);
  return values.some((v) => (exact ? v === q : v.includes(q)));
}
export const approvalLabel = (status: Guide['approval']) =>
  ({
    not_required: 'No review for documented route',
    conditional: 'Conditional approval',
    required: 'Review required',
    unknown: 'Approval unknown',
  })[status];
export const difficultyTone = (value: Guide['difficulty']) =>
  ({ Easy: 'green', Moderate: 'amber', Complex: 'purple', Unknown: 'neutral' })[value];
export function nextAction(guide: Guide, completed: string[], route: AuthRoute = 'custom') {
  if (guide.oauthStatus !== 'supported')
    return { title: 'Verify OAuth support before proceeding', href: '#evidence' };
  if (route === 'managed' && guide.managedAuth !== 'available')
    return { title: 'Check managed authentication availability', href: '#auth-route' };
  const step = applicableSteps(guide, route).find((s) => !completed.includes(s.id));
  return step
    ? { title: step.title, href: `#step-${step.id}` }
    : { title: 'Review your production readiness', href: '#approval' };
}
export function launchState(
  guide: Guide,
  stage: string,
  completed: string[],
  blocked: string[] = [],
  route: AuthRoute = 'custom',
) {
  const steps = applicableSteps(guide, route).filter((s) => s.stage === stage);
  if (!steps.length)
    return guide.stageExemptions.some(
      (e) => e.route === route && e.stage === stage && e.reason.status === 'not_applicable',
    )
      ? 'Not applicable'
      : 'Not researched';
  if (steps.some((s) => blocked.includes(s.id))) return 'Blocked';
  if (steps.every((s) => completed.includes(s.id))) return 'Completed by user';
  if (steps.some((s) => completed.includes(s.id))) return 'In progress';
  return 'Not started';
}
