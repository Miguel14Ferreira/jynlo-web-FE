/** Computer layout with two columns (filters or map beside the results). Phones and small windows keep one column. */
export const WIDE_SCREEN_QUERY = '(min-width: 1200px)';

export function isWideScreen(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(WIDE_SCREEN_QUERY).matches;
  } catch {
    return false;
  }
}
