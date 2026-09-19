import { useSearchParams } from 'react-router-dom';
import VendorDiscovery from '../components/VendorDiscovery';
import { usePageMeta } from '../hooks/usePageMeta';

const SearchResults = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';

  usePageMeta(
    query ? `"${query}" — vendor search — Ocasio` : 'Search vendors — Ocasio',
    'Search venues, catering, photography and decoration vendors across India.',
  );

  return (
    <VendorDiscovery
      title={query ? `Results for "${query}"` : 'Search vendors'}
      subtitle={query ? undefined : 'Use the search box or filters to find vendors.'}
    />
  );
};

export default SearchResults;
