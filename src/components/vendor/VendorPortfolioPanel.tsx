import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  deletePortfolioImage,
  listMyMedia,
  uploadPortfolioImage,
} from '../../services/vendorWorkspace';
import { Button, EmptyState, ErrorState, Panel, TextField } from '../ui';
import type { VendorMedia } from '../../types/database';

/**
 * Portfolio management.
 *
 * Uploads go to the vendor-portfolio bucket at {vendor_id}/{uuid}.{ext}. The
 * vendor id in that path is checked back against owns_vendor() by the storage
 * policy, so the path is a claim the database verifies rather than something
 * this component is trusted to get right.
 *
 * No image library. The bucket enforces type and size, the browser previews
 * the file it already has, and resizing client-side would mean shipping a
 * codec to every vendor for a five-image gallery.
 */
const MAX_MB = MAX_IMAGE_BYTES / (1024 * 1024);

const VendorPortfolioPanel = ({ vendorId }: { vendorId: string }) => {
  const [media, setMedia] = useState<VendorMedia[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [altText, setAltText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMedia(await listMyMedia(vendorId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your portfolio.');
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Object URLs are revoked when the selection changes, so a vendor who picks
  // several files in a row does not leak one per attempt.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const choose = (selected: File | null) => {
    setUploadError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!ACCEPTED_IMAGE_TYPES.includes(selected.type)) {
      setUploadError('Choose a JPEG, PNG, WebP or AVIF image.');
      setFile(null);
      return;
    }
    if (selected.size > MAX_IMAGE_BYTES) {
      setUploadError(`That image is larger than ${MAX_MB} MB. Choose a smaller file.`);
      setFile(null);
      return;
    }
    setFile(selected);
  };

  const upload = async () => {
    if (!file || uploading) return;
    setUploading(true);
    setUploadError(null);
    try {
      await uploadPortfolioImage(vendorId, file, altText, media?.length ?? 0);
      setFile(null);
      setAltText('');
      if (inputRef.current) inputRef.current.value = '';
      await load();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'We could not upload that image.');
    } finally {
      setUploading(false);
    }
  };

  const remove = async (item: VendorMedia) => {
    if (!window.confirm('Remove this image from your portfolio?')) return;
    setBusyId(item.id);
    try {
      await deletePortfolioImage(item);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that image.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Panel title="Portfolio">
      <p className="-mt-2 mb-6 text-sm text-muted">
        Photographs of your own work. These appear on your public listing. JPEG, PNG, WebP or AVIF,
        up to {MAX_MB} MB each.
      </p>

      <div className="rounded-card border border-line bg-canvas p-5">
        <label htmlFor="portfolio-file" className="mb-1.5 block text-sm font-medium text-ink-soft">
          Choose an image
        </label>
        <input
          ref={inputRef}
          id="portfolio-file"
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-ink-soft file:mr-4 file:h-10 file:cursor-pointer file:rounded-control file:border-0 file:bg-brand-600 file:px-4 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
        />

        {preview && (
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
            <img
              src={preview}
              alt=""
              width={160}
              height={120}
              className="h-[120px] w-[160px] shrink-0 rounded-card border border-line object-cover"
            />
            <div className="min-w-0 flex-1">
              <TextField
                label="Describe this image"
                value={altText}
                maxLength={160}
                hint="Read aloud to people using a screen reader."
                onChange={(e) => setAltText(e.target.value)}
              />
            </div>
          </div>
        )}

        {uploadError && (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {uploadError}
          </p>
        )}

        <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {file && (
            <Button
              variant="secondary"
              size="sm"
              disabled={uploading}
              onClick={() => {
                setFile(null);
                setAltText('');
                if (inputRef.current) inputRef.current.value = '';
              }}
            >
              Clear
            </Button>
          )}
          <Button size="sm" onClick={() => void upload()} disabled={!file} loading={uploading}>
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            {uploading ? 'Uploading…' : 'Upload image'}
          </Button>
        </div>
      </div>

      <div className="mt-8">
        {loading && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="aspect-[4/3] animate-pulse rounded-card bg-line" />
            ))}
          </div>
        )}

        {error && !loading && <ErrorState message={error} onRetry={() => void load()} />}

        {!loading && !error && media?.length === 0 && (
          <EmptyState
            title="No portfolio images yet"
            description="Customers use these to decide. Upload a few photographs of work you have done."
          />
        )}

        {!loading && !error && media && media.length > 0 && (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {media.map((item) => (
              <li key={item.id} className="group relative">
                <img
                  src={item.url}
                  alt={item.alt_text ?? 'Portfolio image'}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[4/3] w-full rounded-card border border-line object-cover"
                />
                <Button
                  size="sm"
                  variant="danger"
                  loading={busyId === item.id}
                  onClick={() => void remove(item)}
                  className="absolute right-2 top-2"
                  aria-label={`Remove ${item.alt_text ?? 'portfolio image'}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
};

export default VendorPortfolioPanel;
