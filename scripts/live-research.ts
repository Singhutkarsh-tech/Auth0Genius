import './env';
import { writeFileSync } from 'node:fs';
import { runLiveResearch } from '../src/lib/research/smoke';
const args = process.argv.slice(2);
const flag = args.indexOf('--report');
const reportPath = flag >= 0 ? args.splice(flag, 2)[1] : undefined;
const input = args.join(' ').trim() || 'Airtable';
runLiveResearch({
  base: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  input,
  accessCode: process.env.RESEARCH_ACCESS_CODE,
  report: (report) => {
    console.log(JSON.stringify(report));
    if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  },
})
  .then((report) => {
    process.exitCode = report.outcome === 'reused' ? 2 : report.outcome === 'failed' ? 1 : 0;
  })
  .catch(() => {
    console.error('Live smoke failed before a safe report was available.');
    process.exitCode = 1;
  });
