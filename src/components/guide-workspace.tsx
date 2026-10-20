'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  Circle,
  ClipboardCheck,
  Clock3,
  Copy,
  ExternalLink,
  Fingerprint,
  Flag,
  Info,
  ListChecks,
  LockKeyhole,
  Route,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import type { Guide } from '@/lib/validation';
import { stages } from '@/lib/validation';
import {
  applicableSteps,
  routeReadiness,
  emptyWorkspace,
  restoreWorkspace,
  type AuthRoute,
  type WorkspaceProgress,
} from '@/lib/workspace';
import { approvalLabel, difficultyTone, launchState, nextAction } from '@/lib/providers';
import { Badge, ClaimText, EvidenceBadge, ExternalLink as OfficialLink, ProviderLogo } from './ui';
const emptySubscribe = () => () => {};
export function GuideWorkspace({ guide }: { guide: Guide }) {
  const key = `auth0genius:${guide.slug}:v${guide.version}`;
  const [workspace, setWorkspace] = useState(emptyWorkspace);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const hydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const route = workspace.route;
  const { completed, blocked } = workspace.progress[route];
  const stepsForRoute = applicableSteps(guide, route);
  const readiness = routeReadiness(guide, route);
  const callbackSource = guide.sources.find(
    (s) =>
      s.authority === 'composio' &&
      s.topics.includes('setup') &&
      (s.content ?? s.summary).includes(
        'https://backend.composio.dev/api/v3/toolkits/auth/callback',
      ),
  );
  /* eslint-disable react-hooks/set-state-in-effect -- Restore version/route-scoped browser progress after hydration. */
  useEffect(() => {
    try {
      setWorkspace(restoreWorkspace(guide, JSON.parse(localStorage.getItem(key) ?? 'null')));
    } catch {
      setStorageWarning(true);
    }
    setProgressLoaded(true);
  }, [key, guide]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const persist = (next: WorkspaceProgress) => {
    setWorkspace(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      setStorageWarning(true);
    }
  };
  const setRoute = (value: AuthRoute) => persist({ ...workspace, route: value });
  const update = (next: string[], stuck = blocked) =>
    persist({
      ...workspace,
      progress: { ...workspace.progress, [route]: { completed: next, blocked: stuck } },
    });
  const toggle = (id: string) =>
    update(
      completed.includes(id) ? completed.filter((x) => x !== id) : [...completed, id],
      blocked.filter((x) => x !== id),
    );
  const next = nextAction(guide, completed, route);
  const progress = stepsForRoute.length
    ? Math.round((completed.length / stepsForRoute.length) * 100)
    : 0;
  async function share() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/providers/${guide.slug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyError(true);
    }
  }
  return (
    <main id="main" className="page-shell guide-page" data-auth-route={route}>
      <div className="breadcrumbs">
        <Link href="/providers">
          <ArrowLeft size={14} />
          Integrations
        </Link>
        <span>/</span>
        <span>{guide.name}</span>
      </div>
      <div className="guide-heading">
        <ProviderLogo guide={guide} large />
        <div>
          <div className="guide-title-line">
            <h1>{guide.name}</h1>
            <Badge>{guide.category}</Badge>
          </div>
          <p>{guide.description}</p>
        </div>
        <button onClick={share} className="button secondary share-button">
          {copied ? <Check size={15} /> : <Copy size={15} />}{' '}
          {copied ? 'Link copied' : 'Share guide'}
        </button>
      </div>
      {copyError && (
        <p role="status" className="notice">
          Copy this guide URL:{' '}
          <input
            readOnly
            aria-label="Shareable guide URL"
            value={hydrated ? `${location.origin}/providers/${guide.slug}` : ''}
          />
        </p>
      )}
      <div className="guide-meta">
        <Badge tone={guide.oauthStatus === 'supported' ? 'green' : 'amber'}>
          <ShieldCheck size={12} />
          OAuth {guide.oauthStatus}
        </Badge>
        <Badge tone={guide.managedAuth === 'available' ? 'purple' : 'neutral'}>
          Managed auth {guide.managedAuth}
        </Badge>
        <span className="meta-divider" />
        <span>
          {guide.status === 'sourced'
            ? 'Documentation-backed guide'
            : 'Partial guide · gaps disclosed'}
        </span>
        <span>
          Sources checked{' '}
          {guide.checkedAt
            ? new Date(guide.checkedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC',
              })
            : 'not established'}
        </span>
      </div>
      <div className="next-action">
        <span className="next-icon">
          <Sparkles size={22} />
        </span>
        <div>
          <div className="eyebrow">YOUR NEXT BEST ACTION</div>
          <strong>{next.title}</strong>
          <p>Based on this guide and your locally reported progress.</p>
        </div>
        <a href={next.href} className="button primary">
          Take the next step
          <ArrowRight size={16} />
        </a>
      </div>
      <div className="guide-layout">
        <aside className="guide-sidebar">
          <span className="eyebrow">YOUR LAUNCH WORKSPACE</span>
          <nav aria-label="Guide sections">
            {[
              ['overview', 'Launch readiness', Route],
              ['auth-route', 'Choose your auth route', Fingerprint],
              ['checklist', 'Setup checklist', ListChecks],
              ['approval', 'Approval intelligence', ShieldCheck],
              ['ownership', 'Agent & human roles', Bot],
              ['blockers', 'Blockers & fixes', Flag],
              ['evidence', 'Sources & evidence', ExternalLink],
            ].map(([id, label, Icon]) => {
              const I = Icon as typeof Route;
              return (
                <a href={`#${id}`} key={id as string}>
                  <I size={16} />
                  {label as string}
                </a>
              );
            })}
          </nav>
          <div className="sidebar-progress">
            <ClipboardCheck size={18} />
            <strong>Your setup progress</strong>
            <span>
              {completed.length} of {stepsForRoute.length} steps reported complete
            </span>
            <div className="progress-track">
              <div style={{ width: `${progress}%` }} />
            </div>
            <small>Saved on this browser · v{guide.version}</small>
          </div>
          <p className="sidebar-footnote">
            <LockKeyhole size={13} />
            Credentials stay with your provider and Composio.
          </p>
        </aside>
        <div className="guide-content">
          <section id="overview" className="guide-section">
            <div className="section-title">
              <div>
                <h2>Your launch readiness</h2>
                <p>The work you control. The dependencies you don’t.</p>
              </div>
              <Badge>
                {route === 'managed' ? 'Managed authentication route' : 'Custom OAuth route'}
              </Badge>
            </div>
            <div className="readiness-grid">
              <div className="readiness-card">
                <span>SETUP DIFFICULTY</span>
                <strong>
                  <span className={`difficulty-dot ${difficultyTone(readiness.difficulty)}`} />
                  {readiness.difficulty}
                </strong>
                <p>{readiness.difficultyExplanation.text}</p>
                <EvidenceBadge status={readiness.difficultyExplanation.status} />
              </div>
              <div className="readiness-card">
                <span>HANDS-ON EFFORT</span>
                <strong>{readiness.setupEffort.text.replace(', estimated', '')}</strong>
                <p>Developer work. Excludes provider waiting and review preparation.</p>
                <EvidenceBadge status={readiness.setupEffort.status} />
              </div>
              <div className="readiness-card">
                <span>EXTERNAL WAIT</span>
                <strong>Unknown / conditional</strong>
                <p>{readiness.approvalTime.text}</p>
                <EvidenceBadge status={readiness.approvalTime.status} />
              </div>
              <div className="readiness-card">
                <span>APPROVAL</span>
                <strong>{approvalLabel(readiness.approval)}</strong>
                <p>Depends on permissions, distribution, and account policies.</p>
                <a href="#approval" className="text-link">
                  See requirements
                  <ArrowRight size={12} />
                </a>
              </div>
            </div>
            <div className="blocker-callout">
              <TriangleAlert size={18} />
              <div>
                <strong>The main launch dependency</strong>
                <ClaimText claim={readiness.mainBlocker} />
              </div>
            </div>
            <div className="launch-route">
              <div className="route-top">
                <h3>
                  <Route size={17} />
                  Your launch route
                </h3>
                <span>User-reported progress</span>
              </div>
              <div className="route-stages">
                {stages.map((stage, i) => {
                  const state = launchState(guide, stage, completed, blocked, route);
                  return (
                    <div
                      className={`route-stage ${state === 'Completed by user' ? 'done' : state === 'Blocked' ? 'blocked' : ''}`}
                      key={stage}
                    >
                      <span className="route-node">
                        {state === 'Completed by user' ? (
                          <Check size={14} />
                        ) : state === 'Blocked' ? (
                          <TriangleAlert size={13} />
                        ) : (
                          i + 1
                        )}
                      </span>
                      <strong>{stage}</strong>
                      <small>{state}</small>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
          <section id="auth-route" className="guide-section">
            <div className="section-title">
              <div>
                <h2>Choose your authentication route</h2>
                <p>Check managed authentication before registering your own app.</p>
              </div>
            </div>
            <div className="auth-options" role="group" aria-label="Authentication route">
              <button
                onClick={() => setRoute('managed')}
                aria-pressed={route === 'managed'}
                className={`auth-option ${route === 'managed' ? 'selected' : ''}`}
              >
                <span className="option-radio">{route === 'managed' && <span />}</span>
                <div>
                  <span className="auth-option-title">
                    Managed authentication
                    <Badge tone={guide.managedAuth === 'available' ? 'green' : 'neutral'}>
                      {guide.managedAuth === 'available' ? 'Available' : 'Check availability'}
                    </Badge>
                  </span>
                  <p>Use Composio’s credentials to start with supported default scopes.</p>
                </div>
                <Sparkles size={20} />
              </button>
              <button
                onClick={() => setRoute('custom')}
                aria-pressed={route === 'custom'}
                className={`auth-option ${route === 'custom' ? 'selected' : ''}`}
              >
                <span className="option-radio">{route === 'custom' && <span />}</span>
                <div>
                  <span className="auth-option-title">
                    Custom OAuth application<Badge>More control</Badge>
                  </span>
                  <p>Your branding, your scopes, dedicated quota, and provider-specific needs.</p>
                </div>
                <Fingerprint size={20} />
              </button>
            </div>
            {route === 'managed' ? (
              <div className="auth-detail">
                <ClaimText claim={guide.managedEvidence} />
                <OfficialLink href="https://docs.composio.dev/docs/authentication/custom-app-vs-managed-app">
                  Check the documented route
                </OfficialLink>
                <p className="small-note">
                  {guide.managedAuth === 'available'
                    ? 'The checklist follows the managed route. Select custom OAuth to plan your own registration.'
                    : 'The checklist checks availability first. No managed connection has been established.'}
                </p>
              </div>
            ) : (
              <div className="auth-detail">
                <p>
                  {guide.oauthStatus === 'supported' ? (
                    <>
                      <strong>The checklist below walks through your custom app.</strong> Register
                      with the provider, then configure its credentials in Composio.
                    </>
                  ) : (
                    <>
                      <strong>Review OAuth evidence before registration.</strong> The custom
                      checklist starts with the unresolved provider evidence.
                    </>
                  )}
                </p>
                <div className="concept-line">
                  <span>
                    Toolkit <small>the service</small>
                  </span>
                  <ArrowRight size={12} />
                  <span>
                    Auth config <small>the auth blueprint</small>
                  </span>
                  <ArrowRight size={12} />
                  <span>
                    Connected account <small>one user’s connection</small>
                  </span>
                </div>
              </div>
            )}
          </section>
          <section id="checklist" className="guide-section">
            <div className="section-title">
              <div>
                <h2>Your setup checklist</h2>
                <p>One concrete step at a time. You’re in control.</p>
              </div>
              <Badge tone="purple">
                {completed.length} / {stepsForRoute.length} complete
              </Badge>
            </div>
            <details className="prerequisites">
              <summary>
                Before you start <ChevronDown size={15} />
              </summary>
              <ul>
                {readiness.prerequisites.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </details>
            <div className="checklist-note">
              <Info size={14} />
              Checking a step records your progress; it does not configure or verify anything
              externally.
            </div>
            {storageWarning && (
              <div className="notice" role="status">
                Browser storage is unavailable. Progress will last for this page session.
              </div>
            )}
            <div className="checklist">
              {stepsForRoute.map((step, i) => (
                <article
                  className={`setup-step ${completed.includes(step.id) ? 'complete' : ''}`}
                  id={`step-${step.id}`}
                  key={step.id}
                >
                  <input
                    type="checkbox"
                    disabled={!progressLoaded}
                    checked={completed.includes(step.id)}
                    onChange={() => toggle(step.id)}
                    aria-label={`Complete ${step.title}`}
                  />
                  <div className="step-body">
                    <div className="step-title">
                      <span className="step-number">{String(i + 1).padStart(2, '0')}</span>
                      <h3>{step.title}</h3>
                    </div>
                    <div className="step-tags">
                      <span>
                        {step.owner === 'Agent' ? <Bot size={11} /> : <UserRound size={11} />}{' '}
                        {step.owner}
                      </span>
                      <span>{step.stage}</span>
                      {step.effort && (
                        <span>
                          <Clock3 size={11} />
                          {step.effort}
                        </span>
                      )}
                    </div>
                    <ClaimText claim={step.detail} />
                    {step.note && <div className="technical-note">{step.note}</div>}
                    {step.blocker && (
                      <p className="step-blocker">
                        <TriangleAlert size={12} />
                        {step.blocker}
                      </p>
                    )}
                    <div className="step-actions">
                      {step.url && (
                        <OfficialLink href={step.url}>
                          {guide.sources.find((s) => s.url === step.url)?.type === 'official'
                            ? 'Official instructions'
                            : 'Source instructions (authority unverified)'}
                        </OfficialLink>
                      )}
                      <button
                        className="text-button"
                        aria-pressed={blocked.includes(step.id)}
                        onClick={() =>
                          update(
                            completed.filter((id) => id !== step.id),
                            blocked.includes(step.id)
                              ? blocked.filter((x) => x !== step.id)
                              : [...blocked, step.id],
                          )
                        }
                      >
                        {blocked.includes(step.id) ? 'Clear blocker' : 'Mark blocked'}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {route === 'custom' && guide.oauthStatus === 'supported' && callbackSource && (
              <div className="callback-panel">
                <div>
                  <LockKeyhole size={16} />
                  <strong>Match the callback. Keep secrets out of this guide.</strong>
                </div>
                <p>
                  Confirm the actual oauth_redirect_uri in your Composio auth config and register
                  that identical value with the provider. The documented v3 URI is below; defaults
                  can differ.
                </p>
                <code className="callback-code">
                  https://backend.composio.dev/api/v3/toolkits/auth/callback
                </code>
                <a className="text-link" href={`#source-${callbackSource.id}`}>
                  Callback documentation
                  <ArrowRight size={12} />
                </a>
              </div>
            )}
          </section>
          <section id="approval" className="guide-section">
            <div className="section-title">
              <div>
                <h2>Approval intelligence</h2>
                <p>Creating an app is the beginning, not an approval outcome.</p>
              </div>
              <ShieldCheck size={21} />
            </div>
            <div className="approval-flow">
              <span>App creation</span>
              <ArrowRight size={12} />
              <span>Testing</span>
              <ArrowRight size={12} />
              <span>External use</span>
              <ArrowRight size={12} />
              <span>Marketplace / security review</span>
            </div>
            {guide.approvalDetails.map((item) => (
              <div className="detail-block" key={item.title}>
                <h3>{item.title}</h3>
                <ClaimText claim={item.detail} />
              </div>
            ))}
          </section>
          <section id="ownership" className="guide-section">
            <div className="section-title">
              <div>
                <h2>A clear division of responsibility</h2>
                <p>The agent prepares the path. You own the account and the outcome.</p>
              </div>
            </div>
            <div className="ownership-grid">
              <div className="ownership-card agent">
                <h3>
                  <Bot size={20} />
                  Agent can investigate / prepare
                </h3>
                {guide.agentResponsibilities.map((item) => (
                  <p key={item}>
                    <Check size={14} />
                    {item}
                  </p>
                ))}
              </div>
              <div className="ownership-card">
                <h3>
                  <UserRound size={19} />
                  Human must complete
                </h3>
                {guide.humanResponsibilities.map((item) => (
                  <p key={item}>
                    <Circle size={11} />
                    {item}
                  </p>
                ))}
              </div>
            </div>
            <p className="small-note">
              These are responsibilities, not completed actions. See the research log for work
              actually attempted.
            </p>
          </section>
          <section id="blockers" className="guide-section">
            <div className="section-title">
              <div>
                <h2>Blockers & troubleshooting</h2>
                <p>When the happy path needs a course correction.</p>
              </div>
            </div>
            {guide.troubleshooting.map((item, i) => (
              <details className="troubleshoot" key={item.symptom} open={i === 0}>
                <summary>
                  <TriangleAlert size={15} />
                  {item.symptom}
                  <ChevronDown size={15} />
                </summary>
                <div>
                  <ClaimText claim={item.reason} />
                  <p className="fix-action">
                    <strong>
                      {item.reason.status === 'verified'
                        ? 'Next action'
                        : 'Unverified suggestion · confirm applicability'}
                    </strong>
                    {item.action}
                  </p>
                </div>
              </details>
            ))}
          </section>
          <section id="evidence" className="guide-section evidence-section">
            <div className="section-title">
              <div>
                <h2>Evidence, not just answers.</h2>
                <p>Inspect the sources and the limits behind this guide.</p>
              </div>
              <Badge>{guide.sources.length} sources</Badge>
            </div>
            <div className="detail-block">
              <h3>OAuth classification</h3>
              <ClaimText claim={guide.oauthEvidence} />
              <h3>Managed authentication classification</h3>
              <ClaimText claim={guide.managedEvidence} />
              <h3>Provider approval classification</h3>
              <ClaimText claim={guide.approvalEvidence} />
            </div>
            <div className="evidence-legend">
              <EvidenceBadge status="verified" />
              <EvidenceBadge status="estimated" />
              <EvidenceBadge status="unverified" />
              <EvidenceBadge status="not_applicable" />
            </div>
            <p className="small-note">
              “Reviewed source support” means a specific interpretation was reviewed against
              retained material. Official source authority and exact passage matching alone do not
              establish semantic support or approval.
            </p>
            <div className="source-list">
              {guide.sources.map((s, i) => (
                <article className="source-card" key={s.id} id={`source-${s.id}`}>
                  <span className="source-index">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <OfficialLink href={s.url}>{s.title}</OfficialLink>
                    <p>{s.summary}</p>
                    <small>
                      Authority: {s.authority} · Capture: {s.capture}. Topic tags indicate
                      relevance, not semantic verification.
                    </small>
                    {s.content && (
                      <details>
                        <summary>Retained fetched text</summary>
                        <p>{s.content}</p>
                      </details>
                    )}
                    {s.originalUrl && s.originalUrl !== s.url && (
                      <p>Original discovery URL: {s.originalUrl}</p>
                    )}
                    <small>
                      {s.domain} ·{' '}
                      {s.type === 'official' ? 'Official source' : 'Third-party source'} · Checked{' '}
                      {new Date(s.accessedAt).toLocaleDateString('en-US', { timeZone: 'UTC' })}
                    </small>
                  </div>
                </article>
              ))}
            </div>
            <div className="unknowns">
              <h3>
                <CircleHelpIcon />
                What remains unknown
              </h3>
              <ul>
                {guide.unknowns.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <details className="research-log">
              <summary>
                Research activity & limitations
                <ChevronDown size={15} />
              </summary>
              <div>
                <strong>Actions actually attempted</strong>
                <ul>
                  {guide.provenance.attempted.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
                <strong>Limitations</strong>
                <ul>
                  {guide.provenance.limitations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <small>
                  Guide v{guide.version} ·{' '}
                  {guide.provenance.method === 'seed_research'
                    ? 'Build-time documentation research'
                    : 'Live retrieval + AI synthesis'}{' '}
                  · Generated{' '}
                  {new Date(guide.generatedAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC
                </small>
              </div>
            </details>
          </section>
          <div className="guide-end">
            <CheckCheck size={20} />
            <span>Build with context. Launch with confidence.</span>
            <Link className="text-link" href="/providers">
              Explore another integration
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
function CircleHelpIcon() {
  return <Info size={17} />;
}
