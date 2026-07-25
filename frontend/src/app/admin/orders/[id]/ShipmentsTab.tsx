'use client';

import { useEffect, useState } from 'react';
import { Truck, Plus, PackagePlus } from 'lucide-react';
import { adminCreateShipment, adminAddShipmentItem, adminShipShipment, adminListBatches, adminGetKit } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import type { AdminOrder, CompanyOrderItem, Batch, Kit } from '@/types';

function itemDisplayName(item: { variant?: { code: string; size: string | null; product: { name: string } } | null; kit?: { name: string } | null }): string {
  if (item.variant) return `${item.variant.product.name}${item.variant.size ? ` ${item.variant.size}` : ''}`;
  if (item.kit) return item.kit.name;
  return 'Item';
}

// How much of `item` has already been shipped, across every shipment on the
// order (not just one) — used purely as a display hint here; the backend is
// the actual source of truth/enforcement for what's still owed (see
// admin-shipments.controller.ts's assertValidPick).
function shippedSoFar(order: AdminOrder, item: CompanyOrderItem): number {
  let total = 0;
  for (const shipment of order.shipments ?? []) {
    for (const si of shipment.items) {
      if (si.orderItemId === item.id) total += si.quantity;
    }
  }
  return total;
}

interface AddItemFormProps {
  order: AdminOrder;
  shipmentId: string;
  token: string;
  onDone: () => void;
  onCancel: () => void;
}

function AddItemForm({ order, shipmentId, token, onDone, onCancel }: AddItemFormProps) {
  const [orderItemId, setOrderItemId] = useState('');
  const [kitDetail, setKitDetail] = useState<Kit | null>(null);
  const [kitLoading, setKitLoading] = useState(false);
  const [componentVariantId, setComponentVariantId] = useState('');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchId, setBatchId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedItem = order.items.find((i) => i.id === orderItemId) ?? null;

  // Plain-variant line: batches for that variant directly. Kit line: needs
  // the kit's component variants first (order.items only carries kit.name,
  // not its items — see AdminOrder's comment) before a component can be
  // picked and its batches loaded.
  useEffect(() => {
    setKitDetail(null);
    setComponentVariantId('');
    setBatches([]);
    setBatchId('');
    if (!selectedItem) return;
    if (selectedItem.kitId) {
      setKitLoading(true);
      adminGetKit(token, selectedItem.kitId)
        .then(setKitDetail)
        .catch(() => setError('Failed to load kit components'))
        .finally(() => setKitLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderItemId]);

  const variantIdForBatches = selectedItem?.variantId ?? (componentVariantId || null);

  useEffect(() => {
    setBatches([]);
    setBatchId('');
    if (!variantIdForBatches) return;
    setBatchesLoading(true);
    adminListBatches(token, { variantId: variantIdForBatches, limit: '100' })
      .then((r) => setBatches(r.data.filter((b) => b.quantity > 0)))
      .catch(() => setError('Failed to load batches'))
      .finally(() => setBatchesLoading(false));
  }, [variantIdForBatches, token]);

  const handleSubmit = async () => {
    if (!orderItemId || !batchId) return;
    const qty = parseInt(quantity, 10);
    if (!qty || qty < 1) return;
    setSubmitting(true);
    setError('');
    try {
      await adminAddShipmentItem(token, shipmentId, { orderItemId, batchId, quantity: qty });
      onDone();
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setError(message ?? 'Failed to add item');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-surface-elevated rounded-lg p-4 space-y-3 mt-3">
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Add Item to Shipment</p>

      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Order Item</label>
        <select
          value={orderItemId}
          onChange={(e) => setOrderItemId(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface"
        >
          <option value="">Select an item...</option>
          {order.items.map((item) => (
            <option key={item.id} value={item.id}>
              {itemDisplayName(item)} — {shippedSoFar(order, item)} of {item.quantity} shipped
            </option>
          ))}
        </select>
      </div>

      {selectedItem?.kitId && (
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Kit Component</label>
          {kitLoading ? (
            <p className="text-xs text-text-muted">Loading kit components...</p>
          ) : (
            <select
              value={componentVariantId}
              onChange={(e) => setComponentVariantId(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface"
            >
              <option value="">Select a component...</option>
              {kitDetail?.items.map((ki) => (
                <option key={ki.id} value={ki.variantId}>
                  {ki.variant?.product?.name ?? ''} {ki.variant?.size ?? ''} ({ki.variant?.code}) — {ki.quantity}/kit
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {variantIdForBatches && (
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Batch</label>
          {batchesLoading ? (
            <p className="text-xs text-text-muted">Loading batches...</p>
          ) : batches.length === 0 ? (
            <p className="text-xs text-danger">No batches with available quantity for this variant.</p>
          ) : (
            <select
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface"
            >
              <option value="">Select a batch...</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batchNumber} — {b.quantity} available — exp {formatDate(b.expiry)}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {batchId && (
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Quantity</label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-32 px-3 py-2 border border-border rounded-lg text-sm bg-surface"
          />
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleSubmit} disabled={!orderItemId || !batchId || submitting}>
          {submitting ? 'Adding...' : 'Add Item'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

interface ShipShipmentFormProps {
  shipmentId: string;
  token: string;
  defaultCarrier: string;
  defaultTracking: string;
  onDone: () => void;
  onCancel: () => void;
}

function ShipShipmentForm({ shipmentId, token, defaultCarrier, defaultTracking, onDone, onCancel }: ShipShipmentFormProps) {
  const [carrier, setCarrier] = useState(defaultCarrier);
  const [trackingNumber, setTrackingNumber] = useState(defaultTracking);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await adminShipShipment(token, shipmentId, { carrier: carrier || undefined, trackingNumber: trackingNumber || undefined });
      onDone();
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setError(message ?? 'Failed to mark shipped');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-surface-elevated rounded-lg p-4 space-y-3 mt-3">
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Mark Shipment Shipped</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Carrier</label>
          <input
            type="text"
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            placeholder="e.g. J&T Express"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Tracking Number</label>
          <input
            type="text"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface"
          />
        </div>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={submitting}>{submitting ? 'Saving...' : 'Confirm Shipped'}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

interface ShipmentsTabProps {
  order: AdminOrder;
  token: string;
  onRefresh: () => void;
}

export function ShipmentsTab({ order, token, onRefresh }: ShipmentsTabProps) {
  const [creating, setCreating] = useState(false);
  const [newCarrier, setNewCarrier] = useState('');
  const [newTracking, setNewTracking] = useState('');
  const [createError, setCreateError] = useState('');
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [addingItemFor, setAddingItemFor] = useState<string | null>(null);
  const [shippingFor, setShippingFor] = useState<string | null>(null);

  const handleCreateShipment = async () => {
    setCreatingBusy(true);
    setCreateError('');
    try {
      await adminCreateShipment(token, { orderId: order.id, carrier: newCarrier || undefined, trackingNumber: newTracking || undefined });
      setCreating(false);
      setNewCarrier('');
      setNewTracking('');
      onRefresh();
    } catch {
      setCreateError('Failed to create shipment');
    } finally {
      setCreatingBusy(false);
    }
  };

  const shipments = order.shipments ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="w-3.5 h-3.5" /> Create Shipment
          </Button>
        )}
      </div>

      {creating && (
        <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
          <p className="font-display font-semibold text-sm">New Shipment</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Carrier (optional)</label>
              <input
                type="text"
                value={newCarrier}
                onChange={(e) => setNewCarrier(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Tracking Number (optional)</label>
              <input
                type="text"
                value={newTracking}
                onChange={(e) => setNewTracking(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface"
              />
            </div>
          </div>
          {createError && <p className="text-xs text-danger">{createError}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreateShipment} disabled={creatingBusy}>{creatingBusy ? 'Creating...' : 'Create'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {shipments.length === 0 && !creating ? (
        <div className="text-center py-12 bg-surface rounded-xl border border-border border-dashed">
          <Truck className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary">No shipments have been created for this order yet.</p>
        </div>
      ) : (
        shipments.map((shipment) => (
          <div key={shipment.id} className="bg-surface rounded-xl border border-border p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p className="font-display font-semibold">{shipment.shipmentNumber}</p>
              {shipment.shippedAt ? (
                <span className="text-xs text-success font-medium">Shipped {formatDate(shipment.shippedAt)}</span>
              ) : (
                <span className="text-xs text-warning font-medium">Not yet shipped</span>
              )}
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-text-secondary mb-3">
              <span>Carrier: <span className="text-text-primary font-medium">{shipment.carrier || '—'}</span></span>
              <span>Tracking: <span className="text-text-primary font-medium">{shipment.trackingNumber || '—'}</span></span>
            </div>

            {shipment.items.length > 0 && (
              <div className="pt-3 border-t border-border space-y-1.5 mb-3">
                {shipment.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-text-secondary">
                      {item.orderItem ? itemDisplayName(item.orderItem) : 'Item'}
                      {item.batch && <span className="text-xs text-text-muted"> &middot; Batch {item.batch.batchNumber}</span>}
                    </span>
                    <span className="text-text-muted">Qty {item.quantity}</span>
                  </div>
                ))}
              </div>
            )}

            {!shipment.shippedAt && (
              <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
                {addingItemFor !== shipment.id && (
                  <Button size="sm" variant="outline" onClick={() => setAddingItemFor(shipment.id)}>
                    <PackagePlus className="w-3.5 h-3.5" /> Add Item
                  </Button>
                )}
                {shippingFor !== shipment.id && shipment.items.length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => setShippingFor(shipment.id)}>
                    <Truck className="w-3.5 h-3.5" /> Mark Shipped
                  </Button>
                )}
              </div>
            )}

            {addingItemFor === shipment.id && (
              <AddItemForm
                order={order}
                shipmentId={shipment.id}
                token={token}
                onDone={() => { setAddingItemFor(null); onRefresh(); }}
                onCancel={() => setAddingItemFor(null)}
              />
            )}

            {shippingFor === shipment.id && (
              <ShipShipmentForm
                shipmentId={shipment.id}
                token={token}
                defaultCarrier={shipment.carrier ?? ''}
                defaultTracking={shipment.trackingNumber ?? ''}
                onDone={() => { setShippingFor(null); onRefresh(); }}
                onCancel={() => setShippingFor(null)}
              />
            )}
          </div>
        ))
      )}
    </div>
  );
}
