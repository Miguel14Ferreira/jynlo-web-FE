import { ErrorHandler, Injectable } from '@angular/core';
import { environment } from '../environment/environment';

/**
 * Sends uncaught errors to the Jynlo server, which writes them to its log, and
 * still prints them to the console as Angular's default handler does.
 *
 * Reports are anonymous: sent with fetch, not HttpClient, so the login token
 * interceptor never adds the Authorization header and a failing report cannot
 * loop back into this handler. Path only, no query string. At most 10 reports
 * per page load and the same error at most once a minute.
 */
export const MAX_REPORTS_PER_PAGE = 10;
export const REPEAT_WINDOW_MS = 60_000;

export interface ClientErrorReport {
  platform: 'web';
  appVersion: string;
  route: string;
  message: string;
  stack: string;
  fatal: boolean;
}

function cut(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function buildWebReport(error: unknown, route: string): ClientErrorReport | null {
  // Errors thrown inside promises reach Angular wrapped in `rejection`.
  const inner = (error && typeof error === 'object' && 'rejection' in error)
    ? (error as { rejection: unknown }).rejection : error;
  let message = '';
  let stack = '';
  if (inner instanceof Error) {
    message = inner.name && inner.name !== 'Error' ? `${inner.name}: ${inner.message}` : inner.message;
    stack = inner.stack ?? '';
  } else if (typeof inner === 'string') {
    message = inner;
  } else if (inner && typeof inner === 'object' && typeof (inner as { message?: unknown }).message === 'string') {
    message = (inner as { message: string }).message;
  }
  message = cut(message, 300);
  if (!message) return null;
  return {
    platform: 'web',
    appVersion: '',
    route: cut(route.split('?')[0].split('#')[0], 120),
    message,
    stack: cut(stack, 1500),
    fatal: false,
  };
}

@Injectable()
export class ClientErrorHandler implements ErrorHandler {
  private sent = 0;
  private readonly lastByKey = new Map<string, number>();

  constructor() {}

  handleError(error: unknown): void {
    console.error(error);
    try {
      this.report(error);
    } catch {
      // Reporting must never cause a second error.
    }
  }

  /** @returns true when a report was sent. */
  report(error: unknown, now = Date.now()): boolean {
    if (!environment.production) return false;
    const report = buildWebReport(error, globalThis.location?.pathname ?? '');
    if (!report || this.sent >= MAX_REPORTS_PER_PAGE) return false;
    const key = report.message + '|' + (report.stack.split('\n')[0] ?? '');
    const last = this.lastByKey.get(key);
    if (last !== undefined && now - last < REPEAT_WINDOW_MS) return false;
    this.lastByKey.set(key, now);
    this.sent++;
    void fetch(environment.apiUrl + '/api/client-errors', {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    }).catch(() => {});
    return true;
  }
}
