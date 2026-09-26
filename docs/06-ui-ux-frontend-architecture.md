# Supermarket POS System — UI/UX & Frontend Architecture

**Step 6: UI/UX & Frontend Architecture**

**Baseline:** Builds directly on `@/Users/mohamedtarek/Supermarket POS System/docs/01-requirements-analysis.md` through `@/Users/mohamedtarek/Supermarket POS System/docs/05-architecture-and-api.md`. Backend rules, workflows, roles, data model, and API contracts are **not redesigned** here — this document maps them into a usable frontend experience.

**Conventions confirmed for this step:**
- **Manager approval hand-off:** in-person PIN/credential entry. When a Cashier's action needs escalation, an inline modal appears on the **Cashier's own terminal** prompting the Manager to enter their username + PIN/password directly, approve or deny on the spot. No separate Manager device is required for the approval action itself; a Manager-facing `/approvals` list screen still exists for visibility/history.
- **Frontend stack:** named illustratively as a **React-style component-based SPA** (Pages → Feature modules → Components, with a client-side store/cache) purely for concreteness — not a final technology commitment.
- **Device priority:** POS desktop is primary; tablet is secondary (supported, reflowed); mobile phone is explicitly **not** optimized for.

---

## 1. Application Navigation Map

Navigation is **role-driven** — a user only sees nav items for actions they're authorized to perform (mirroring Step 5's role-based endpoint access; the UI hides/shows, but the backend remains the actual enforcement authority).

```
┌─────────────────────────────────────────────────────────────────┐
│  Top Bar: [Store/Register indicator] [User: name, role] [Logout] │
├─────────────────────────────────────────────────────────────────┤
│  Side/Top Nav (role-dependent):                                   │
│                                                                     │
│  CASHIER            MANAGER (+Cashier)   INVENTORY STAFF   ADMIN  │
│  ─────────          ──────────────────   ───────────────   ─────  │
│  • POS/Checkout      • POS/Checkout       • Products         (+Manager,  │
│  • Sales History      • Sales History      • Categories        Inventory)│
│  • Returns            • Returns            • Inventory        • Users     │
│  • Register Open/     • Register Open/     • Stock Adjust     • Roles/    │
│    Close                Close/Force-Close  • Stock Movements    Permissions│
│                       • Approvals          • Low Stock         • System   │
│                       • Products (view)                          Settings │
│                       • Categories                              • Tax     │
│                       • Inventory (view)                          Config  │
│                       • Promotions                              • Full    │
│                       • Tax Config (view)                          Audit  │
│                       • Reports                                          │
│                       • Audit Logs (store-scoped)                        │
└─────────────────────────────────────────────────────────────────┘
```

- **Global layout:** persistent top bar (identity, active register/session indicator, logout) + role-scoped side/top navigation + main content area. The POS/Checkout screen for Cashiers may suppress the nav sidebar during an active sale to maximize screen real estate and minimize distraction (see §6).
- **Authentication flow:** `Login` screen → on success, redirect to role-appropriate landing page (Cashier → POS/Checkout if a register session is open, else Register Open; Manager/Admin/Inventory Staff → a simple dashboard/landing showing their most relevant nav, e.g., Approvals-pending count for Manager, Low-stock count for Inventory Staff).
- **Register/session flow:** a Cashier without an open register session is **routed to Register Open** before reaching POS/Checkout (checkout requires an open session per `CR-02`); once opened, they land on POS/Checkout; closing the register returns them to Register Open (ready for the next shift) or Login if they log out.

---

## 2. Route Map

| Route | Screen | Allowed Roles |
|---|---|---|
| `/login` | Login | Public |
| `/register/open` | Register Open | Cashier |
| `/register/close` | Register Close | Cashier, Manager (force-close) |
| `/pos` | POS / Checkout | Cashier |
| `/pos/payment` | Payment (sub-view/modal of `/pos`) | Cashier |
| `/pos/receipt/:saleId` | Receipt | Cashier |
| `/sales` | Sales History | Cashier (own), Manager, Admin |
| `/sales/:id` | Sale Details | Cashier (own), Manager, Admin |
| `/returns` | Returns | Cashier, Manager, Admin |
| `/returns/:id` | Return / Refund Detail | Cashier, Manager, Admin |
| `/products` | Products | Inventory Staff, Manager, Admin |
| `/products/new` | Product Create | Inventory Staff, Manager, Admin |
| `/products/:id` | Product Details/Edit | Inventory Staff, Manager, Admin |
| `/categories` | Categories | Inventory Staff, Manager, Admin |
| `/inventory` | Inventory (stock overview) | Inventory Staff, Manager, Admin |
| `/inventory/adjust/:productId` | Stock Adjustment | Inventory Staff, Manager, Admin |
| `/inventory/movements/:productId` | Stock Movements | Inventory Staff, Manager, Admin |
| `/inventory/low-stock` | Low Stock | Inventory Staff, Manager, Admin |
| `/promotions` | Promotions | Manager, Admin |
| `/tax-config` | Tax Configuration | Manager (view-only), Admin |
| `/approvals` | Manager Approvals | Manager, Admin |
| `/users` | Users | Manager (scoped), Admin |
| `/roles` | Roles/Permissions | Admin |
| `/reports` | Reports | Manager, Admin |
| `/audit-logs` | Audit Logs | Manager (store-scoped), Admin (full) |
| `/settings` | System Settings | Admin |

---

## 3. Role-Based Access Map

| Route | Cashier | Manager | Inventory Staff | Admin |
|---|---|---|---|---|
| `/pos`, `/pos/payment`, `/pos/receipt/:id` | ✅ | ✅ | ❌ | ❌ |
| `/register/open` | ✅ | ✅ (own) | ❌ | ❌ |
| `/register/close` | ✅ (own) | ✅ (any, force-close) | ❌ | ❌ |
| `/sales`, `/sales/:id` | ✅ (own only) | ✅ (all) | ❌ | ✅ (all) |
| `/returns`, `/returns/:id` | ✅ | ✅ | ❌ | ✅ |
| `/products`, `/products/:id`, `/products/new` | ❌ | ✅ | ✅ | ✅ |
| `/categories` | ❌ | ✅ | ✅ | ✅ |
| `/inventory`, `/inventory/adjust/*`, `/inventory/movements/*`, `/inventory/low-stock` | ❌ | ✅ (view+act) | ✅ | ✅ |
| `/promotions` | ❌ | ✅ | ❌ | ✅ |
| `/tax-config` | ❌ | ✅ (view-only) | ❌ | ✅ (view+edit) |
| `/approvals` | ❌ (may only trigger inline, not browse list) | ✅ | ❌ | ✅ |
| `/users` | ❌ | ✅ (Cashier/Inventory only) | ❌ | ✅ (all roles) |
| `/roles` | ❌ | ❌ | ❌ | ✅ |
| `/reports` | ❌ | ✅ | ❌ | ✅ |
| `/audit-logs` | ❌ | ✅ (store-scoped) | ❌ | ✅ (full) |
| `/settings` | ❌ | ❌ | ❌ | ✅ |

*This table mirrors Step 5 §B's "Required Role" columns exactly — no new authorization decisions are introduced. The frontend enforces this only for **navigation/UX convenience** (hiding inaccessible nav items, route guards that redirect on unauthorized access); the backend's live role/permission check remains the actual security boundary (Step 5 A4/A17).*

---

## 4. Screen Inventory

Grouped by domain area (26 screens total):

**Auth & Register (3):** Login · Register Open · Register Close

**POS / Checkout Core (3):** POS/Checkout · Payment · Receipt

**Sales & Returns (4):** Sales History · Sale Details · Returns · Refund (Return/Refund Detail)

**Catalog & Inventory (7):** Products · Product Details/Create/Edit · Categories · Inventory (stock overview) · Stock Adjustments · Stock Movements · Low Stock

**Configuration (2):** Promotions · Tax Configuration

**Manager Workflows (1):** Manager Approvals

**Admin (3):** Users · Roles/Permissions · System Settings

**Analytics (2):** Reports · Audit Logs

---

## 5. Screen Specifications

> Each screen is specified compactly across: Purpose, Roles, Main Components, User Actions, Data Displayed, Validation, and the four cross-cutting states (Loading/Empty/Error/Success) — the *general* state strategy is defined once in §10 and referenced here only where a screen has a state behavior worth calling out specifically.

### 5.1 Login
- **Purpose:** Authenticate and obtain a session.
- **Roles:** Public (unauthenticated).
- **Components:** Username field, password field, submit button, error banner.
- **Actions:** Enter credentials → submit (click or Enter key).
- **Data Displayed:** None (pre-auth).
- **Validation:** Required fields; no client-side password rule enforcement (server is authoritative).
- **States:** Loading (submit disabled + spinner during auth call); Error (`401` invalid credentials, `403` deactivated — distinct messages); Success (redirect per §1 landing logic).

### 5.2 Register Open
- **Purpose:** Start a Cashier's shift on a register (`W-02`).
- **Roles:** Cashier.
- **Components:** Register selector (if multiple available), starting-cash numeric input, confirm button.
- **Actions:** Select register → enter starting float → confirm.
- **Data Displayed:** List of registers with live status (Open/Closed, and by whom if open).
- **Validation:** Starting cash required, non-negative.
- **States:** Empty (no registers configured — Admin must add one); Error (`409` register already open → show who has it open, suggest contacting Manager); Success → redirect to `/pos`.

### 5.3 Register Close
- **Purpose:** End a shift, reconcile cash (`W-10`).
- **Roles:** Cashier (own session), Manager (force-close any).
- **Components:** Session summary (starting cash, cash sales, cash refunds, expected cash), counted-cash input, variance display (computed live as counted cash is typed), confirm button.
- **Actions:** Enter counted cash → confirm close.
- **Data Displayed:** Expected cash breakdown, computed variance (color-coded: green near-zero, amber/red beyond the Admin-configured alert threshold).
- **Validation:** Counted cash required, non-negative; blocked with a clear message if open sales remain unresolved (`CR-03`) — must complete/void/hold-resolve them first.
- **States:** Error (`409` unresolved sales — lists them with links); Success → confirmation + redirect to Register Open (next shift) or Login.

### 5.4 POS / Checkout
*(Full detailed flow in §6 — this entry covers the structural spec only.)*
- **Purpose:** Build and complete a sale transaction (`W-04`).
- **Roles:** Cashier.
- **Components:** Persistent barcode/search input (always focused), cart/line-items table (product, qty, unit price, discount, line total), running totals panel (subtotal, discount, tax, total), action bar (Hold, Void, Discount, Payment), held-transactions indicator/drawer.
- **Actions:** Scan/search-add item, edit line quantity, remove line, apply discount, hold, resume, void, proceed to payment.
- **Data Displayed:** Live cart contents and totals; product name/price/stock hint on add.
- **Validation:** Quantity > 0; discount within threshold else triggers approval modal (§7); stock re-checked server-side on add and again on completion.
- **States:** Empty (empty cart — payment/void disabled); Error (product not found on scan → inline toast, input stays focused for retry); Manager-approval-pending (blocking modal, §7); Success (on completion → routes to Payment-confirmed/Receipt).

### 5.5 Payment
- **Purpose:** Collect payment(s) to cover the sale total (`W-05`/`W-06`).
- **Roles:** Cashier.
- **Components:** Amount-due display, payment method tabs/buttons (Cash, Card), cash-tendered numeric pad + change-due display, card-charge trigger + status indicator, split-payment support (remaining balance shown as it's paid down).
- **Actions:** Select method → enter/confirm amount → capture payment → (repeat if split) → complete sale.
- **Data Displayed:** Amount due, amount paid so far, remaining balance, change due (cash).
- **Validation:** Cash tendered ≥ remaining balance to fully cover (or accepted as partial toward a split); card amount ≤ remaining balance.
- **States:** Payment-pending (partial payment captured, remaining balance > 0); Payment-failed (card declined — retry/switch-method affordance, §10); Loading (during card authorization call); Success → auto-navigate to Receipt.

### 5.6 Receipt
- **Purpose:** Confirm transaction completion and provide a receipt (`W-04` outcome).
- **Roles:** Cashier.
- **Components:** Receipt preview (receipt number, items, totals, payment breakdown, timestamp, cashier), Print button, "New Sale" button.
- **Actions:** Print (physical receipt only, per MVP scope), start next sale.
- **Data Displayed:** Full completed-sale summary.
- **Validation:** N/A (read-only confirmation).
- **States:** Success is the default/only state here; "New Sale" always clears back to an empty POS/Checkout ready for the next customer (fast-reset, see §6).

### 5.7 Sales History
- **Purpose:** Look up past sales (for reference, return initiation, reporting).
- **Roles:** Cashier (own sales only), Manager/Admin (all sales).
- **Components:** Filter bar (date range, register, cashier — Manager/Admin only, receipt number search), results table (receipt #, date, cashier, total, status).
- **Actions:** Filter/search, open a sale's detail, initiate a return from a row.
- **Data Displayed:** Paginated sale summaries.
- **Validation:** Date range sanity (from ≤ to).
- **States:** Empty (no matches); Loading (query in flight); Error (fetch failure with retry).

### 5.8 Sale Details
- **Purpose:** View full detail of one sale, including line items, payments, and any linked returns.
- **Roles:** Cashier (own), Manager, Admin.
- **Components:** Header summary, line-items table (with snapshot price/discount/tax), payments list, linked-returns list, "Start Return" action.
- **Actions:** Initiate a return referencing this sale.
- **Data Displayed:** Immutable historical record — explicitly labeled as such (no edit actions ever appear here, reinforcing `INV-04`).
- **States:** Error (`404` not found); standard Loading/Success.

### 5.9 Returns
- **Purpose:** Entry point for initiating and browsing returns (`W-11`/`W-12`).
- **Roles:** Cashier, Manager, Admin.
- **Components:** Two initiation paths — "Return with Receipt" (sale lookup by receipt #/search) and "Return without Receipt" (direct item entry, always flagged for mandatory Manager approval), plus a list/search of existing returns.
- **Actions:** Look up sale → select items/quantities → enter reason → submit; or start a no-receipt return directly.
- **Data Displayed:** For receipted returns, original line items with remaining-returnable quantity shown (enforcing `RT-04` visibly, not just on submit).
- **Validation:** Quantity ≤ remaining returnable quantity; reason required; 7-calendar-day window enforced server-side with a clear client-side warning if the sale date is near/past the boundary.
- **States:** Manager-approval-pending (no-receipt always; receipted return only if over threshold); Error (`409` window expired, `409` over-return — specific messages); Success (return recorded, refund status shown).

### 5.10 Refund (Return/Refund Detail)
- **Purpose:** View a return's status and its resulting refund(s).
- **Roles:** Cashier, Manager, Admin.
- **Components:** Return summary (items, reason, approver if applicable), refund breakdown (method, amount, status — split shown proportionally if applicable), "Retry Refund" action (Manager/Admin only, for failed reconciliation cases).
- **Actions:** View; Manager/Admin may retry a failed refund.
- **Data Displayed:** Full return + refund lifecycle.
- **States:** Error (refund failed/needs manual reconciliation — clearly flagged, not hidden); Success (refunded).

---

### 5.11 Products
- **Purpose:** Browse/search the product catalog (`W-17`).
- **Roles:** Inventory Staff, Manager, Admin.
- **Components:** Search/filter bar (name, category, active status), product table (SKU, barcode, name, category, price, stock), "New Product" button.
- **Actions:** Search/filter, open a product, create new, deactivate.
- **Data Displayed:** Paginated product list with current price/stock.
- **States:** Empty (no matches/no products yet); standard Loading/Error.

### 5.12 Product Details / Create / Edit
- **Purpose:** View/create/edit a product's catalog data (`W-17`).
- **Roles:** Inventory Staff, Manager, Admin (**never Cashier**, `PR-02`).
- **Components:** Form fields (SKU, barcode, name, **category — required**, price, reorder threshold), Save/Deactivate buttons, "View Stock Movements" link (existing products only).
- **Actions:** Fill/edit fields → save; deactivate (soft-delete).
- **Data Displayed:** Current field values (edit mode); price-change history hint if relevant (linking to audit).
- **Validation:** SKU/barcode required-unique (server-checked, `409` surfaced inline); category mandatory (client blocks submit + server enforces); price ≥ 0.
- **States:** Error (`409` duplicate SKU/barcode among active products — inline field error, not just a toast); Success (saved confirmation, price changes note that history is preserved).

### 5.13 Categories
- **Purpose:** Manage product categories.
- **Roles:** Inventory Staff, Manager, Admin.
- **Components:** List of categories, inline add/rename, delete-guard note (categories in use cannot be deleted — not modeled as a delete action at all, only rename, consistent with Step 4 schema having no delete path).
- **Actions:** Add category, rename category.
- **Validation:** Name required, unique (`409` inline).
- **States:** Empty (no categories yet — prompts to add first, since category is now mandatory on products); standard Loading/Error.

### 5.14 Inventory (Stock Overview)
- **Purpose:** View current stock across the catalog (`stock_movements`-derived cache).
- **Roles:** Inventory Staff, Manager, Admin.
- **Components:** Searchable/sortable table (product, category, current stock, reorder threshold, status badge: OK/Low/Out), row action → "Adjust" / "View Movements".
- **Actions:** Search/sort/filter, navigate to adjustment or movement history for a product.
- **Data Displayed:** Live `current_stock` per product with status coloring.
- **States:** Empty (no products); standard Loading/Error.

### 5.15 Stock Adjustments
- **Purpose:** Record a manual stock addition or correction (`W-14`/`W-15`).
- **Roles:** Inventory Staff, Manager, Admin.
- **Components:** Product selector (pre-filled if navigated from Inventory row), quantity-delta input (signed, or a toggle for Add vs. Adjust), **mandatory reason field/dropdown+free-text**, current-stock preview showing resulting stock before submit.
- **Actions:** Enter delta + reason → submit.
- **Data Displayed:** Current stock, projected resulting stock (client-side preview only; server re-validates).
- **Validation:** Reason required (client blocks submit); resulting stock must be ≥ 0 — if the entered delta would go negative, show inline warning **before** submit attempt, and server enforces regardless (`NS-01`/`NS-02`).
- **States:** Error (`409` would go negative — clear message with current stock shown); Success (confirmation + updated stock shown, link to movement history).

### 5.16 Stock Movements
- **Purpose:** View the append-only ledger for a product (traceability, `stock_movements`).
- **Roles:** Inventory Staff, Manager, Admin.
- **Components:** Chronological table (date, movement type, delta, resulting stock, actor, reference/reason).
- **Actions:** Filter by date range/movement type; no edit actions (read-only, immutable ledger — reinforced visually).
- **States:** Empty (no movements yet, e.g., brand-new product); standard Loading/Error.

### 5.17 Low Stock
- **Purpose:** Proactive monitoring dashboard (`W-16`).
- **Roles:** Inventory Staff, Manager, Admin.
- **Components:** List of products at/below reorder threshold, out-of-stock items visually distinguished (more urgent styling) from low-but-nonzero.
- **Actions:** Navigate to a product's adjustment/restock screen directly from a row.
- **Data Displayed:** Product, current stock, threshold, days-since-last-restock (if useful).
- **States:** Empty (**positive** empty state — "no low-stock items" is a good outcome, styled reassuringly rather than as a generic empty-table state).

### 5.18 Promotions
- **Purpose:** Manage discount campaigns (`W-07`, precedence rules).
- **Roles:** Manager, Admin.
- **Components:** List (name, scope, discount, validity window, active toggle), create/edit form (scope selector driving conditional product/category picker, discount type/value, validity dates).
- **Actions:** Create, edit, deactivate a promotion.
- **Validation:** Scope-consistent FK (product XOR category XOR neither for General); `valid_to > valid_from`.
- **States:** Empty (no promotions configured); Error (`400` scope mismatch — inline); Success.
- **Note:** a small precedence-explainer note is shown in the UI ("Product-specific promotions override Category, which override General; promotions do not stack") to set correct Manager expectations, matching `PM-03`/`PM-04`.

### 5.19 Tax Configuration
- **Purpose:** View/manage tax rates (`TX-01`).
- **Roles:** Manager (**view-only**), Admin (view + edit).
- **Components:** Current effective rate(s) (global + per-category), "Add New Rate" form (Admin only — hidden/disabled entirely for Manager, not just visually greyed), history table (Admin only).
- **Actions (Admin):** Create a new effective-dated rate.
- **Validation:** Rate ≥ 0; effective date required.
- **States:** Error (`403` if a Manager session somehow attempts the create action — should be structurally prevented by hiding the control, this is a defense-in-depth note); Success.

### 5.20 Manager Approvals
- **Purpose:** Review pending/historical escalation decisions (`W-08`) independent of any single live escalation.
- **Roles:** Manager, Admin.
- **Components:** Pending-approvals list (context: type, amount, requesting cashier, time waiting), historical decisions log (approve/deny with reasons), quick-decide action inline (same PIN-confirmation pattern as the live modal, for consistency, even though this screen isn't the primary hand-off path — see §7).
- **Actions:** Approve/deny a pending item from the list; browse history.
- **Data Displayed:** Full approval context and outcome trail.
- **States:** Empty ("no pending approvals" — reassuring positive empty state); standard Loading/Error.

### 5.21 Users
- **Purpose:** Manage user accounts (`W-18`).
- **Roles:** Manager (Cashier/Inventory Staff only), Admin (all roles).
- **Components:** User list (username, full name, role, active status), create/edit form, deactivate toggle.
- **Actions:** Create, edit, deactivate.
- **Validation:** Username required-unique (`409` inline); role selector restricted to what the current actor is permitted to assign (Manager cannot select Manager/Admin in the role dropdown at all — structurally prevented, not just validated).
- **States:** Error (`403` if role-assignment boundary is violated — defense-in-depth, primary prevention is UI-structural); Success.

### 5.22 Roles / Permissions
- **Purpose:** Admin-only view/edit of role permission sets and role-level defaults.
- **Roles:** Admin.
- **Components:** Role list, permission-key checklist per role, approval-threshold editor (with **versioned history view** — shows current effective values plus a "set new effective threshold" action rather than in-place mutation, reflecting the now-versioned `approval_thresholds` model).
- **Actions:** Toggle permission grants; create a new effective-dated threshold version.
- **Validation:** Threshold values ≥ 0 (and discount % ≤ 100); new threshold requires an effective date.
- **States:** Standard Loading/Error/Success; a small "effective from" badge distinguishes a not-yet-active future threshold from the current one.

### 5.23 Reports
- **Purpose:** Sales/cash/inventory/returns reporting (`W-20`).
- **Roles:** Manager, Admin.
- **Components:** Report-type tabs/selector (Sales Summary, Cash Reconciliation, Inventory Status, Returns/Refunds), shared filter bar (date range, register, cashier, product/category as applicable), results table/summary cards, export/print affordance (basic, not elaborated further per MVP scope).
- **Actions:** Select report type, adjust filters, view results.
- **Data Displayed:** Aggregated figures per report type.
- **States:** Empty (no data in range); Loading (aggregate query in flight — may take longer than typical list views, show a clear progress indicator); Error.

### 5.24 Audit Logs
- **Purpose:** Query the immutable audit trail (`AL-*`).
- **Roles:** Manager (store-scoped), Admin (full).
- **Components:** Filter bar (entity type, entity ID, actor, action type, date range), results table (timestamp, actor, action, entity, reason), detail expansion (before/after snapshot) per row.
- **Actions:** Filter/search, expand a row for full detail.
- **Data Displayed:** Read-only audit entries — no edit/delete actions exist anywhere on this screen (structurally enforces `AL-03` at the UI level too).
- **States:** Empty (no matching entries); standard Loading/Error.

### 5.25 System Settings
- **Purpose:** Admin-level configuration not covered by a dedicated screen (e.g., register list management, store info, register-variance alert threshold if not folded into Roles/Permissions).
- **Roles:** Admin.
- **Components:** Sectioned settings panels (Registers management: add/rename/deactivate a register; Store info: name/address for receipt header; general system preferences).
- **Actions:** Add/edit registers, edit store info.
- **Validation:** Register code required-unique.
- **States:** Standard Loading/Error/Success.

---

## 6. Checkout UX Flow (Cashier) — The Centerpiece

The POS/Checkout screen is optimized for **barcode scanner input, keyboard-first operation, and minimal clicks**. Design principles:

- **The scan/search input is always focused** by default and refocuses automatically after every action (item add, quantity edit confirm, modal close) — the cashier should almost never need to click into a text field manually during a normal sale.
- **All primary actions have keyboard shortcuts** (e.g., `F1` Hold, `F2` Discount, `F3` Void, `F4`/`Enter`-on-empty-scan-field Payment) in addition to visible on-screen buttons, so an experienced cashier can operate almost entirely via keyboard + scanner.
- **No unnecessary confirmation modals** on routine actions (adding an item, editing quantity) — modals are reserved for genuinely consequential/irreversible actions (void, manager escalation, payment completion) to avoid slowing down the common path.
- **The nav sidebar is collapsed/hidden** while a sale is in progress, maximizing space for the cart and reducing accidental navigation away from an active transaction.

### Happy-Path Step-by-Step Flow

1. **Register already open** (enforced precondition — Cashier cannot reach this screen otherwise, §1). POS/Checkout loads with an empty cart, scan input focused, totals at zero.
2. **Cashier scans item #1's barcode.** Scanner input (which behaves like rapid keyboard entry terminated by Enter) triggers an immediate lookup → item appended to the cart table as a new line (qty 1, current price, line total) → totals panel updates instantly → scan input clears and stays focused for the next scan. *No click required.*
3. **Repeat step 2** for each additional item. For an item without a barcode or with a damaged label, the cashier presses a "Search" shortcut or clicks the search icon next to the scan input, types the product name, and selects from a dropdown of matches (arrow keys + Enter, no mouse required).
4. **Quantity adjustment:** cashier clicks (or tab-navigates to) a line's quantity cell, types the new quantity, presses Enter — line total and overall totals recalculate immediately. Removing an item is a single click on a per-row "remove" icon or a `Delete`-key shortcut on the focused row.
5. **Discount (if applicable):** cashier selects a line (or the whole-cart context) and presses the Discount shortcut/button → a small inline panel (not a full-page modal) appears with quick preset options (e.g., common % buttons) and a manual-entry field → on submit:
   - **If within the Cashier's threshold:** discount applies immediately, panel closes, totals update — no interruption.
   - **If over threshold:** the flow transitions directly into the **Manager Approval modal** (§7) — the cashier does not need to navigate away; the modal appears inline over the current screen, cart state fully preserved underneath.
6. **Hold (optional):** if the customer needs to step away, the cashier presses Hold — the cart is saved to a "Held Transactions" drawer/indicator, the screen resets to empty for the next customer, and the held sale can be resumed later from the same drawer without losing any data.
7. **Proceed to Payment:** cashier presses the Payment shortcut/button (disabled/greyed while cart is empty) → transitions to the Payment view (can be an overlay/panel rather than a full navigation, to keep the cart visible for context).
8. **Cash payment:** cashier selects Cash, types the tendered amount (numeric keypad-friendly input, large touch/click targets for tablet use per §9) → **change due is calculated and displayed instantly** as the amount is typed, before submission → cashier confirms → payment captured.
9. **Card payment:** cashier selects Card, confirms the amount (defaults to remaining balance) → triggers the card charge → a clear "Processing..." state is shown (Loading state, §10) → on approval, payment captured automatically; on decline, a clear retry/switch-method prompt appears without losing the sale.
10. **Split payment (optional):** after a partial cash or card payment, the remaining balance updates and the same method-selection step repeats for the remainder — the flow loops steps 8/9 until remaining balance reaches zero.
11. **Complete Sale:** once payment fully covers the total, the "Complete Sale" action becomes active (or triggers automatically the instant the balance reaches zero, minimizing an extra click) → backend performs the atomic completion (stock re-check, receipt number assignment, audit log) → on success, the flow **auto-navigates to the Receipt screen**.
12. **Receipt & Reset:** Receipt screen shows the completed sale; cashier presses Print (or it can auto-print, a configurable preference) and then "New Sale" (or simply scanning the next item auto-starts a new sale, whichever proves faster in practice) → screen resets to an empty cart, scan input focused, ready for the next customer — **the entire loop from step 2 to step 12 is the target repeatable unit for cashier throughput.**

### Failure-Path Handling (kept fast, not punishing)
- **Barcode not found:** inline toast/error near the scan input ("Item not found — try search"), input remains focused, no modal interruption.
- **Insufficient stock at add-time:** inline warning on the line item itself, item still added but visibly flagged (e.g., amber highlight) so the cashier can decide to adjust quantity or remove — final enforcement happens at completion time regardless.
- **Stock became unavailable at completion time:** completion is blocked with a specific message identifying which line item is the problem, cart state preserved so the cashier can fix just that line and retry — never a full-cart data loss.
- **Card decline:** payment view shows a clear failure state with "Retry" and "Use different method" actions side-by-side; no navigation away from the sale.

---

## 7. Manager Approval UX Flow

**Primary path — in-person PIN entry, inline on the Cashier's terminal:**

1. A Cashier action requires escalation (over-threshold discount, no-receipt return, void-after-payment).
2. An **inline modal** appears directly over the Cashier's current screen (cart/return state fully preserved and visible/dimmed behind it) showing: the action type, amount/context, and the requesting Cashier's name.
3. The modal prompts: *"Manager approval required — enter Manager credentials to continue."* with a username field and PIN/password field.
4. The Manager (physically present at the register) enters their own username + PIN/password directly into this modal and presses Approve or Deny.
5. **On Approve:** the modal closes, the original action completes immediately (discount applied / return proceeds / void completes), and the flow resumes exactly where the Cashier left off — no navigation, no context loss.
6. **On Deny:** the modal closes with a brief reason field (optional), the original action is cancelled, and the Cashier's screen returns to its pre-escalation state (e.g., discount not applied, cart unchanged).
7. **No Manager available/reachable:** if the Manager-credential check itself fails (wrong credentials, or the system determines no active Manager account exists to authorize — per `MA-02`), the modal shows a clear rejection ("Approval unavailable — action cancelled") and the original action is cancelled outright, consistent with the "rejected outright" business rule (no indefinite waiting state).

**Secondary path — `/approvals` list screen (§5.20):** exists for Managers to review pending items **not** tied to a Cashier physically waiting in front of them (unlikely in a single-register-line scenario, but supports a multi-register store where a Manager might triage from a back office) and to review historical decisions for accountability/reporting. The decision UI here uses the same credential-confirmation pattern for consistency, even though the primary real-time hand-off is the inline modal.

---

## 8. Inventory UX Flow

1. **Stock View** (`/inventory`, §5.14): Inventory Staff opens the stock overview, searches/sorts to find a product, sees its current cached stock and status badge (OK/Low/Out).
2. **Stock Adjustment** (`/inventory/adjust/:productId`, §5.15): from a stock-view row (or navigated directly), staff enters a signed quantity delta and a **mandatory reason**, previews the resulting stock, and submits — the backend performs the atomic ledger-insert + cache-update (`W-15`, A8).
3. **Stock Movement History** (`/inventory/movements/:productId`, §5.16): staff (or a Manager investigating a discrepancy) reviews the full chronological ledger for a product — every sale-decrement, restock, and adjustment, each attributed to an actor and reason, forming the traceability trail (`stock_movements` as source of truth).
4. **Low Stock Monitoring** (`/inventory/low-stock`, §5.17): a recurring-check dashboard staff visits (or is directed to via a nav badge/count) to identify products needing restock, then jumps directly into a Stock Adjustment (as a restock/addition) from that list.

This flow is deliberately simple and linear for MVP — no procurement/PO workflow, consistent with Step 1–3's explicit deferral of supplier/PO management.

---

## 9. Responsive / Device Considerations

- **POS Desktop (primary target):** fixed-ish, information-dense layout. Cart table and totals panel side-by-side (not stacked), full nav sidebar available on non-checkout screens, keyboard shortcuts fully enabled, mouse optional (barcode scanner + keyboard is the expected primary input).
- **Tablet (secondary target):** same screens and routes reused (no separate tablet-only views) — layout **reflows**: cart/totals may stack vertically instead of side-by-side if width is constrained, buttons/tap targets increase in size for touch accuracy, numeric keypad inputs (payment, quantity, stock adjustment) favor a larger on-screen layout suited to touch. Barcode scanning may occur via a camera-based scan or an attached Bluetooth scanner — the input mechanism is abstracted (any input that produces a fast keyboard-like entry into the scan field works identically).
- **Mobile phone:** explicitly **not** a target for this MVP. No dedicated mobile layout is designed; at minimum, a narrow-viewport warning/redirect ("This application is optimized for desktop or tablet use") is an acceptable fallback rather than investing in a cramped, error-prone mobile checkout experience for what is fundamentally a fixed-terminal retail workflow.
- **Breakpoint strategy (conceptual, not final):** one primary breakpoint distinguishing "desktop/tablet-landscape" (full two-column layouts) from "narrow" (stacked layouts + the mobile fallback warning below a practical minimum width) — no complex multi-tier responsive grid system is needed for MVP scope.

---

## 10. UI States Strategy

A **shared, consistent pattern** applied across all screens (rather than reinvented per-screen) for the following states:

| State | Pattern |
|---|---|
| **Loading** | Skeleton/placeholder for list/table views; disabled submit + inline spinner for form actions; never a full-page blocking spinner for routine navigation (only for genuinely blocking operations like payment authorization or sale completion). |
| **Empty** | Contextual message + suggested action (e.g., "No products yet — Add your first product"); Low Stock's empty state is explicitly **positive/reassuring**, not a generic "nothing here." |
| **Error (generic/fetch failure)** | Inline error banner with a "Retry" action; never a silent failure — every failed data fetch is visibly communicated. |
| **Validation error** | Field-level inline messages (not just a top-of-form banner), shown on blur/submit; mirrors server error responses when the server is the one rejecting (e.g., `409` duplicate SKU maps to an inline error on the SKU field specifically, not a generic toast). |
| **Permission denied** | Primarily prevented structurally (nav items/actions simply don't render for unauthorized roles); if a direct route is somehow accessed without authorization, redirect to the user's default landing page with a brief explanatory toast — never a raw/technical 403 page. |
| **Manager-approval-pending** | Blocking modal (inline, credential-entry, §7) — the underlying screen is visible-but-dimmed/disabled beneath it, never a full navigation away. |
| **Payment pending** | Remaining-balance indicator stays visibly nonzero on the Payment screen; the sale cannot be completed until it reaches zero — no ambiguity about "is this paid yet." |
| **Payment failed** | Explicit failure banner on the Payment screen with clear "Retry" / "Switch Method" actions; the sale itself is never silently marked complete or lost. |
| **Network failure** | A persistent, dismissible banner ("Connection lost — retrying...") for connectivity issues, since a POS terminal losing connectivity mid-sale is a realistic and high-stakes scenario; in-flight critical actions (payment, sale completion) show a specific "could not confirm — do not retry blindly" message rather than allowing an accidental double-submit (see Risks, §12). |
| **Transaction success** | Clear, brief, unmissable confirmation (e.g., the Receipt screen itself *is* the success state for a completed sale) — success is never just a toast that could be missed given how consequential a completed sale is. |

---

## 11. Frontend Architecture

*(React-style component-based SPA named illustratively for concreteness — not a final technology commitment.)*

### Structural Layers
```
Pages (route-level containers)
   │  e.g., POSPage, ReturnsPage, ProductsPage, ApprovalsPage
   ▼
Feature Modules (domain-scoped logic + composed components)
   │  e.g., features/pos, features/inventory, features/returns,
   │       features/approvals, features/catalog, features/reports,
   │       features/admin
   ▼
Shared Components (reusable, presentation-focused)
   │  e.g., ProductSearchInput, CartTable, PaymentPanel,
   │       ApprovalModal, DataTable, FilterBar, StatusBadge
   ▼
Core Infrastructure
      API Client · Auth/Session Store · Permission Helpers ·
      Error Handling Middleware · Shared Validation Utilities
```

### State Management Responsibilities
- **Auth/session state (global):** current user, role, JWT — held in a small global store, read by route guards and nav rendering; refreshed via `/auth/me` on app load/reload.
- **Cart/sale-in-progress state (feature-scoped):** owned entirely within the POS feature module — not global — since it's only relevant while checkout is active and should not leak into/be affected by unrelated navigation.
- **Server data (cached, per-entity):** product lists, categories, promotions, etc. fetched and cached via a data-fetching layer (e.g., query-cache pattern) rather than duplicated into ad-hoc global state — keeps data fresh and avoids manual cache invalidation bugs.
- **UI-only state (local/component):** modal open/closed, form field values, filter selections — kept local to the component/page unless genuinely needed elsewhere.

### API Communication Layer
- A **single typed API client** module wraps every Step 5 endpoint (one function per endpoint, matching the method/path/role contracts already defined) — features never construct raw HTTP calls themselves.
- **Centralized interceptor** attaches the JWT to every request, and centrally handles `401` (redirect to Login) and `403` (surface as Permission-denied state, §10) so individual features don't each reimplement this logic.

### Form / Validation Responsibilities
- Mirrors Step 5 A7's two-tier model: **client-side validation is UX-only** (required-field checks, basic ranges, inline immediate feedback) — it never replaces server validation. Every form submission still fully expects and correctly surfaces server-side rejection (e.g., a `409` after client-side checks already "passed," such as a barcode collision created by a concurrent request).

### Authentication State
- JWT stored client-side (mechanism — e.g., memory + refresh vs. persistent storage — is an implementation detail deferred; see Open Questions carried from Step 5); route guards check for a valid, non-expired token before rendering protected pages, redirecting to Login otherwise.

### Permission Handling
- A shared `usePermission`/`can(action)`-style helper (conceptual, not a specific library) checks the current user's role against the Role-Based Access Map (§3) to conditionally render nav items and action buttons — this is **UX convenience only**; the actual security boundary remains server-side (Step 5 A4/A17), and the frontend must gracefully handle a server-side `403` even if its own local permission check said "should be allowed" (e.g., a threshold changed server-side moments ago).

### Error Handling
- A global error-handling layer maps Step 5 A9's error taxonomy (`400`/`401`/`403`/`404`/`409`/`422`/`500`) to the UI states defined in §10, consistently, rather than each feature inventing its own error presentation.

---

## 12. UX Risks & Recommendations

- **Risk — Approval hand-off friction at the register:** if the in-person PIN modal is slow to appear or unclear, it creates a visible delay in the checkout line. **Recommendation:** keep the modal minimal (two fields + two buttons), auto-focus the username field the instant it appears, and make failure/success feedback immediate.
- **Risk — Double-submission on slow/flaky network:** a Cashier re-clicking "Complete Sale" or a card-payment trigger during a slow response could risk a duplicate attempt. **Recommendation:** disable the triggering control immediately on click until a definitive response (success/failure) is received; never allow a second concurrent submit of the same action.
- **Risk — Barcode scanner focus-stealing:** if a modal or unrelated UI element steals input focus away from the scan field during an active sale, subsequent scans could be silently lost or misdirected into the wrong field. **Recommendation:** enforce a strict focus-management convention — the scan input reclaims focus after every transient UI interaction unless a modal that explicitly needs text input (e.g., the approval modal) is open.
- **Risk — Ambiguous card-payment state confusing cashiers:** per Step 5 A13, a timeout/ambiguous gateway response must never be silently treated as success or failure. **Recommendation:** the Payment screen must have a distinct, clearly-worded state for "could not confirm — do not retry, contact Manager" rather than folding this into the generic "failed" state, to prevent an accidental double-charge from a well-meaning retry.
- **Risk — Manager threshold/permission changes mid-shift causing confusing rejections:** since thresholds apply immediately (`UP-05`), a Cashier's previously-fine discount might suddenly require approval. **Recommendation:** the discount panel should always attempt the action and gracefully escalate to the approval modal if rejected, rather than trying to pre-emptively predict the threshold client-side (which could be stale).
- **Risk — Tablet touch-target sizing for numeric entry (payment, stock adjustment):** small desktop-sized number inputs are error-prone on touch. **Recommendation:** use a larger, dedicated numeric keypad component on these specific inputs regardless of device, rather than relying on the OS's default on-screen keyboard.
- **Risk — Over-cluttering the POS screen with secondary features:** it's tempting to surface Sales History, Reports links, etc. directly on the checkout screen. **Recommendation:** keep POS/Checkout ruthlessly focused on the current transaction only (per the nav-hidden-during-sale principle, §1/§6); all secondary lookups happen via explicit navigation away from an idle (non-active-sale) state.

---

## 13. Final Implementation Checklist

A practical, ordered build sequence for the next (implementation) phase:

1. **App shell:** routing structure, global layout (top bar + role-based nav), auth state/JWT handling, route guards.
2. **Auth & Register flow:** Login, Register Open, Register Close, landing-page redirect logic.
3. **POS/Checkout core loop:** scan/search-add, cart management, quantity edit, hold/resume, totals calculation display (client-preview only).
4. **Payment flow:** cash tender + change calc, card charge trigger + status handling, split-payment loop, sale completion, Receipt screen.
5. **Discount/Promotion application:** inline discount panel, threshold check integration, promotion precedence display.
6. **Manager Approval modal:** in-person credential entry, approve/deny handling, resume/cancel of originating action.
7. **Void flow:** pre-completion void action + confirmation.
8. **Returns & Refunds:** with-receipt and without-receipt initiation, return detail/refund status views, retry-refund action.
9. **Catalog & Categories:** product list/detail/create/edit, category management.
10. **Inventory:** stock overview, stock adjustment form, stock movement history, low-stock dashboard.
11. **Promotions & Tax Configuration:** CRUD screens with role-gated edit access.
12. **Approvals list screen:** pending/historical view (secondary path to the inline modal).
13. **Admin:** Users, Roles/Permissions (incl. versioned threshold editor), System Settings.
14. **Reports & Audit Logs:** report-type views, audit query/detail screens.
15. **Cross-cutting states polish:** apply the §10 state strategy consistently across every screen built above (loading/empty/error/validation/permission/network states).
16. **Responsive polish:** verify/adjust tablet reflow behavior across all screens; confirm the narrow-viewport mobile fallback.
17. **End-to-end happy-path + failure-path walkthrough:** manually verify the full checkout loop (§6) and the manager approval flow (§7) meet the speed/reliability bar before considering the frontend MVP-complete.

---

*This document concludes Step 6 — UI/UX & Frontend Architecture. No implementation code, frontend files, or dependencies were created/installed; no backend/domain logic was redesigned; no features beyond MVP scope were introduced. This specification is ready to guide frontend implementation.*
