import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

const JOBS = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs'];
const REAL = '2026-10-28';
const EMPTY = '2026-10-27';
const MISSING = '2026-10-26';

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  process.env.LANE_MARKER = 'TEST-MARKER';
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(runsDir, `${REAL}.jsonl`), readFileSync(`runs/${REAL}.jsonl`));
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

function rowsOf(html: string): string[] {
  return html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
}

describe('digest page', () => {
  it('renders the banner and every job in job order', async () => {
    const res = await app.request(`/digest/${REAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    const positions = JOBS.map((job) => {
      const at = html.indexOf(job);
      expect(at, job).toBeGreaterThan(-1);
      return at;
    });
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('marks retries >= 3 and failures with class="warn", and only those', async () => {
    const html = await (await app.request(`/digest/${REAL}`)).text();
    const rows = rowsOf(html);
    const rowFor = (job: string) => rows.find((r) => r.includes(job));
    expect(rowFor('fixtures/refresh')).toContain('class="warn"');
    expect(rowFor('notes/backup')).toContain('class="warn"');
    expect(rowFor('lane/sync')).not.toContain('class="warn"');
    expect(rowFor('rig/rotate-logs')).not.toContain('class="warn"');
  });

  it('renders a null owner as a dash', async () => {
    const html = await (await app.request(`/digest/${REAL}`)).text();
    const row = rowsOf(html).find((r) => r.includes('digest/render'));
    expect(row).toContain('—');
  });

  it('shows the bad line count', async () => {
    const html = await (await app.request(`/digest/${REAL}`)).text();
    expect(html).toContain('bad lines: 1');
  });

  it('404s for a night with no file', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain(`no run log for ${MISSING}`);
  });

  it('says nothing ran for an empty night', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });
});

describe('digest JSON', () => {
  it('returns rows, counts and badLines', async () => {
    const res = await app.request(`/api/digest/${REAL}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as NightDigest;
    expect(Object.keys(body).sort()).toEqual(['badLines', 'counts', 'rows']);
    expect(body.rows).toHaveLength(5);
    expect(body.badLines).toBe(1);
  });

  it('agrees with the page on jobs and order', async () => {
    const body = (await (await app.request(`/api/digest/${REAL}`)).json()) as NightDigest;
    const jobs = body.rows.map((r) => r.job);
    expect(jobs).toEqual(JOBS);
    const html = await (await app.request(`/digest/${REAL}`)).text();
    const pageJobs = rowsOf(html)
      .map((r) => JOBS.find((j) => r.includes(j)))
      .filter((j): j is string => j !== undefined);
    expect(pageJobs).toEqual(jobs);
  });

  it('404s with an error body for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `no run log for ${MISSING}` });
  });

  it('returns no rows and no bad lines for an empty night', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as NightDigest;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });
});
