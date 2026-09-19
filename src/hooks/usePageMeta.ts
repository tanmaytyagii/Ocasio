import { useEffect } from 'react';

/**
 * Sets document title, meta description and canonical URL for a route.
 *
 * Client-side only, so it does not help crawlers that do not execute
 * JavaScript. The important Phase 1 change is that public pages are reachable
 * without a login at all; proper SSR/prerendering is Phase 6.
 */
export function usePageMeta(title: string, description?: string) {
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
}
