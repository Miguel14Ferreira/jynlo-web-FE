import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

export const SEO_SITE_URL = 'https://jynlosports.com';
export const SEO_DEFAULT_TITLE = 'Jynlo — Join the game.';
export const SEO_DEFAULT_DESCRIPTION = 'Jynlo — encontra onde, quando e com quem jogar.';
export const SEO_DEFAULT_IMAGE = `${SEO_SITE_URL}/assets/og-default.png`;

/** Per-route (or per-page) search and sharing metadata. */
export interface SeoConfig {
  /** Page name. The brand is appended; omit it on the home page. */
  title?: string;
  description?: string;
  /** Path for the canonical URL. Defaults to the current path without query or hash. */
  path?: string;
  /** Absolute URL of a 1200x630 share image. */
  image?: string;
  /**
   * `false` writes noindex,nofollow. `true` writes index,follow. Leave it out to
   * keep whatever the route already decided, which suits pages that only refine
   * the title after loading data.
   */
  index?: boolean;
}

/**
 * Keeps the document title, description, canonical link, robots directive and
 * Open Graph / Twitter tags in step with the current page.
 *
 * Routes opt in with `data: { seo: {...} }`. A route with no `seo` data is
 * treated as private or unknown and is marked noindex, so account screens never
 * reach search results by accident.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);

  private started = false;
  private currentTitle = SEO_DEFAULT_TITLE;
  private unread = 0;

  /** The page title without the unread-notification badge. */
  get pageTitle(): string {
    return this.currentTitle;
  }

  /**
   * Shows the unread-notification count in the browser tab. It lives here, and
   * not in the navbar, so that changing page never wipes the badge.
   */
  setUnreadCount(count: number): void {
    this.unread = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    const title = this.displayTitle();
    if (this.title.getTitle() !== title) this.title.setTitle(title);
  }

  /** Starts following navigation. Safe to call more than once. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => {
        const config = this.routeConfig(this.router.routerState.snapshot.root);
        this.apply({
          ...(config ?? { index: false }),
          path: config?.path ?? this.pathOf(event.urlAfterRedirects)
        });
      });
  }

  apply(config: SeoConfig = {}): void {
    const description = config.description ?? SEO_DEFAULT_DESCRIPTION;
    const image = config.image ?? SEO_DEFAULT_IMAGE;
    const fullTitle = config.title ? `${config.title} · Jynlo` : SEO_DEFAULT_TITLE;
    const path = config.path ?? this.pathOf(this.document.location?.pathname ?? '/');
    const url = `${SEO_SITE_URL}${path}`;

    this.currentTitle = fullTitle;
    this.title.setTitle(this.displayTitle());
    this.setName('description', description);
    this.setProperty('og:title', fullTitle);
    this.setProperty('og:description', description);
    this.setProperty('og:url', url);
    this.setProperty('og:image', image);
    this.setName('twitter:card', 'summary_large_image');
    this.setName('twitter:title', fullTitle);
    this.setName('twitter:description', description);
    this.setName('twitter:image', image);
    this.setCanonical(url);
    if (config.index !== undefined) {
      this.setName('robots', config.index ? 'index,follow' : 'noindex,nofollow');
    }
  }

  private displayTitle(): string {
    if (this.unread <= 0) return this.currentTitle;
    const badge = this.unread > 99 ? '99+' : String(this.unread);
    // Keep the long-standing wording for the default title.
    return this.currentTitle === SEO_DEFAULT_TITLE
      ? `Jynlo (${badge}) — Join the game.`
      : `(${badge}) ${this.currentTitle}`;
  }

  private routeConfig(root: ActivatedRouteSnapshot): SeoConfig | null {
    let node: ActivatedRouteSnapshot | null = root;
    let found: SeoConfig | null = null;
    while (node) {
      const data = node.data?.['seo'] as SeoConfig | undefined;
      if (data) found = data;
      node = node.firstChild;
    }
    return found;
  }

  private pathOf(url: string): string {
    const path = url.split('#')[0].split('?')[0];
    if (!path || path === '/') return '/';
    return path.replace(/\/+$/, '');
  }

  private setName(name: string, content: string): void {
    this.meta.updateTag({ name, content }, `name='${name}'`);
  }

  private setProperty(property: string, content: string): void {
    this.meta.updateTag({ property, content }, `property='${property}'`);
  }

  private setCanonical(url: string): void {
    const head = this.document.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      head.appendChild(link);
    }
    link.setAttribute('href', url);
  }
}
