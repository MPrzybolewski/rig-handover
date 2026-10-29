// Plan morning-digest § 1. Types only: the reader and the page, JSON, board link and tests
// (§ 2a–2d) all start from this file.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl.
export type RunLine = { at: string; job: string; status: RunStatus; owner: string | null; error?: string };

// One row per job, built from that job's lines in file order. Times are the log's `at`
// strings, offset kept, never converted (styleguide).
export type DigestRow = {
  job: string;
  owner: string | null; // from the job's last line; null renders as —
  runs: number; // all its lines, retries included
  retries: number; // its lines with status 'retry'
  lastStatus: RunStatus;
  lastError: string | null; // latest `error` on any of its lines, null if none
  firstAt: string;
  lastAt: string;
};

export type StatusCounts = Record<RunStatus, number>;

// A night whose file exists. An empty file (or one with only bad lines) has rows = []: "nothing ran".
export type NightDigest = {
  rows: DigestRow[]; // sorted by job; page and JSON use this order as is
  counts: StatusCounts; // good lines per status, for the board link
  badLines: number; // non-blank lines that aren't JSON or don't fit RunLine: counted, never thrown
};

// null: no runs/<night>.jsonl, or `night` isn't YYYY-MM-DD. Routes answer 404.
// The reader exports `readNight: ReadNight` from src/digest/read.ts.
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
