/**
 * Clicks on the empty dark area of a photo viewer close it; clicks on the photo,
 * video, buttons or the counter bar do not. Before, only the narrow strip outside
 * the dialog box closed it, so "clicking outside the photo" often did nothing.
 */
export function isLightboxBackdropClick(event: Event): boolean {
  const target = event.target as Element | null;
  if (!target || typeof target.closest !== 'function') return false;
  return !target.closest('img, video, button, a, input, textarea, select, header, [data-lightbox-keep]');
}
