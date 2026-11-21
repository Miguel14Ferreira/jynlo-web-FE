import { buildWebReport, ClientErrorHandler, MAX_REPORTS_PER_PAGE, REPEAT_WINDOW_MS } from './client-error-handler';
import { environment } from '../environment/environment';

describe('ClientErrorHandler', () => {
  let originalProduction: boolean;

  beforeEach(() => {
    originalProduction = environment.production;
    (environment as { production: boolean }).production = true;
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(null, { status: 202 })));
  });

  afterEach(() => {
    (environment as { production: boolean }).production = originalProduction;
  });

  it('builds an anonymous, path-only report and unwraps promise rejections', () => {
    const report = buildWebReport({ rejection: new TypeError('bad') }, '/sessions/9?token=abc');
    expect(report?.message).toBe('TypeError: bad');
    expect(report?.route).toBe('/sessions/9');
    expect(report?.platform).toBe('web');
    expect(buildWebReport(new Error(''), '/')).toBeNull();
    expect(buildWebReport(undefined, '/')).toBeNull();
  });

  it('sends without credentials or the Authorization header', () => {
    const handler = new ClientErrorHandler();
    expect(handler.report(new Error('boom'), 0)).toBeTrue();
    const [url, init] = (window.fetch as jasmine.Spy).calls.mostRecent().args as [string, RequestInit];
    expect(url).toContain('/api/client-errors');
    expect(init.credentials).toBe('omit');
    expect(JSON.stringify(init.headers)).not.toContain('Authorization');
  });

  it('drops repeats within a minute and caps a page load', () => {
    const handler = new ClientErrorHandler();
    expect(handler.report(new Error('same'), 0)).toBeTrue();
    expect(handler.report(new Error('same'), 1000)).toBeFalse();
    expect(handler.report(new Error('same'), REPEAT_WINDOW_MS)).toBeTrue();
    let sent = 2;
    for (let i = 0; i < 30; i++) if (handler.report(new Error('e' + i), REPEAT_WINDOW_MS)) sent++;
    expect(sent).toBe(MAX_REPORTS_PER_PAGE);
  });

  it('does not report during local development', () => {
    (environment as { production: boolean }).production = false;
    expect(new ClientErrorHandler().report(new Error('dev'), 0)).toBeFalse();
  });
});
