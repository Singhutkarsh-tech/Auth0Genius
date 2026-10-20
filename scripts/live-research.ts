import './env';
const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
async function main() {
  const response = await fetch(`${base}/api/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'Airtable', accessCode: process.env.RESEARCH_ACCESS_CODE }),
  });
  const created = await response.json();
  if (!response.ok) throw new Error(created.error?.message || 'Research creation failed');
  if (!created.jobId) {
    console.log('Existing guide:', created.url);
    return;
  }
  for (let i = 0; i < 15; i++) {
    const state = await fetch(`${base}/api/research/${created.jobId}`).then((r) => r.json());
    console.log(
      JSON.stringify({
        status: state.status,
        stage: state.currentStage,
        error: state.error,
        outputUrl: state.outputUrl,
      }),
    );
    if (state.status === 'failed') {
      process.exitCode = 1;
      return;
    }
    if (state.status === 'completed') return;
    const advance = await fetch(`${base}/api/research/${created.jobId}`, {
      method: 'POST',
      headers: { 'x-research-access-code': process.env.RESEARCH_ACCESS_CODE ?? '' },
    });
    if (!advance.ok) throw new Error('Research stage request failed');
  }
  throw new Error('Research exceeded bounded stage attempts');
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
