import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';

import { SEO_DEFAULT_DESCRIPTION, SEO_DEFAULT_IMAGE, SEO_DEFAULT_TITLE, SEO_SITE_URL, SeoService } from './seo.service';

@Component({ template: '', standalone: true })
class BlankComponent {}

describe('SeoService', () => {
  let service: SeoService;
  let router: Router;

  const metaContent = (selector: string): string | null =>
    document.head.querySelector(selector)?.getAttribute('content') ?? null;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule.withRoutes([
        { path: '', component: BlankComponent, data: { seo: { path: '/' } } },
        { path: 'about', component: BlankComponent, data: { seo: { title: 'Sobre', description: 'Sobre a Jynlo.', index: true } } },
        { path: 'private/:id', component: BlankComponent }
      ])]
    });
    service = TestBed.inject(SeoService);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    document.head.querySelector('link[rel="canonical"]')?.remove();
    document.head.querySelectorAll(
      'meta[name="description"], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"]'
    ).forEach(tag => tag.remove());
  });

  it('writes title, description, Open Graph, Twitter and canonical tags', () => {
    service.apply({ title: 'Termos', description: 'Os termos da Jynlo.', path: '/terms', index: true });

    expect(document.title).toBe('Termos · Jynlo');
    expect(metaContent('meta[name="description"]')).toBe('Os termos da Jynlo.');
    expect(metaContent('meta[property="og:title"]')).toBe('Termos · Jynlo');
    expect(metaContent('meta[property="og:url"]')).toBe(`${SEO_SITE_URL}/terms`);
    expect(metaContent('meta[property="og:image"]')).toBe(SEO_DEFAULT_IMAGE);
    expect(metaContent('meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href'))
      .toBe(`${SEO_SITE_URL}/terms`);
    expect(metaContent('meta[name="robots"]')).toBe('index,follow');
  });

  it('falls back to the brand title and description', () => {
    service.apply({ path: '/' });

    expect(document.title).toBe(SEO_DEFAULT_TITLE);
    expect(metaContent('meta[name="description"]')).toBe(SEO_DEFAULT_DESCRIPTION);
    expect(service.pageTitle).toBe(SEO_DEFAULT_TITLE);
  });

  it('marks a page noindex only when asked and otherwise leaves robots alone', () => {
    service.apply({ path: '/x', index: false });
    expect(metaContent('meta[name="robots"]')).toBe('noindex,nofollow');

    // A page that only refines its title after loading data must not flip it back.
    service.apply({ title: 'Pavilhão', path: '/venues/1' });
    expect(metaContent('meta[name="robots"]')).toBe('noindex,nofollow');

    service.apply({ title: 'Pavilhão', path: '/venues/1', index: true });
    expect(metaContent('meta[name="robots"]')).toBe('index,follow');
  });

  it('applies route data on navigation and marks routes without seo data noindex', async () => {
    service.start();
    service.start(); // idempotent

    await router.navigateByUrl('/about?utm=x#top');
    expect(document.title).toBe('Sobre · Jynlo');
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href'))
      .toBe(`${SEO_SITE_URL}/about`);
    expect(metaContent('meta[name="robots"]')).toBe('index,follow');

    await router.navigateByUrl('/private/42');
    expect(document.title).toBe(SEO_DEFAULT_TITLE);
    expect(metaContent('meta[name="robots"]')).toBe('noindex,nofollow');
  });
});
