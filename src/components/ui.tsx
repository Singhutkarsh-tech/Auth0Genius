'use client';
import { type ReactNode, useState } from 'react';
import Image from 'next/image';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ArrowUpRight, Check, CircleHelp } from 'lucide-react';
import type { Claim, Guide } from '@/lib/validation';
export const cn = (...values: Parameters<typeof clsx>) => twMerge(clsx(values));
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function EvidenceBadge({ status }: { status: Claim['status'] }) {
  return (
    <span className={`evidence-label ${status}`}>
      {status === 'verified' ? <Check size={11} /> : <CircleHelp size={11} />}
      {
        {
          verified: 'Documentation supported',
          estimated: 'Estimated',
          unverified: 'Unverified',
          not_applicable: 'Not applicable',
        }[status]
      }
    </span>
  );
}
export function ExternalLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a className={className ?? 'text-link'} href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <ArrowUpRight size={13} />
    </a>
  );
}
export function ClaimText({ claim }: { claim: Claim }) {
  return (
    <div>
      <p>{claim.text}</p>
      <div className="claim-meta">
        <EvidenceBadge status={claim.status} />
        {claim.sourceIds.map((id) => (
          <a key={id} href={`#source-${id}`} className="citation">
            [{id}]
          </a>
        ))}
      </div>
      {claim.support && (
        <details className="claim-passages">
          <summary>
            {claim.support.review === 'reviewed'
              ? 'Reviewed evidence summary'
              : claim.support.review === 'rule_checked' ? 'Automatically checked source passages' : 'Supporting passages · review unresolved'}
          </summary>
          {claim.support.references.map((ref, i) => (
            <blockquote key={i}>
              <p>{ref.passage}</p>
              <a className="citation" href={`#source-${ref.sourceId}`}>
                [{ref.sourceId}]
              </a>
            </blockquote>
          ))}
        </details>
      )}
    </div>
  );
}
export function ProviderLogo({
  guide,
  large = false,
}: {
  guide: Pick<Guide, 'name' | 'logo'>;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn('provider-logo', large && 'provider-logo-lg')}>
      {guide.logo && !failed ? (
        <Image
          src={guide.logo}
          alt={`${guide.name} logo`}
          width={large ? 30 : 23}
          height={large ? 30 : 23}
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-label={guide.name}>{guide.name.slice(0, 1)}</span>
      )}
    </span>
  );
}
