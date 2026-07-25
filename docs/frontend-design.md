# AscendB2B — Frontend Design Plan (draft)

Stack: Next.js 16 (App Router) + React 19 + Tailwind 4, carried over from AscPeps. No animation library is used or needed — see "Transitions" below.

## Theme — unchanged from Ascend

Pulled from `frontend/src/app/globals.css`, kept as-is:

| Token | Value |
|---|---|
| `--color-background` | `#FAFAFA` |
| `--color-surface` | `#FFFFFF` |
| `--color-primary` / `--color-accent` | `#0A0A0A` (near-black — monochrome, not blue) |
| `--color-text-secondary` | `#525252` |
| `--color-border` | `#E5E5E5` |
| `--color-success` / `warning` / `danger` | `#22C55E` / `#F59E0B` / `#EF4444` |
| Display font | Outfit (`--font-display`) |
| Body font | Inter (`--font-body`) |

Anywhere the reference pattern below uses `blue-600` (Girpack's accent), AscendB2B substitutes `--color-primary` (near-black) instead — same interaction mechanics, Ascend's palette.

## Page inventory

**Existing (carried over, some changed):**
- `products` — add price-tier table (qty breaks) + MOQ enforcement on add-to-cart
- `cart` — bulk-qty aware; add "request quote for this cart" path
- `checkout` — address picker from saved `CompanyAddress`; payment step becomes optional (credit-terms orders skip it)
- `track`, `receipt`, `coa`, `shipping`, `faq`, `terms`, `privacy`, `disclaimer`, `about`, `guide`, `insights`, `calculator` — unchanged

**New — Auth & Account** (Company is now a real login; nothing like this exists today)
- Sign up / sign in / email verification
- Account dashboard, saved addresses, credit terms display

**New — Quotation**
- Request a quote (from PDP or cart), quote list, quote detail (accept/reject)

**New — Orders & Billing** (replaces guest-only `track`/`receipt`)
- Order list + detail — see stepper/tabs design below
- Invoice list + detail (per-company, since `Invoice` belongs to `Company` not `Order`)

**Admin — `admin/orders` exists today as a flat list (`page.tsx`, no detail route).** This is what gets the Girpack-derived treatment below.

## Order lifecycle — Girpack's shell, our own stages

Per your call: reuse Girpack's stepper/tabs/pills/transitions exactly, but drop the buy-to-order stages (Pricing Approval, Purchasing/PO) that don't apply — AscendB2B sells from pre-secured `Batch` stock, it doesn't purchase per order.

| Step | Underlying `OrderStatus` | What's on the tab |
|---|---|---|
| 1. Placed | `PENDING` | Order info, items, company |
| 2. Confirmed | `CONFIRMED` | + admin confirmed stock/pricing is valid |
| 3. Packing | `PACKING` | Shipment being assembled — `ShipmentItem`s picked against `Batch`es |
| 4. Shipped | `SHIPPED` / `PARTIALLY_SHIPPED` | Tracking numbers, carrier, per-shipment progress |
| 5. Delivered | `DELIVERED` | Delivery confirmation |
| 6. Complete | `COMPLETE` | Closed out |

`CANCELLED` sits off to the side as a terminal state, same as Girpack's pattern.

Filter pills on the list page mirror Girpack's granularity (`All`, `Placed`, `Confirmed`, `Packing`, `Shipped`, `Partial`, `Delivered`, `Complete`, `Cancelled`) rather than collapsing to just the 6 stepper labels — same UX benefit (jump straight to orders stuck at a specific micro-stage) without the procurement-specific statuses.

**Detail page tabs:** `Order Info` · `Items` · `Shipments` · `Invoices` · `Files` · `History` — the `Files` tab needs no new backing table (per the ERD decision): it's just `Batch.coaUrl` for every batch referenced by this order's `ShipmentItem`s. `History` is `OrderStatusHistory`, direct port of Girpack's audit tab.

## Transitions — read from Girpack's actual source, not the screenshots

Confirmed in `Girpack/frontend/src/components/orders/OrderStepper.vue` and `OrdersListPage.vue` — pure Tailwind/CSS, no framer-motion/GSAP, so it ports directly:

- **Stepper node:** `transition-all duration-500 ease-out` on the circle (border/bg/text color swap between done/active/pending states); the check-icon-vs-number swap uses a small 0.2s scale+opacity cross-fade.
- **Active connector:** a `@keyframes shimmer` gradient sweep (2s, ease-in-out, infinite) only on the segment leading into the current step — this is the detail that sells "in progress" at a glance.
- **List/content swap:** a `fade-swap` transition (0.2s opacity + transform) wraps the table body, so switching filter pills or pages fades content instead of snapping.
- **Micro-interactions everywhere:** `transition-colors` on hover states, `active:scale-[0.98]` on button press, `focus:ring-2` on inputs — all 150–200ms.

In React, the stepper/list swaps are a plain CSS-class-driven cross-fade keyed on the changing value (no library needed) — same output, since Girpack itself isn't using Vue's `<Transition>` for anything CSS couldn't do alone.

## Decisions locked

- Filter-pill set / stepper labels above are final.
- **No role-gating** on `admin/orders` tabs — unlike Girpack's `auth.hasPage('pricing-approval')` checks, every admin sees every tab (`Order Info`, `Items`, `Shipments`, `Invoices`, `Files`, `History`) unconditionally.
- **No fixed build order** — building everything in the page inventory together rather than sequencing by page.
