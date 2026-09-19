import { useParams } from 'react-router-dom';
import VendorDiscovery from '../components/VendorDiscovery';
import { usePageMeta } from '../hooks/usePageMeta';

/**
 * Category pages are the discovery surface with the category pinned. The URL
 * segment is title-cased to match the stored category value; there is no
 * hardcoded per-category vendor list.
 */
const CategoryPage = () => {
  const { categoryName = '' } = useParams();
  const label = categoryName.charAt(0).toUpperCase() + categoryName.slice(1).toLowerCase();

  usePageMeta(
    `${label} vendors — Ocasio`,
    `Compare ${label.toLowerCase()} vendors for weddings, corporate events and parties across India.`,
  );

  return (
    <VendorDiscovery
      title={`${label} vendors`}
      subtitle={`Browse ${label.toLowerCase()} vendors across India.`}
      fixedCategory={label}
    />
  );
};

export default CategoryPage;
