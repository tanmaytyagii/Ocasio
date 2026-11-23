import { CoverageResponseSchema, type CoverageResponse } from '@ocasio/contracts';

export type CoverageMarket = CoverageResponse['items'][number];

export type CoverageResult =
  | { ok: true; items: CoverageMarket[] }
  | { ok: false; items: []; message: string };

/** This server-only request never exposes the internal API address to visitors. */
export async function getCoverage(): Promise<CoverageResult> {
  try {
    const baseUrl = process.env.INTERNAL_API_URL ?? 'http://127.0.0.1:4100';
    const response = await fetch(new URL('/api/v1/coverage', baseUrl), {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Coverage request failed');
    const { items } = CoverageResponseSchema.parse(await response.json());
    return { ok: true, items };
  } catch (error) {
    console.error("Coverage request failed", error instanceof Error ? error.name : "Unknown error");
    return { ok: false, items: [], message: 'We couldn’t load our city updates. Please try again.' };
  }
}
