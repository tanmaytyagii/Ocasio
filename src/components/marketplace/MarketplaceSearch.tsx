import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X, Tag, MapPin, CornerDownLeft } from 'lucide-react';
import type { CategoryCount, FilterOptions } from '../../types/database';

/**
 * The marketplace's primary discovery control.
 *
 * Typing still does exactly what it did before — it sets `q`, which
 * search_vendors() resolves through full-text plus trigram matching. What is
 * new is the scope shortcut: if what you typed names a real category or a real
 * location, the suggestion list offers to filter by it instead of searching for
 * the word.
 *
 *   "photography"  →  Category · Photography      (sets category=Photography)
 *                     or search the text          (sets q=photography)
 *
 * Suggestions are derived entirely from data the page already has: the
 * `filter_options()` lists it loads for the filter controls, and the
 * `category_counts()` rows it loads for the counts. No new request, no new RPC,
 * no client-side scan of the vendor set.
 *
 * There are deliberately no service suggestions. Services live per vendor in
 * vendor_services and nothing exposes a distinct list of them, so offering
 * "Wedding Photography" as a suggestion would mean either a new backend
 * endpoint or an invented list. The free-text query already searches service
 * names server-side, which is the honest version of that feature.
 */
interface Suggestion {
  kind: 'category' | 'location' | 'text';
  value: string;
  count?: number;
}

interface Props {
  /** The committed query from the URL. */
  query: string;
  options: FilterOptions | null;
  categoryCounts: CategoryCount[];
  onSearch: (query: string) => void;
  onPickCategory: (category: string) => void;
  onPickLocation: (location: string) => void;
  placeholder?: string;
}

const MarketplaceSearch = ({
  query,
  options,
  categoryCounts,
  onSearch,
  onPickCategory,
  onPickLocation,
  placeholder = 'Search vendors, services or categories…',
}: Props) => {
  const [draft, setDraft] = useState(query);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // The URL is the source of truth; if it changes underneath (back button, a
  // chip removal, a fresh navigation) the field follows it.
  useEffect(() => setDraft(query), [query]);

  const countOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of categoryCounts) m.set(c.category.toLowerCase(), c.vendor_count);
    return m;
  }, [categoryCounts]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const term = draft.trim().toLowerCase();
    if (term.length < 2) return [];

    const matches = (s: string) => s.toLowerCase().includes(term);

    const categories: Suggestion[] = (options?.categories ?? [])
      .filter(matches)
      .slice(0, 4)
      .map((value) => ({ kind: 'category', value, count: countOf.get(value.toLowerCase()) }));

    const locations: Suggestion[] = (options?.locations ?? [])
      .filter(matches)
      .slice(0, 3)
      .map((value) => ({ kind: 'location', value }));

    return [...categories, ...locations, { kind: 'text', value: draft.trim() }];
  }, [draft, options, countOf]);

  useEffect(() => setCursor(-1), [draft]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const commit = (s: Suggestion) => {
    setOpen(false);
    if (s.kind === 'category') onPickCategory(s.value);
    else if (s.kind === 'location') onPickLocation(s.value);
    else onSearch(s.value);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (c + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (c <= 0 ? suggestions.length - 1 : c - 1));
    } else if (e.key === 'Enter' && cursor >= 0) {
      e.preventDefault();
      commit(suggestions[cursor]);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <form
        role="search"
        aria-label="Search the marketplace"
        onSubmit={(e) => {
          e.preventDefault();
          setOpen(false);
          onSearch(draft.trim());
        }}
      >
        <label htmlFor="marketplace-q" className="sr-only">
          Search vendors, services or categories
        </label>

        <div className="group relative flex items-center rounded-[0.875rem] border border-line-strong bg-surface shadow-card transition-all duration-200 focus-within:border-brand-500 focus-within:shadow-card-hover">
          <Search
            className="pointer-events-none absolute left-4 h-[1.15rem] w-[1.15rem] text-muted transition-colors duration-200 group-focus-within:text-brand-600"
            aria-hidden="true"
          />

          <input
            ref={inputRef}
            id="marketplace-q"
            type="text"
            value={draft}
            placeholder={placeholder}
            autoComplete="off"
            role="combobox"
            aria-expanded={open && suggestions.length > 0}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={cursor >= 0 ? `${listId}-${cursor}` : undefined}
            onChange={(e) => {
              setDraft(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className="h-14 w-full rounded-[0.875rem] border-0 bg-transparent pl-12 pr-28 text-[0.975rem] text-ink placeholder:text-muted focus:ring-0 sm:h-[3.75rem] sm:text-base"
          />

          {draft && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setDraft('');
                onSearch('');
                inputRef.current?.focus();
              }}
              className="absolute right-[6.25rem] flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-canvas hover:text-ink sm:right-[7rem]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}

          <button
            type="submit"
            className="absolute right-2 inline-flex h-10 items-center rounded-control bg-brand-600 px-4 text-sm font-medium text-white transition-colors duration-200 hover:bg-brand-700 sm:h-11 sm:px-5"
          >
            Search
          </button>
        </div>
      </form>

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search suggestions"
          className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-40 animate-rise-in overflow-hidden rounded-card border border-line bg-surface py-1.5 shadow-overlay"
        >
          {suggestions.map((s, i) => {
            const selected = i === cursor;
            return (
              <li key={`${s.kind}-${s.value}`} id={`${listId}-${i}`} role="option" aria-selected={selected}>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => commit(s)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                    selected ? 'bg-brand-50' : ''
                  }`}
                >
                  {s.kind === 'category' && (
                    <Tag className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                  )}
                  {s.kind === 'location' && (
                    <MapPin className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                  )}
                  {s.kind === 'text' && (
                    <CornerDownLeft className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  )}

                  <span className="min-w-0 flex-1 truncate text-ink">
                    {s.kind === 'text' ? (
                      <>
                        Search for <span className="font-medium">“{s.value}”</span>
                      </>
                    ) : (
                      <span className="font-medium">{s.value}</span>
                    )}
                  </span>

                  <span className="shrink-0 text-xs text-muted">
                    {s.kind === 'category' && (
                      <>
                        Category
                        {typeof s.count === 'number' && ` · ${s.count}`}
                      </>
                    )}
                    {s.kind === 'location' && 'Location'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default MarketplaceSearch;
