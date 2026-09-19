import VendorDiscovery from '../components/VendorDiscovery';
import { usePageMeta } from '../hooks/usePageMeta';

const VendorsIndex = () => {
  usePageMeta(
    'Browse event vendors — Ocasio',
    'Browse venues, catering, photography and decoration vendors for weddings, corporate events and parties across India.',
  );

  return (
    <VendorDiscovery
      title="All vendors"
      subtitle="Search, filter and compare vendors across India."
    />
  );
};

export default VendorsIndex;
