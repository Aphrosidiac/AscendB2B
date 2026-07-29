import type { Category, PaginatedResponse, Product, PublicKit, PublicCampaign } from '@/types';

// Server-side data fetching for SSR/metadata. The browser talks to the API via the
// nginx-proxied relative /api path, so NEXT_PUBLIC_API_URL is empty in prod — server
// code must use an absolute origin or fetch() throws (no base URL).
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3105';

async function getJson<T>(path: string, fallback: T, tags: string[] = ['products']): Promise<T> {
  try {
    // Tagged so the backend can trigger immediate invalidation via
    // /api/revalidate after an admin save — see backend/src/utils/revalidate.ts.
    // revalidate: 3600 stays as the fallback ceiling if that ping never arrives.
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 3600, tags } });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export const getProductServer = (slug: string) =>
  getJson<Product | null>(`/api/v1/products/${encodeURIComponent(slug)}`, null);

export const getSettingsServer = () =>
  getJson<Record<string, string>>(`/api/v1/settings`, {});

export const getCategoriesServer = () => getJson<Category[]>(`/api/v1/categories`, []);

export const getProductsServer = (params?: {
  limit?: number;
  category?: string;
  search?: string;
  featured?: boolean;
}) => {
  const query: Record<string, string> = {};
  if (params?.limit) query.limit = String(params.limit);
  if (params?.category) query.category = params.category;
  if (params?.search) query.search = params.search;
  if (params?.featured) query.featured = 'true';

  return getJson<PaginatedResponse<Product>>(
    `/api/v1/products?${new URLSearchParams(query).toString()}`,
    { data: [], pagination: { page: 1, limit: 0, total: 0, totalPages: 0 } }
  );
};

// Kits & campaigns carry their own 'kits' tag so an admin kit/campaign/batch
// save can invalidate them without dumping the whole product cache (and vice
// versa). Note the `available` count in a cached response is a snapshot: it
// also moves when unrelated orders ship, which fires no revalidation ping at
// all. Purchase panels re-fetch it live on mount for that reason, and order
// creation re-checks component stock regardless — treat any SSR'd
// availability as advisory.
export const getKitsServer = (params?: { limit?: number; campaignId?: string }) => {
  const query: Record<string, string> = { limit: String(params?.limit ?? 100) };
  if (params?.campaignId) query.campaignId = params.campaignId;

  return getJson<PaginatedResponse<PublicKit>>(
    `/api/v1/kits?${new URLSearchParams(query).toString()}`,
    { data: [], pagination: { page: 1, limit: 0, total: 0, totalPages: 0 } },
    ['kits']
  );
};

export const getKitServer = (id: string) =>
  getJson<PublicKit | null>(`/api/v1/kits/${encodeURIComponent(id)}`, null, ['kits']);

export const getCampaignsServer = (params?: { limit?: number }) =>
  getJson<PaginatedResponse<PublicCampaign>>(
    `/api/v1/campaigns?limit=${params?.limit ?? 50}`,
    { data: [], pagination: { page: 1, limit: 0, total: 0, totalPages: 0 } },
    ['kits']
  );

export const getCampaignServer = (id: string) =>
  getJson<PublicCampaign | null>(`/api/v1/campaigns/${encodeURIComponent(id)}`, null, ['kits']);
