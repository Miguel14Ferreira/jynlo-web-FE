import { environment } from 'src/environment/environment';

let reports = 0;

/**
 * When sending a chat message took too long, tell the server where the time went
 * (waiting in the browser, connecting, waiting for the server, downloading).
 * Only timings and the chat kind; never the text, names or ids.
 */
export function reportSlowSend(kind: string, startedAt: number, outcome: 'ok' | 'error' | 'timeout', urlPart: string): void {
  try {
    const ms = Math.round(performance.now() - startedAt);
    if (ms < 2500 || reports >= 5 || !environment.production) return;
    reports++;
    const entries = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      .filter(e => e.name.includes(urlPart) && e.startTime >= startedAt - 50);
    const e = entries[entries.length - 1];
    const phase = (a: number, b: number) => (a > 0 && b > 0 ? Math.round(b - a) : -1);
    const detail = e
      ? `queue=${phase(e.startTime, e.connectStart || e.requestStart)} connect=${phase(e.connectStart, e.connectEnd)}`
        + ` wait=${phase(e.requestStart, e.responseStart)} download=${phase(e.responseStart, e.responseEnd)}`
        + ` proto=${(e.nextHopProtocol || '?').slice(0, 8)} total=${Math.round(e.duration)}`
      : 'no-timing';
    const inFlight = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      .filter(x => x.name.includes('api.jynlosports.com') && x.startTime < startedAt + ms && x.responseEnd > startedAt).length;
    void fetch(environment.apiUrl + '/api/client-errors', {
      method: 'POST', credentials: 'omit', cache: 'no-store', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'web', appVersion: '', route: (location.pathname || '').slice(0, 120),
        message: `SLOW_CHAT_SEND kind=${kind} outcome=${outcome} ms=${ms} ${detail} overlapping=${inFlight}`.slice(0, 300),
        stack: '', fatal: false,
      }),
    }).catch(() => {});
  } catch { /* reporting never breaks the chat */ }
}
