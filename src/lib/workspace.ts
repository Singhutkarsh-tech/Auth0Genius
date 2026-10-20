import type { Guide } from './validation';
export type AuthRoute = 'managed' | 'custom';
export type Progress = { completed: string[]; blocked: string[] };
export type WorkspaceProgress = {
  schema: 2;
  route: AuthRoute;
  progress: Record<AuthRoute, Progress>;
};
export function applicableSteps(guide: Guide, route: AuthRoute) {
  const steps = guide.steps.filter((step) => step.routes.includes(route));
  if (route === 'managed' && guide.managedAuth !== 'available')
    return [
      {
        id: `${guide.slug}-managed-availability`,
        title: 'Check managed authentication availability',
        detail: guide.managedEvidence,
        owner: 'Human' as const,
        stage: 'Verify' as const,
        routes: ['managed' as const],
        url: guide.sources.find((s) => s.authority === 'composio')?.url ?? null,
        note: 'Checking this item records your investigation; it does not establish managed availability.',
        effort: null,
        blocker: 'Managed availability is not established.',
      },
    ];
  return steps;
}
export function emptyWorkspace(): WorkspaceProgress {
  return {
    schema: 2,
    route: 'managed',
    progress: { custom: { completed: [], blocked: [] }, managed: { completed: [], blocked: [] } },
  };
}
export function restoreWorkspace(guide: Guide, value: unknown): WorkspaceProgress {
  const next = emptyWorkspace();
  if (!value || typeof value !== 'object') return next;
  const saved = value as Record<string, unknown>;
  const clean = (route: AuthRoute, input: unknown): Progress => {
    const ids = new Set(applicableSteps(guide, route).map((s) => s.id));
    const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    const array = (v: unknown) =>
      Array.isArray(v)
        ? [...new Set(v.filter((id): id is string => typeof id === 'string' && ids.has(id)))]
        : [];
    return { completed: array(raw.completed), blocked: array(raw.blocked) };
  };
  if (saved.schema === 2 && saved.progress && typeof saved.progress === 'object') {
    const progress = saved.progress as Record<string, unknown>;
    next.progress = {
      custom: clean('custom', progress.custom),
      managed: clean('managed', progress.managed),
    };
    if (saved.route === 'custom' || saved.route === 'managed') next.route = saved.route;
  } else {
    next.progress.custom = clean('custom', saved);
    if (next.progress.custom.completed.length || next.progress.custom.blocked.length)
      next.route = 'custom';
  }
  return next;
}
export function routeReadiness(guide: Guide, route: AuthRoute) {
  if (route === 'custom' && guide.oauthStatus !== 'supported')
    return {
      difficulty: 'Unknown' as const,
      difficultyExplanation: {
        text: 'Setup is not established while OAuth evidence awaits review.',
        status: 'unverified' as const,
        sourceIds: [],
        support: null,
      },
      setupEffort: {
        text: 'Unknown pending evidence review',
        status: 'unverified' as const,
        sourceIds: [],
        support: null,
      },
      approval: 'unknown' as const,
      approvalTime: guide.approvalTime,
      mainBlocker: guide.oauthEvidence,
      prerequisites: ['Review the retained provider evidence before registering an application.'],
    };
  if (route === 'custom')
    return {
      difficulty: guide.difficulty,
      difficultyExplanation: guide.difficultyExplanation,
      setupEffort: guide.setupEffort,
      approval: guide.approval,
      approvalTime: guide.approvalTime,
      mainBlocker: guide.mainBlocker,
      prerequisites: guide.prerequisites,
    };
  const known = guide.managedAuth === 'available';
  const claim = (text: string, status: 'estimated' | 'unverified' = 'unverified') => ({
    text,
    status,
    sourceIds: [],
    support: null,
  });
  return {
    difficulty: known ? ('Easy' as const) : ('Unknown' as const),
    difficultyExplanation: claim(
      known
        ? 'Estimate assumes an existing Composio project and default scopes that fit. Account policy checks are separate.'
        : 'Confirm managed availability before planning setup.',
      known ? 'estimated' : 'unverified',
    ),
    setupEffort: claim(
      known ? '10–20 min, estimated' : 'Effort unknown until availability is confirmed',
      known ? 'estimated' : 'unverified',
    ),
    approval: 'unknown' as const,
    approvalTime: claim(
      'Unknown pending scope coverage and target-account policy checks for the managed route.',
    ),
    mainBlocker: known
      ? claim(
          'Confirm default scope coverage and target-account policies; managed credentials do not prove distribution approval.',
        )
      : guide.managedEvidence,
    prerequisites: [
      'A Composio project and a stable end-user identifier',
      'A narrow list of intended actions',
      'An eligible test account and confirmation of toolkit availability',
    ],
  };
}
