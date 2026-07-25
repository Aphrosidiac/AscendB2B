export const MALAYSIAN_STATES = [
  'Johor',
  'Kedah',
  'Kelantan',
  'Kuala Lumpur',
  'Labuan',
  'Melaka',
  'Negeri Sembilan',
  'Pahang',
  'Penang',
  'Perak',
  'Perlis',
  'Putrajaya',
  'Sabah',
  'Sarawak',
  'Selangor',
  'Terengganu',
] as const;

// Full B2B lifecycle (see OrderStatus in schema.prisma) — no Pricing
// Approval/Purchasing stages, stock is pre-secured via
// PreorderCampaign/Batch, so this is the complete set.
export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Placed',
  CONFIRMED: 'Confirmed',
  PACKING: 'Packing',
  SHIPPED: 'Shipped',
  PARTIALLY_SHIPPED: 'Partially Shipped',
  DELIVERED: 'Delivered',
  COMPLETE: 'Complete',
  CANCELLED: 'Cancelled',
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  PACKING: 'bg-purple-100 text-purple-800',
  SHIPPED: 'bg-indigo-100 text-indigo-800',
  PARTIALLY_SHIPPED: 'bg-orange-100 text-orange-800',
  DELIVERED: 'bg-teal-100 text-teal-800',
  COMPLETE: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  UNPAID: 'bg-yellow-100 text-yellow-800',
  PAID: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
  REFUNDED: 'bg-gray-100 text-gray-800',
};

// ---------------------------------------------------------------------------
// B2B — Company order/quotation/invoice status display (docs/frontend-design.md).
// ---------------------------------------------------------------------------

// Badge label for a single CompanyOrderStatus value (order-detail header,
// admin views). The list page's filter pills use a slightly different,
// more granular label set — see COMPANY_ORDER_FILTER_OPTIONS below.
export const COMPANY_ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Placed',
  CONFIRMED: 'Confirmed',
  PACKING: 'Packing',
  SHIPPED: 'Shipped',
  PARTIALLY_SHIPPED: 'Partially Shipped',
  DELIVERED: 'Delivered',
  COMPLETE: 'Complete',
  CANCELLED: 'Cancelled',
};

export const COMPANY_ORDER_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  PACKING: 'bg-indigo-100 text-indigo-800',
  SHIPPED: 'bg-purple-100 text-purple-800',
  PARTIALLY_SHIPPED: 'bg-purple-100 text-purple-800',
  DELIVERED: 'bg-teal-100 text-teal-800',
  COMPLETE: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

// Filter-pill set for the orders list — mirrors Girpack's granularity
// (All/Placed/Confirmed/Packing/Shipped/Partial/Delivered/Complete/Cancelled)
// per docs/frontend-design.md, rather than collapsing to the 6 stepper
// labels. `value` is what's actually sent as the `?status=` query param
// ('' means no filter / All).
export const COMPANY_ORDER_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Placed' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PACKING', label: 'Packing' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'PARTIALLY_SHIPPED', label: 'Partial' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'COMPLETE', label: 'Complete' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export const QUOTATION_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
};

export const QUOTATION_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  SENT: 'bg-blue-100 text-blue-800',
  ACCEPTED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-gray-100 text-gray-600',
};

export const QUOTATION_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'EXPIRED', label: 'Expired' },
];

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  UNPAID: 'Unpaid',
  PARTIALLY_PAID: 'Partially Paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  VOID: 'Void',
};

export const INVOICE_STATUS_COLORS: Record<string, string> = {
  UNPAID: 'bg-yellow-100 text-yellow-800',
  PARTIALLY_PAID: 'bg-blue-100 text-blue-800',
  PAID: 'bg-green-100 text-green-800',
  OVERDUE: 'bg-red-100 text-red-800',
  VOID: 'bg-gray-100 text-gray-600',
};

// ---------------------------------------------------------------------------
// Admin — campaigns / batches / credit terms.
// ---------------------------------------------------------------------------

export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  OPEN: 'Open',
  CLOSED: 'Closed',
  SOLD_OUT: 'Sold Out',
};

export const CAMPAIGN_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  OPEN: 'bg-green-100 text-green-800',
  CLOSED: 'bg-blue-100 text-blue-800',
  SOLD_OUT: 'bg-red-100 text-red-800',
};

export const BATCH_STATUS_LABELS: Record<string, string> = {
  INCOMING: 'Incoming',
  IN_STOCK: 'In Stock',
  DEPLETED: 'Depleted',
};

export const BATCH_STATUS_COLORS: Record<string, string> = {
  INCOMING: 'bg-yellow-100 text-yellow-800',
  IN_STOCK: 'bg-green-100 text-green-800',
  DEPLETED: 'bg-gray-100 text-gray-600',
};

export const CREDIT_TERMS_LABELS: Record<string, string> = {
  PREPAID: 'Prepaid',
  NET15: 'Net 15',
  NET30: 'Net 30',
  NET60: 'Net 60',
};
