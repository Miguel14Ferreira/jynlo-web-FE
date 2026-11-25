/**
 * Dismiss the HTML-first splash after Angular's first route has rendered.
 * It lives outside app-root so it can appear before Angular's JS is loaded.
 */
/** Shortest time the logo stays visible after a page load or refresh. */
export const MIN_SPLASH_MS = 900;

export function dismissStartupSplash(): void {
  const splash = document.getElementById('jynlo-startup-splash');
  if (!splash || splash.classList.contains('jynlo-startup-splash--exit')) {
    return;
  }

  // On a fast computer Angular is ready in a fraction of a second and the logo
  // only flashed (or never painted). Keep it on screen briefly, like on phones.
  const sinceLoad = typeof performance !== 'undefined' ? performance.now() : MIN_SPLASH_MS;
  if (sinceLoad < MIN_SPLASH_MS) {
    window.setTimeout(() => dismissStartupSplash(), MIN_SPLASH_MS - sinceLoad);
    return;
  }
  splash.classList.add('jynlo-startup-splash--exit');
  // transitionend is not guaranteed for reduced-motion or background tabs.
  window.setTimeout(() => splash.remove(), 300);
}
