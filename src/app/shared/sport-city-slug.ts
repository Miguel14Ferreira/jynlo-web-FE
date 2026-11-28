/**
 * Address part for the public "Jogos de <desporto> em <cidade>" pages: "Padel" → "padel", "São João da Madeira" → "sao-joao-da-madeira".
 * scripts/prerender-public-pages.mjs uses the same rule when it writes the pages, so keep both in step.
 */
export function placeSlug(value: string | null | undefined): string {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** One sport and city pair, as listed in assets/jogos-index.json (written at build time). */
export interface SportCityEntry { s: string; c: string; sport: string; city: string; venues: number; }

/** Fallback name when the list is unavailable: "sao-joao-da-madeira" → "Sao Joao Da Madeira". */
export function unslug(slug: string): string {
  return String(slug ?? '').split('-').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
