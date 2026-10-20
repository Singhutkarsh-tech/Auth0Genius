export const researchStages = [
  'Identifying provider',
  'Checking OAuth support',
  'Finding official documentation',
  'Reviewing approval requirements',
  'Building guide',
  'Validating evidence',
  'Saving guide',
] as const;
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';
export function canTransition(from: JobStatus, to: JobStatus) {
  return (
    {
      queued: ['running', 'failed'],
      running: ['running', 'completed', 'failed'],
      completed: [],
      failed: [],
    } as Record<JobStatus, JobStatus[]>
  )[from].includes(to);
}
export function assertStageAdvance(current: number, next: number) {
  if (
    !Number.isInteger(current) ||
    !Number.isInteger(next) ||
    current < 0 ||
    next !== current + 1 ||
    next > researchStages.length
  )
    throw new Error('Invalid research stage transition');
}
