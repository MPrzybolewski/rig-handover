import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

// runs/ is read-only: only ever read from here. Anything written goes to a temp dir.
const RUNS = fileURLToPath(new URL('../runs', import.meta.url));

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight(RUNS, '2026-10-28');
  const row = (job: string) => night?.rows.find((r) => r.job === job);

  it('gives one row per job, sorted by job, and counts the bad line', () => {
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night?.badLines).toBe(1);
    expect(night?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('folds retries into one row with the latest error', () => {
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps the offset and spans the night across midnight', () => {
    expect(row('lane/sync')).toMatchObject({
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
  });

  it('shows a failure with its error', () => {
    expect(row('notes/backup')).toMatchObject({ owner: 'lane-07', runs: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps a row whose owner is null', () => {
    expect(row('digest/render')).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok', lastError: null });
  });
});

describe('readNight on a temp runs dir', () => {
  let dir: string;
  const write = (name: string, lines: string[]) => writeFileSync(join(dir, name), lines.join('\n'));

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-read-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when the night has no file, or the runs dir is missing', () => {
    expect(readNight(dir, '2026-10-28')).toBeNull();
    expect(readNight(join(dir, 'nope'), '2026-10-28')).toBeNull();
  });

  it('returns null when the night is not YYYY-MM-DD, even if such a file exists', () => {
    write('latest.jsonl', ['{"at":"2026-10-29T01:00:00+01:00","job":"a","status":"ok","owner":"rook"}']);
    for (const night of ['latest', '', '2026-10-2', '2026-10-28.jsonl', '../2026-10-28', '2026-10-28\n']) {
      expect(readNight(dir, night)).toBeNull();
    }
  });

  it('reads an empty file as nothing ran', () => {
    write('2026-10-30.jsonl', []);
    expect(readNight(dir, '2026-10-30')).toEqual({ rows: [], counts: { ok: 0, retry: 0, fail: 0 }, badLines: 0 });
  });

  it('counts lines that are not JSON or not a run line, skips blank ones, never throws', () => {
    const ok = '{"at":"2026-10-29T01:00:00+01:00","job":"a","status":"ok","owner":"rook"}';
    write('2026-10-31.jsonl', [
      '',
      '   ',
      ok,
      'not json',
      '42',
      'null',
      '[]',
      '{"at":"2026-10-29T02:00:00+01:00","job":"a","status":"done","owner":"rook"}',
      '{"at":"2026-10-29T02:00:00+01:00","job":"a","status":"ok"}',
      '{"at":"2026-10-29T02:00:00+01:00","job":"a","status":"fail","owner":"rook","error":503}',
      '{"job":"a","status":"ok","owner":"rook"}',
      '',
    ]);
    const night = readNight(dir, '2026-10-31');
    expect(night?.badLines).toBe(8);
    expect(night?.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
    expect(night?.rows).toHaveLength(1);
  });

  it('gives rows = [] when every line is bad', () => {
    write('2026-11-01.jsonl', ['{', 'oops']);
    expect(readNight(dir, '2026-11-01')).toEqual({ rows: [], counts: { ok: 0, retry: 0, fail: 0 }, badLines: 2 });
  });

  it('takes the owner from the last line and keeps the latest error after recovery', () => {
    write('2026-11-02.jsonl', [
      '{"at":"2026-11-02T01:00:00-05:00","job":"j","status":"fail","owner":"rook","error":"first"}',
      '{"at":"2026-11-02T01:05:00-05:00","job":"j","status":"retry","owner":"rook","error":"second"}',
      '{"at":"2026-11-02T01:10:00-05:00","job":"j","status":"ok","owner":null}',
    ]);
    expect(readNight(dir, '2026-11-02')?.rows).toEqual([
      {
        job: 'j',
        owner: null,
        runs: 3,
        retries: 1,
        lastStatus: 'ok',
        lastError: 'second',
        firstAt: '2026-11-02T01:00:00-05:00',
        lastAt: '2026-11-02T01:10:00-05:00',
      },
    ]);
  });
});
