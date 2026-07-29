import axios from 'axios';
import type {
  Category,
  Product,
  Order,
  PaginatedResponse,
  AdminEmailsResponse,
  CompanyProfile,
  CompanyAddress,
  CompanyAddressType,
  CompanyOrder,
  Quotation,
  Invoice,
  InvoiceReceivablesSummary,
  UnbilledCompanyRow,
  UnbilledItem,
  AdminOrder,
  AdminShipment,
  PreorderCampaign,
  Batch,
  Kit,
  PublicKit,
  PublicCampaign,
  AdminCompany,
} from '@/types';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? '',
});

export const COMPANY_TOKEN_KEY = 'ascend-company-token';

// Auto-clear expired/invalid JWTs on any 401 from a request that actually
// sent an Authorization header (admin or company calls — public
// customer-facing routes never send auth headers, so they're unaffected).
// Admin also gets a hard redirect to its login page; company pages just drop
// the stale token and let useCompanyAuth's own state (isAuthenticated) drive
// the UI, since a signed-out company can still browse the public storefront.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      error.config?.headers?.Authorization &&
      typeof window !== 'undefined'
    ) {
      if (window.location.pathname.startsWith('/admin')) {
        localStorage.removeItem('ascend-admin-token');
        window.location.href = '/admin/login';
      } else {
        localStorage.removeItem(COMPANY_TOKEN_KEY);
      }
    }
    return Promise.reject(error);
  }
);

const authHeader = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

// Public
export const getCategories = () =>
  api.get<Category[]>('/api/v1/categories').then((r) => r.data);

export const getProducts = (params?: { category?: string; search?: string; page?: number; limit?: number }) =>
  api.get<PaginatedResponse<Product>>('/api/v1/products', { params }).then((r) => r.data);

export const getProduct = (slug: string) =>
  api.get<Product>(`/api/v1/products/${slug}`).then((r) => r.data);

// Public kits/campaigns. Both endpoints only ever return what's actually
// orderable — an inactive kit, or one whose pre-order campaign isn't OPEN, is
// filtered out server-side (backend/src/utils/kit-availability.ts), so these
// need no extra client-side gating. `available` is how many whole kits could
// be assembled from current component stock.
export const getKits = (params?: { campaignId?: string; search?: string; page?: number; limit?: number }) =>
  api.get<PaginatedResponse<PublicKit>>('/api/v1/kits', { params }).then((r) => r.data);

export const getKit = (id: string) =>
  api.get<PublicKit>(`/api/v1/kits/${id}`).then((r) => r.data);

export const getCampaigns = (params?: { page?: number; limit?: number }) =>
  api.get<PaginatedResponse<PublicCampaign>>('/api/v1/campaigns', { params }).then((r) => r.data);

export const getCampaign = (id: string) =>
  api.get<PublicCampaign>(`/api/v1/campaigns/${id}`).then((r) => r.data);

export const createOrder = (data: {
  customerName: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  state: string;
  postcode: string;
  paymentMethod: 'WHATSAPP' | 'BILLPLZ';
  notes?: string;
  items: { variantId: string; quantity: number }[];
  discountCode?: string;
  idempotencyKey?: string;
}) => api.post<{ order: Order; whatsappUrl?: string; paymentUrl?: string }>('/api/v1/orders', data).then((r) => r.data);

export const lookupOrders = (phone?: string, orderNumber?: string) =>
  api.get<Order[]>('/api/v1/orders/lookup', { params: { ...(phone && { phone }), ...(orderNumber && { orderNumber }) } }).then((r) => r.data);

export const getReceiptData = (orderNumber: string, phone: string) =>
  api.get<Order>(`/api/v1/orders/receipt/${encodeURIComponent(orderNumber)}`, { params: { phone } }).then((r) => r.data);

export const getReceiptPdfUrl = (orderNumber: string, phone: string) =>
  `/api/v1/orders/receipt/${encodeURIComponent(orderNumber)}/pdf?phone=${encodeURIComponent(phone)}`;

// Fetches the receipt PDF with a normal Authorization header and opens it in
// a new tab via a short-lived object URL. Replaces the old ?token= URL, which
// leaked the admin JWT into browser history / server access logs.
export const adminOpenReceiptPdf = (token: string, id: string) =>
  api.get<Blob>(`/api/v1/admin/orders/${id}/receipt`, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'blob',
  }).then((r) => {
    const url = URL.createObjectURL(r.data);
    window.open(url, '_blank', 'noopener,noreferrer');
    // Revoke once the new tab has had time to load the blob — revoking
    // synchronously can abort the load in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });

export const getSettings = () =>
  api.get<Record<string, string>>('/api/v1/settings').then((r) => r.data);

// Admin
export const adminLogin = (email: string, password: string) =>
  api.post<{ token: string; user: { id: string; email: string; name: string } }>('/api/v1/auth/login', { email, password }).then((r) => r.data);

export const adminGetMe = (token: string) =>
  api.get('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);

export const adminGetDashboard = (token: string) =>
  api.get('/api/v1/admin/dashboard/stats', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);

export const adminGetProducts = (token: string, params?: Record<string, string>) =>
  api.get<PaginatedResponse<Product>>('/api/v1/admin/products', { headers: { Authorization: `Bearer ${token}` }, params }).then((r) => r.data);

export const adminGetProduct = (token: string, id: string) =>
  api.get<Product>(`/api/v1/admin/products/${id}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);

export const adminCreateProduct = (token: string, data: Record<string, unknown>) =>
  api.post('/api/v1/admin/products', data, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);

export const adminUpdateProduct = (token: string, id: string, data: Record<string, unknown>) =>
  api.patch(`/api/v1/admin/products/${id}`, data, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);

// NOTE: this hits the same /api/v1/admin/orders endpoint as the legacy B2C
// admin — that controller was rewritten in-place for B2B (see
// admin-orders.controller.ts), so the return shape is AdminOrder now, not the
// old flat `Order`. The `Order` type/adminGetOrders name is kept only where
// still referenced by the old track/receipt B2C pages.
export const adminGetOrders = (token: string, params?: Record<string, string>) =>
  api.get<PaginatedResponse<AdminOrder>>('/api/v1/admin/orders', { headers: { Authorization: `Bearer ${token}` }, params }).then((r) => r.data);

export const adminGetOrder = (token: string, id: string) =>
  api.get<AdminOrder>(`/api/v1/admin/orders/${id}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);

export const adminUpdateOrder = (token: string, id: string, data: { status?: string; note?: string; notes?: string }) =>
  api.patch(`/api/v1/admin/orders/${id}`, data, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);

export const adminDeleteOrder = (token: string, id: string) =>
  api.delete(`/api/v1/admin/orders/${id}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);

export const adminRestoreOrder = (token: string, id: string) =>
  api.post(`/api/v1/admin/orders/${id}/restore`, {}, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);

export const adminResendOrderEmail = (token: string, id: string, type: 'ORDER_CONFIRMATION' | 'PAYMENT_RECEIPT') =>
  api.post(`/api/v1/admin/orders/${id}/resend-email`, { type }, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);

export const adminGetEmails = (token: string, params: { status?: string; page?: number; pageSize?: number }) =>
  api.get<AdminEmailsResponse>('/api/v1/admin/emails', { headers: { Authorization: `Bearer ${token}` }, params }).then((r) => r.data);

export const adminRetryFailedEmails = (token: string) =>
  api.post<{ retried: number }>('/api/v1/admin/emails/retry-failed', {}, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);

export const adminPreviewEmail = (token: string, params: { type: 'ORDER_CONFIRMATION' | 'PAYMENT_RECEIPT'; orderId?: string }) =>
  api.get<{ subject: string; html: string }>('/api/v1/admin/emails/preview', { headers: { Authorization: `Bearer ${token}` }, params }).then((r) => r.data);

// Ad-hoc test send — bypasses the emails_enabled toggle server-side, but
// still requires RESEND_API_KEY to be configured.
export const adminSendTestEmail = (token: string, data: { type: 'ORDER_CONFIRMATION' | 'PAYMENT_RECEIPT'; orderId?: string; to: string }) =>
  api.post<{ id: string }>('/api/v1/admin/emails/test-send', data, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);

export const adminDeleteProduct = (token: string, id: string) =>
  api.delete(`/api/v1/admin/products/${id}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);

export const adminGetSettings = (token: string) =>
  api.get<Record<string, string>>('/api/v1/admin/settings', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);

export const adminUpdateSettings = (token: string, data: Record<string, string>) =>
  api.put<Record<string, string>>('/api/v1/admin/settings', data, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);

export const adminUploadImage = (token: string, file: File, onProgress?: (percent: number) => void) => {
  const form = new FormData();
  form.append('file', file);
  return api.post<{ url: string; filename: string }>('/api/v1/admin/upload/image', form, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress
      ? (e) => onProgress(e.total ? Math.round((e.loaded / e.total) * 100) : 0)
      : undefined,
  }).then((r) => r.data);
};

// Analytics
export const adminGetAnalytics = (token: string, days?: number) =>
  api.get('/api/v1/admin/dashboard/analytics', { headers: { Authorization: `Bearer ${token}` }, params: { days } }).then((r) => r.data);

// Discounts
export const adminGetDiscounts = (token: string, params?: Record<string, string>) =>
  api.get('/api/v1/admin/discounts', { headers: { Authorization: `Bearer ${token}` }, params }).then((r) => r.data);

export const adminCreateDiscount = (token: string, data: Record<string, unknown>) =>
  api.post('/api/v1/admin/discounts', data, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);

export const adminUpdateDiscount = (token: string, id: string, data: Record<string, unknown>) =>
  api.patch(`/api/v1/admin/discounts/${id}`, data, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);

export const adminDeleteDiscount = (token: string, id: string) =>
  api.delete(`/api/v1/admin/discounts/${id}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data);

// Validate discount — /api/v1/orders/* is company-scoped end to end (see
// orders.routes.ts's top-level authenticateCompany hook), so this now needs
// a company token same as everything else under that prefix.
export const validateDiscount = (token: string, code: string, subtotal: number) =>
  api.post<{ code: string; discountType: string; discountValue: number; discountAmount: number }>(
    '/api/v1/orders/validate-discount',
    { code, subtotal },
    authHeader(token)
  ).then((r) => r.data);

// ---------------------------------------------------------------------------
// Company (B2B) — auth, addresses, orders.
// See backend/src/modules/companies/*.controller.ts + orders.controller.ts.
// ---------------------------------------------------------------------------

export const companySignup = (data: {
  name: string;
  taxId?: string;
  contactName: string;
  phone: string;
  email: string;
  password: string;
}) => api.post<{ token: string; company: CompanyProfile }>('/api/v1/companies/signup', data).then((r) => r.data);

export const companyLogin = (email: string, password: string) =>
  api.post<{ token: string; company: CompanyProfile }>('/api/v1/companies/login', { email, password }).then((r) => r.data);

export const companyGetMe = (token: string) =>
  api.get<CompanyProfile>('/api/v1/companies/me', authHeader(token)).then((r) => r.data);

export const companyListAddresses = (token: string) =>
  api.get<CompanyAddress[]>('/api/v1/companies/addresses', authHeader(token)).then((r) => r.data);

export const companyCreateAddress = (token: string, data: {
  label: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postcode: string;
  type?: CompanyAddressType;
}) => api.post<CompanyAddress>('/api/v1/companies/addresses', data, authHeader(token)).then((r) => r.data);

export const companyUpdateAddress = (token: string, id: string, data: Partial<{
  label: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postcode: string;
  type: CompanyAddressType;
}>) => api.patch<CompanyAddress>(`/api/v1/companies/addresses/${id}`, data, authHeader(token)).then((r) => r.data);

export const companyDeleteAddress = (token: string, id: string) =>
  api.delete<{ success: boolean }>(`/api/v1/companies/addresses/${id}`, authHeader(token)).then((r) => r.data);

export const createCompanyOrder = (token: string, data: {
  shippingAddressId: string;
  notes?: string;
  discountCode?: string;
  idempotencyKey?: string;
  payNow?: boolean;
  items: { variantId?: string; kitId?: string; quantity: number }[];
}) => api.post<{ order: CompanyOrder; paymentUrl?: string }>('/api/v1/orders', data, authHeader(token)).then((r) => r.data);

export const listCompanyOrders = (token: string, params?: Record<string, string>) =>
  api.get<PaginatedResponse<CompanyOrder>>('/api/v1/orders', { ...authHeader(token), params }).then((r) => r.data);

export const getCompanyOrder = (token: string, id: string) =>
  api.get<CompanyOrder>(`/api/v1/orders/${id}`, authHeader(token)).then((r) => r.data);

// Authenticated receipt (replaces the old guest ?phone= lookup) — same PDF
// blob-download pattern as adminOpenReceiptPdf above, just against the
// company-scoped endpoint with a Bearer header instead of a query token.
export const companyOpenReceiptPdf = (token: string, orderId: string) =>
  api.get<Blob>(`/api/v1/orders/${orderId}/receipt/pdf`, {
    ...authHeader(token),
    responseType: 'blob',
  }).then((r) => {
    const url = URL.createObjectURL(r.data);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });

// ---------------------------------------------------------------------------
// Company (B2B) — quotations.
// See backend/src/modules/quotations/quotations.controller.ts.
// ---------------------------------------------------------------------------

export const requestQuotation = (token: string, data: {
  validUntil?: string;
  items: { variantId?: string; kitId?: string; quantity: number }[];
}) => api.post<Quotation>('/api/v1/quotations', data, authHeader(token)).then((r) => r.data);

// Same blob-download pattern as companyOpenReceiptPdf — the quotation is the
// document a buyer actually circulates internally for approval, so it needs
// to leave the app as a file rather than only existing as a web page.
export const companyOpenQuotationPdf = (token: string, quotationId: string) =>
  api.get<Blob>(`/api/v1/quotations/${quotationId}/pdf`, {
    ...authHeader(token),
    responseType: 'blob',
  }).then((r) => {
    const url = URL.createObjectURL(r.data);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });

export const listCompanyQuotations = (token: string, params?: Record<string, string>) =>
  api.get<PaginatedResponse<Quotation>>('/api/v1/quotations', { ...authHeader(token), params }).then((r) => r.data);

export const getCompanyQuotation = (token: string, id: string) =>
  api.get<Quotation>(`/api/v1/quotations/${id}`, authHeader(token)).then((r) => r.data);

export const acceptCompanyQuotation = (token: string, id: string, shippingAddressId?: string) =>
  api.post<CompanyOrder>(
    `/api/v1/quotations/${id}/accept`,
    shippingAddressId ? { shippingAddressId } : {},
    authHeader(token)
  ).then((r) => r.data);

export const rejectCompanyQuotation = (token: string, id: string) =>
  api.post<Quotation>(`/api/v1/quotations/${id}/reject`, {}, authHeader(token)).then((r) => r.data);

// ---------------------------------------------------------------------------
// Company (B2B) — invoices (read-only; admin issues/voids/records payment).
// See backend/src/modules/companies/company-invoices.controller.ts.
// ---------------------------------------------------------------------------

// `summary` is the company's account-wide balance (every invoice, not just
// the page fetched); `status` filters server-side using the same definition
// as the admin list. Params: status, orderId, page, limit.
export const listCompanyInvoices = (token: string, params?: Record<string, string>) =>
  api.get<PaginatedResponse<Invoice> & { summary: InvoiceReceivablesSummary }>(
    '/api/v1/companies/invoices', { ...authHeader(token), params }
  ).then((r) => r.data);

export const getCompanyInvoice = (token: string, id: string) =>
  api.get<Invoice>(`/api/v1/companies/invoices/${id}`, authHeader(token)).then((r) => r.data);

// ---------------------------------------------------------------------------
// Admin (B2B) — shipments.
// See backend/src/modules/admin/admin-shipments.controller.ts.
// ---------------------------------------------------------------------------

// `status`: PENDING (not yet shipped) | SHIPPED. Results come back
// unshipped-first so the worklist opens on what still needs doing.
export const adminListShipments = (token: string, params?: Record<string, string>) =>
  api.get<PaginatedResponse<AdminShipment> & { summary: { pendingCount: number } }>(
    '/api/v1/admin/shipments', { ...authHeader(token), params }
  ).then((r) => r.data);

export const adminGetShipment = (token: string, id: string) =>
  api.get<AdminShipment>(`/api/v1/admin/shipments/${id}`, authHeader(token)).then((r) => r.data);

export const adminCreateShipment = (token: string, data: { orderId: string; carrier?: string; trackingNumber?: string }) =>
  api.post<AdminShipment>('/api/v1/admin/shipments', data, authHeader(token)).then((r) => r.data);

export const adminAddShipmentItem = (token: string, shipmentId: string, data: { orderItemId: string; batchId: string; quantity: number }) =>
  api.post(`/api/v1/admin/shipments/${shipmentId}/items`, data, authHeader(token)).then((r) => r.data);

export const adminShipShipment = (token: string, shipmentId: string, data?: { carrier?: string; trackingNumber?: string }) =>
  api.post<AdminShipment>(`/api/v1/admin/shipments/${shipmentId}/ship`, data ?? {}, authHeader(token)).then((r) => r.data);

// ---------------------------------------------------------------------------
// Admin (B2B) — invoices.
// See backend/src/modules/admin/admin-invoices.controller.ts.
// ---------------------------------------------------------------------------

export const adminListInvoices = (token: string, params?: Record<string, string>) =>
  api.get<PaginatedResponse<Invoice> & { summary: InvoiceReceivablesSummary }>(
    '/api/v1/admin/invoices', { ...authHeader(token), params }
  ).then((r) => r.data);

// No companyId -> "who is owed an invoice", grouped per company.
// With companyId -> that company's unbilled shipment items across ALL their
// orders, which is what makes a consolidated (cross-order) invoice possible.
export const adminListUnbilled = (token: string, companyId?: string) =>
  api.get<{ companies?: UnbilledCompanyRow[]; items?: UnbilledItem[] }>(
    '/api/v1/admin/invoices/unbilled',
    { ...authHeader(token), params: companyId ? { companyId } : undefined }
  ).then((r) => r.data);

export const adminGetInvoice = (token: string, id: string) =>
  api.get<Invoice>(`/api/v1/admin/invoices/${id}`, authHeader(token)).then((r) => r.data);

export const adminGenerateInvoice = (token: string, data: { shipmentItemIds: string[] }) =>
  api.post<Invoice>('/api/v1/admin/invoices', data, authHeader(token)).then((r) => r.data);

export const adminRecordPayment = (token: string, invoiceId: string, data: { amount: number; method: 'WHATSAPP' | 'BILLPLZ'; paymentRef?: string }) =>
  api.post(`/api/v1/admin/invoices/${invoiceId}/payments`, data, authHeader(token)).then((r) => r.data);

export const adminVoidInvoice = (token: string, id: string) =>
  api.post<Invoice>(`/api/v1/admin/invoices/${id}/void`, {}, authHeader(token)).then((r) => r.data);

// ---------------------------------------------------------------------------
// Admin (B2B) — preorder campaigns.
// See backend/src/modules/admin/admin-campaigns.controller.ts.
// ---------------------------------------------------------------------------

export const adminListCampaigns = (token: string, params?: Record<string, string>) =>
  api.get<PaginatedResponse<PreorderCampaign>>('/api/v1/admin/campaigns', { ...authHeader(token), params }).then((r) => r.data);

export const adminGetCampaign = (token: string, id: string) =>
  api.get<PreorderCampaign>(`/api/v1/admin/campaigns/${id}`, authHeader(token)).then((r) => r.data);

export const adminCreateCampaign = (token: string, data: Record<string, unknown>) =>
  api.post<PreorderCampaign>('/api/v1/admin/campaigns', data, authHeader(token)).then((r) => r.data);

export const adminUpdateCampaign = (token: string, id: string, data: Record<string, unknown>) =>
  api.patch<PreorderCampaign>(`/api/v1/admin/campaigns/${id}`, data, authHeader(token)).then((r) => r.data);

export const adminDeleteCampaign = (token: string, id: string) =>
  api.delete(`/api/v1/admin/campaigns/${id}`, authHeader(token)).then((r) => r.data);

// ---------------------------------------------------------------------------
// Admin (B2B) — batches.
// See backend/src/modules/admin/admin-batches.controller.ts.
// ---------------------------------------------------------------------------

export const adminListBatches = (token: string, params?: Record<string, string>) =>
  api.get<PaginatedResponse<Batch>>('/api/v1/admin/batches', { ...authHeader(token), params }).then((r) => r.data);

export const adminGetBatch = (token: string, id: string) =>
  api.get<Batch>(`/api/v1/admin/batches/${id}`, authHeader(token)).then((r) => r.data);

export const adminCreateBatch = (token: string, data: Record<string, unknown>) =>
  api.post<Batch>('/api/v1/admin/batches', data, authHeader(token)).then((r) => r.data);

export const adminUpdateBatch = (token: string, id: string, data: Record<string, unknown>) =>
  api.patch<Batch>(`/api/v1/admin/batches/${id}`, data, authHeader(token)).then((r) => r.data);

export const adminDeleteBatch = (token: string, id: string) =>
  api.delete(`/api/v1/admin/batches/${id}`, authHeader(token)).then((r) => r.data);

// ---------------------------------------------------------------------------
// Admin (B2B) — kits.
// See backend/src/modules/admin/admin-kits.controller.ts.
// ---------------------------------------------------------------------------

export const adminListKits = (token: string, params?: Record<string, string>) =>
  api.get<PaginatedResponse<Kit>>('/api/v1/admin/kits', { ...authHeader(token), params }).then((r) => r.data);

export const adminGetKit = (token: string, id: string) =>
  api.get<Kit>(`/api/v1/admin/kits/${id}`, authHeader(token)).then((r) => r.data);

export const adminCreateKit = (token: string, data: Record<string, unknown>) =>
  api.post<Kit>('/api/v1/admin/kits', data, authHeader(token)).then((r) => r.data);

export const adminUpdateKit = (token: string, id: string, data: Record<string, unknown>) =>
  api.patch<Kit>(`/api/v1/admin/kits/${id}`, data, authHeader(token)).then((r) => r.data);

export const adminDeleteKit = (token: string, id: string) =>
  api.delete(`/api/v1/admin/kits/${id}`, authHeader(token)).then((r) => r.data);

// ---------------------------------------------------------------------------
// Admin (B2B) — companies. No create — companies self-signup.
// See backend/src/modules/admin/admin-companies.controller.ts.
// ---------------------------------------------------------------------------

export const adminListCompanies = (token: string, params?: Record<string, string>) =>
  api.get<PaginatedResponse<AdminCompany>>('/api/v1/admin/companies', { ...authHeader(token), params }).then((r) => r.data);

export const adminGetCompany = (token: string, id: string) =>
  api.get<AdminCompany>(`/api/v1/admin/companies/${id}`, authHeader(token)).then((r) => r.data);

export const adminUpdateCompany = (token: string, id: string, data: Record<string, unknown>) =>
  api.patch<AdminCompany>(`/api/v1/admin/companies/${id}`, data, authHeader(token)).then((r) => r.data);

// ---------------------------------------------------------------------------
// Admin (B2B) — quotations.
// See backend/src/modules/admin/admin-quotations.controller.ts.
// ---------------------------------------------------------------------------

export const adminListQuotations = (token: string, params?: Record<string, string>) =>
  api.get<PaginatedResponse<Quotation>>('/api/v1/admin/quotations', { ...authHeader(token), params }).then((r) => r.data);

export const adminGetQuotation = (token: string, id: string) =>
  api.get<Quotation>(`/api/v1/admin/quotations/${id}`, authHeader(token)).then((r) => r.data);

export const adminOpenQuotationPdf = (token: string, id: string) =>
  api.get<Blob>(`/api/v1/admin/quotations/${id}/pdf`, {
    ...authHeader(token),
    responseType: 'blob',
  }).then((r) => {
    const url = URL.createObjectURL(r.data);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });

export const adminUpdateQuotation = (token: string, id: string, data: Record<string, unknown>) =>
  api.patch<Quotation>(`/api/v1/admin/quotations/${id}`, data, authHeader(token)).then((r) => r.data);

export const adminSendQuotation = (token: string, id: string) =>
  api.post<Quotation>(`/api/v1/admin/quotations/${id}/send`, {}, authHeader(token)).then((r) => r.data);

export const adminSetQuotationStatus = (token: string, id: string, data: { status: 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED'; shippingAddressId?: string }) =>
  api.post<Quotation>(`/api/v1/admin/quotations/${id}/status`, data, authHeader(token)).then((r) => r.data);
