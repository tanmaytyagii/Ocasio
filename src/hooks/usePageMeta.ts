import { useEffect } from 'react';

/**
 * Sets document title, meta description, canonical URL and — where a route
 * asks for it — robots directives.
 *
 * Client-side only, so it does not help crawlers that do not execute
 * JavaScript. The important Phase 1 change is that public pages are reachable
 * without a login at all; proper SSR/prerendering is Phase 6.
 *
 * `robots` is opt-in and removed on unmount. A route that does not ask for one
 * never gets a tag, and the tag cannot outlive the route that set it — React
 * runs an unmounting component's cleanup before the next route's effects, so
 * navigating from /auth to the marketplace cannot leave the marketplace
 * marked noindex.
 */
export function usePageMeta(title: string, description?: string, robots?: string) {
  useEffect(() => {
    document.title = title;

    if (description) {
      let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!tag) {
        tag = document.createElement('meta');
        tag.name = 'description';
        document.head.appendChild(tag);
      }
      tag.content = description;
    }

    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = window.location.origin + window.location.pathname;
  }, [title, description]);

  useEffect(() => {
    if (!robots) return;

    const tag = document.createElement('meta');
    tag.name = 'robots';
    tag.content = robots;
    document.head.appendChild(tag);

    return () => {
      tag.remove();
    };
  }, [robots]);
}
