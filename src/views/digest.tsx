import type { NightDigest } from '../digest/types.js';

const dash = '—';

export function DigestPage(props: { night: string; digest: NightDigest }) {
  const { night, digest } = props;
  return (
    <>
      <h1>digest {night}</h1>
      {digest.badLines > 0 ? <p class="warn">bad lines: {digest.badLines}</p> : null}
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((r) => (
              <tr class={r.retries >= 3 || r.lastStatus === 'fail' ? 'warn' : undefined}>
                <td>{r.job || dash}</td>
                <td>{r.owner ?? dash}</td>
                <td>{r.runs}</td>
                <td>{r.retries}</td>
                <td>{r.lastStatus ?? dash}</td>
                <td>{r.lastError ?? dash}</td>
                <td>{r.firstAt ?? dash}</td>
                <td>{r.lastAt ?? dash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
