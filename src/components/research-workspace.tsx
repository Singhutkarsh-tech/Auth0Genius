'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  FileSearch,
  LoaderCircle,
  LockKeyhole,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { researchStages } from '@/lib/research/state';
import { Badge } from './ui';
type Job = {
  id: string;
  query: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  currentStage: number;
  completedStages: number[];
  error: string | null;
  outputUrl: string | null;
  attempted: string[];
  sources: { id: string; title: string; url: string; type: string }[];
};
export function ResearchWorkspace({
  jobId,
  initialQuery = '',
  protectedResearch = false,
}: {
  jobId: string;
  initialQuery?: string;
  protectedResearch?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [useCase, setUseCase] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [running, setRunning] = useState(false);
  const active = useRef(false);
  const jobStatus = job?.status;
  const jobStage = job?.currentStage;
  useEffect(() => {
    if (jobId === 'new') return;
    let cancelled = false;
    async function poll() {
      try {
        const response = await fetch(`/api/research/${jobId}`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message ?? 'Could not load research');
        if (!cancelled) setJob(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Research unavailable');
      }
    }
    poll();
    const interval = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId]);
  // Restore the optional deployment access code after hydration.
  /* eslint-disable react-hooks/set-state-in-effect -- Session storage is restored once after server rendering. */
  useEffect(() => {
    if (jobId === 'new') return;
    try {
      const code = sessionStorage.getItem('auth0genius:research-code');
      if (code) setAccessCode(code);
    } catch {}
  }, [jobId]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (
      !jobStatus ||
      ['completed', 'failed'].includes(jobStatus) ||
      active.current ||
      (protectedResearch && !accessCode)
    )
      return;
    let cancelled = false;
    const run = async () => {
      active.current = true;
      setRunning(true);
      try {
        const response = await fetch(`/api/research/${jobId}`, {
          method: 'POST',
          headers: { 'x-research-access-code': accessCode },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message ?? 'Research interrupted');
        if (!cancelled) {
          setJob(data);
          setError('');
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Research interrupted');
      } finally {
        active.current = false;
        if (!cancelled) setRunning(false);
      }
    };
    const timeout = setTimeout(run, 600);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [jobStage, jobStatus, jobId, accessCode, protectedResearch]);
  useEffect(() => {
    if (job?.status === 'completed' && job.outputUrl) {
      const timer = setTimeout(() => router.push(job.outputUrl!), 1800);
      return () => clearTimeout(timer);
    }
  }, [job?.status, job?.outputUrl, router]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, useCase: useCase || undefined, accessCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? 'Could not start research');
      try {
        sessionStorage.setItem('auth0genius:research-code', accessCode);
      } catch {}
      router.push(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Research failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="research-page">
      <Link href="/providers" className="text-link subtle">
        <ArrowLeft size={13} />
        Back to integrations
      </Link>
      <div className="research-intro">
        <div className="research-emblem">
          <FileSearch size={26} />
        </div>
        <div className="eyebrow">A NEW INTEGRATION STARTS WITH EVIDENCE</div>
        <h1>
          {jobId === 'new' ? 'Meet your next integration.' : 'Investigating the path to launch.'}
        </h1>
        <p>
          {jobId === 'new'
            ? 'Give the research agent a provider name or website. Get a practical OAuth launch guide, grounded in retrieved documentation.'
            : 'Following official documentation, checking the requirements, and keeping the unknowns visible.'}
        </p>
      </div>
      {jobId === 'new' ? (
        <form className="research-form" onSubmit={submit}>
          <label htmlFor="provider-query">Provider name or official website</label>
          <input
            id="provider-query"
            placeholder="e.g. Airtable or https://airtable.com"
            required
            minLength={2}
            maxLength={200}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label htmlFor="use-case">
            What should your agent do? <span>(optional)</span>
          </label>
          <textarea
            id="use-case"
            placeholder="Read records, create tasks, or something else..."
            maxLength={500}
            rows={3}
            value={useCase}
            onChange={(e) => setUseCase(e.target.value)}
          />
          {protectedResearch && (
            <>
              <label htmlFor="access-code">Research access code</label>
              <input
                id="access-code"
                type="password"
                required
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
              />
            </>
          )}
          {error && (
            <div role="alert" className="research-error">
              <TriangleAlert size={18} />
              <strong>We couldn’t start this investigation</strong>
              <p>{error}</p>
            </div>
          )}
          <button className="button primary" disabled={busy || query.trim().length < 2}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}{' '}
            {busy ? 'Starting investigation...' : 'Research with AI'}
            <ArrowRight size={15} />
          </button>
          <p className="small-note">
            OAuth support is investigated, never assumed. No credentials required.
          </p>
        </form>
      ) : (
        <div className="research-job">
          {!job && !error && (
            <div className="empty-state">
              <LoaderCircle className="spin" />
              <p>Loading saved research state...</p>
            </div>
          )}
          {job && (
            <>
              <div className="job-heading">
                <div>
                  <strong>{job.query}</strong>
                  <span style={{ display: 'block' }}>
                    Bounded research · official sources first
                  </span>
                </div>
                <Badge tone={job.status === 'failed' ? 'amber' : 'purple'}>
                  {job.status === 'running' ? 'Researching' : job.status}
                </Badge>
              </div>
              <div aria-live="polite">
                {researchStages.map((stage, i) => {
                  const done = job.completedStages.includes(i);
                  const current = job.currentStage === i && job.status !== 'failed';
                  return (
                    <div
                      key={stage}
                      className={`research-stage ${done ? 'done' : current ? 'active' : ''}`}
                    >
                      <span>{done ? <Check size={14} /> : i + 1}</span>
                      <div>
                        <strong>{stage}</strong>
                        <small>
                          {done
                            ? 'Backend stage completed'
                            : current
                              ? running
                                ? 'Working on this stage'
                                : 'Ready to continue'
                              : 'Waiting for previous stage'}
                        </small>
                      </div>
                      {current && running && <LoaderCircle size={14} className="spin" />}
                    </div>
                  );
                })}
              </div>
              {job.status === 'failed' && (
                <div className="research-error" role="alert">
                  <TriangleAlert size={19} />
                  <strong>The investigation stopped safely.</strong>
                  <p>{job.error}</p>
                  <Link
                    href={`/research/new?q=${encodeURIComponent(job.query)}`}
                    className="button secondary"
                  >
                    Start a new investigation
                    <ArrowRight size={14} />
                  </Link>
                </div>
              )}
              {job.status === 'completed' && job.outputUrl && (
                <div className="research-complete">
                  <Check size={20} />
                  <strong>Your guide is saved and ready to share.</strong>
                  <p>Opening the guide. The URL works independently of this session.</p>
                  <Link href={job.outputUrl} className="button primary">
                    Open launch guide
                    <ArrowRight size={14} />
                  </Link>
                </div>
              )}
              {job.attempted.length > 0 && (
                <details className="research-log-list">
                  <summary>Research activity · {job.sources.length} retrieved sources</summary>
                  <ul>
                    {job.attempted.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
          {error && (
            <div role="alert" className="research-error">
              <strong>Research needs attention</strong>
              <p>{error}</p>
              <button className="button secondary" onClick={() => location.reload()}>
                Resume saved research
              </button>
            </div>
          )}
          {protectedResearch && !accessCode && (
            <form
              className="research-form"
              onSubmit={(e) => {
                e.preventDefault();
                const input = e.currentTarget.elements.namedItem('resume-code') as HTMLInputElement;
                setAccessCode(input.value);
              }}
            >
              <label>Access code to resume</label>
              <input name="resume-code" type="password" required />
              <button className="button primary">Resume investigation</button>
            </form>
          )}
        </div>
      )}
      <div className="research-limit-note">
        <LockKeyhole size={15} />
        <span>
          The agent reads public documentation. You handle logins, credentials, and provider
          submissions.
        </span>
      </div>
      <p className="research-disclosure">
        <CircleHelp size={12} style={{ display: 'inline', marginRight: 4 }} />
        Missing evidence produces explicit unknowns. Source citations are checked against retrieved
        URLs; AI interpretation may still need your review.
      </p>
    </main>
  );
}
