# Supermarket POS System — Business Workflows & Business Rules

**Step 3: Business Workflows & Business Rules**

**MVP baseline applied:** Single store · EGP · Cash & Card payments · Roles: Cashier, Store Manager, Inventory Staff, Admin · Customer mgmt/loyalty/supplier-PO/offline/digital-receipts/multi-store deferred · Admin owns config/permissions/thresholds/tax · Manager overrides operate within Admin-defined bounds · Cashier cannot change prices · Stock checked pre-sale, no negative stock · No-receipt returns → Manager approval, Cash refund only · Refunds prefer original payment method · Void only pre-completion; post-completion uses Return/Refund · No available Manager → sensitive op rejected · Promotion precedence must be deterministic, no unintended stacking · Concurrent stock changes must stay consistent · Permission changes apply immediately to new operations.

---

## Part 1 — Major End-to-End Workflows

### W-01 Login / Authentication
- **Trigger:** User attempts to access the system at a register or admin/manager terminal.
- **Preconditions:** User has an active, non-deactivated account with an assigned role.
- **Main Flow:**
  1. User submits credentials.
  2. System verifies credentials and account status (active).
  3. System establishes an authenticated session bound to the user's current role/permissions.
- **Alternative Flows:** N/A (single-factor login assumed for MVP; no SSO/MFA in scope).
- **Failure/Exception Paths:**
  - Invalid credentials → access denied, failed attempt logged.
  - Account deactivated → access denied, logged.
  - Account role changed since last login → session must reflect new role, not stale cached role.
- **Business Outcome:** Only authorized, active personnel can perform any subsequent operation; every later action is attributable to this authenticated identity.
- **State Changes:** No session → Authenticated session (bound to user + role snapshot at login time, but permission checks must re-evaluate live permissions per **"permission changes apply immediately"** rule — see Business Rules Part 2).

---

### W-02 Register Open
- **Trigger:** Cashier begins a shift and needs to start taking sales.
- **Preconditions:** Cashier authenticated (W-01); target register is not already open under another active session.
- **Main Flow:**
  1. Cashier selects a register.
  2. Cashier declares starting cash float.
  3. System creates a new register session (Closed → Open), recording cashier, register, starting cash, timestamp.
- **Alternative Flows:** N/A.
- **Failure/Exception Paths:**
  - Register already has an open session → rejected; Manager must resolve (force-close) before reopening.
  - Cashier already has another register open → policy: one active register session per cashier at a time (rejected otherwise).
- **Business Outcome:** A register cannot process sales until a session formally exists, ensuring all cash/sales activity is attributable to a specific shift.
- **State Changes:** Register: **Closed → Open**.

---

### W-03 Product Search / Barcode Scan
- **Trigger:** Cashier needs to locate a product to add to an active sale (or perform a price check).
- **Preconditions:** Product catalog is accessible; register session may or may not be open (price check can occur without an active sale).
- **Main Flow:**
  1. Cashier scans barcode or searches by name/SKU.
  2. System returns matching, active product(s) with current price and stock status.
- **Alternative Flows:**
  - Manual search when barcode is damaged/missing.
  - Multiple matches on text search → cashier selects correct product.
- **Failure/Exception Paths:**
  - No match found → cashier informed; item cannot be added until resolved (e.g., Inventory Staff must create product).
  - Product found but marked inactive/discontinued → cannot be added to sale.
- **Business Outcome:** Cashier always references the authoritative, current price and stock — never a stale or manually-entered value.
- **State Changes:** None (read-only operation).

---

### W-04 Complete Sale (End-to-End)
- **Trigger:** Cashier finalizes an in-progress transaction after payment collection.
- **Preconditions:** Register session open; transaction has at least one line item; stock availability confirmed for all items; payment(s) fully cover the total.
- **Main Flow:**
  1. Cashier adds items (W-03), applies discounts/promotions if any.
  2. System re-validates stock availability for every line item at completion time (not just at add-time), per **"stock availability must be checked before completing a sale"**.
  3. Cashier collects payment (W-05/W-06).
  4. System atomically: finalizes the sale, decrements stock, records payment(s), generates receipt, writes audit event.
- **Alternative Flows:**
  - Held transaction resumed before completion.
  - Split payment across cash and card.
- **Failure/Exception Paths:**
  - Stock became unavailable between add and completion (e.g., concurrent sale on another register) → sale cannot complete for that line; cashier must remove/replace item.
  - Payment amount insufficient → sale cannot move to Completed; remains Payment Pending.
  - System/network failure after payment captured but before finalization recorded → must not silently lose the sale (recoverable/idempotent completion required).
- **Business Outcome:** A completed sale represents a fully consistent, atomic business event: stock, payment, and audit are all in agreement — never partially applied.
- **State Changes:** Sale: **Draft → Payment Pending → Completed**. Stock: decremented per line item. Register: cash drawer balance updated (if cash tendered).

---

### W-05 Cash Payment
- **Trigger:** Cashier selects cash as (part of) the payment method during checkout.
- **Preconditions:** Sale is in Payment Pending state with a known total due.
- **Main Flow:**
  1. Cashier enters cash tendered amount.
  2. System calculates change due (tendered − amount owed for the cash portion).
  3. Cash payment recorded against the sale; register's expected cash balance increases by the net cash received.
- **Alternative Flows:** Partial cash as part of a split payment (W-06 covers the card portion).
- **Failure/Exception Paths:**
  - Tendered amount less than amount due (for cash-only sale) → payment incomplete; sale stays Payment Pending.
- **Business Outcome:** Cash movement is fully traceable to a specific sale and register session for later reconciliation (W-10 Register Close).
- **State Changes:** Sale payment record created/updated; register session's running cash total updated.

---

### W-06 Card Payment
- **Trigger:** Cashier selects card as (part of) the payment method during checkout.
- **Preconditions:** Sale is in Payment Pending state with a known total due; card payment capability available at register.
- **Main Flow:**
  1. Cashier initiates card charge for the card-designated amount.
  2. Payment is authorized (via external payment channel — mechanism out of scope for this step).
  3. On approval, card payment recorded against the sale.
- **Alternative Flows:** Split payment — card covers remainder after cash portion.
- **Failure/Exception Paths:**
  - Card declined/authorization failure → payment not recorded; cashier must retry, use another card, or switch method; sale remains Payment Pending.
  - Authorization succeeds but confirmation response is lost (ambiguous outcome) → must not double-charge or silently drop; requires reconciliation-safe handling (flag for manual verification rather than assuming success or failure).
- **Business Outcome:** Card transactions are linked 1:1 to a specific sale, preventing orphaned or duplicate charges.
- **State Changes:** Sale payment record created/updated once authorization is confirmed.

---

### W-07 Discount / Promotion Application
- **Trigger:** Cashier applies a discount/promotion to an item or whole transaction during an active sale.
- **Preconditions:** Sale is in Draft state (not yet paid); discount is either a valid configured promotion or a manual discount within Cashier's authorized threshold.
- **Main Flow:**
  1. Cashier applies discount/promotion.
  2. System evaluates all applicable promotions deterministically (see Business Rules — Promotions) and applies the single winning discount (no unintended stacking).
  3. If manual discount exceeds Cashier's threshold, system requires Manager Override (W-08) before applying.
  4. Totals (subtotal, tax, total) recalculated.
- **Alternative Flows:** Multiple eligible promotions exist → precedence rule selects one, per deterministic ranking (Business Rules Part 2).
- **Failure/Exception Paths:**
  - Discount exceeds Cashier threshold and no Manager available → operation rejected (per baseline rule).
  - Promotion expired/inactive at time of application → not applied, cashier informed.
- **Business Outcome:** Every discount is either self-authorized within policy or explicitly authorized by a Manager — never applied ambiguously.
- **State Changes:** Sale line item(s)/total adjusted; if Manager override used, an override audit record is created.

---

### W-08 Manager Override
- **Trigger:** A Cashier-initiated sensitive action (discount above threshold, no-receipt return, void, high-value refund) requires authorization beyond Cashier's permission.
- **Preconditions:** An authenticated, active Manager (or Admin acting with Manager-equivalent authority) is available to respond; a pending override request exists with context (amount, reason, originating action).
- **Main Flow:**
  1. System raises an override request tied to the originating operation.
  2. Manager reviews context and approves or denies.
  3. System records the decision (approver identity, timestamp, decision) as an audit event.
  4. Originating operation resumes (if approved) or is cancelled/rejected (if denied).
- **Alternative Flows:** Admin approves in place of Manager where permitted.
- **Failure/Exception Paths:**
  - No authorized Manager/Admin available → the sensitive operation is **rejected outright** (per baseline rule) — no queuing or deferred approval in MVP.
  - Manager attempts to approve an action exceeding their own Admin-defined threshold → rejected; Manager cannot self-elevate beyond Admin-set bounds.
- **Business Outcome:** No sensitive operation ever proceeds without a specific, accountable authorization decision.
- **State Changes:** Override request: **Pending → Approved / Denied**; originating operation resumes or terminates accordingly.

---

### W-09 Sale Void
- **Trigger:** Cashier needs to cancel a transaction that has not yet completed (e.g., wrong items, customer changed mind, before payment finalization).
- **Preconditions:** Sale is in **Draft** or **Payment Pending** state — **not yet Completed**.
- **Main Flow:**
  1. Cashier selects "void" on the active, uncompleted sale.
  2. System releases any reserved stock (if reservation model is used) and discards the sale.
  3. Audit event logged (voided-before-completion, no financial impact since no payment was finalized).
- **Alternative Flows:** If partial payment was already captured (e.g., card authorized but sale not finalized) — that captured payment must be reversed/released as part of the void, not left dangling.
- **Failure/Exception Paths:**
  - Attempt to void an already-**Completed** sale → rejected; must use Return/Refund workflow (W-11/W-12/W-13) instead — per baseline rule.
- **Business Outcome:** Pre-completion mistakes are cleanly discarded with no residual financial or inventory effect.
- **State Changes:** Sale: **Draft/Payment Pending → Voided** (terminal, non-financial state). No stock decrement occurs (or is reversed if any provisional reservation existed).

---

### W-10 Register Close
- **Trigger:** Cashier ends their shift.
- **Preconditions:** Register session is Open; all in-progress sales are resolved (completed, held, or voided — none left ambiguously open).
- **Main Flow:**
  1. Cashier initiates close.
  2. System computes expected cash = starting float + cash sales − cash refunds/payouts during the session.
  3. Cashier enters actual counted cash.
  4. System computes variance (actual − expected) and logs it.
  5. Register session closes.
- **Alternative Flows:** Manager force-closes a register (e.g., cashier forgot, left without closing) — treated as an override action, logged with Manager identity.
- **Failure/Exception Paths:**
  - Large variance detected (threshold set by Admin/Manager config) → flagged for Manager review; session still closes but is marked for investigation.
- **Business Outcome:** Every register session ends with a reconciled, auditable cash position, regardless of variance outcome.
- **State Changes:** Register: **Open → Closed**. Session record finalized with variance value.

---

### W-11 Return with Receipt
- **Trigger:** Customer requests to return item(s) from a previously completed sale, and can reference it (receipt/transaction ID).
- **Preconditions:** Referenced sale exists and is Completed; item(s) being returned belong to that sale and are within any applicable return-eligibility window/policy.
- **Main Flow:**
  1. Cashier looks up the original sale.
  2. Cashier selects returned item(s); system computes refund amount using the item's original sale price/discount/tax (not current price).
  3. If refund amount is within Cashier's threshold, Cashier proceeds directly; otherwise Manager Override (W-08) is required.
  4. System creates a Return record linked to the original sale, restores stock (if item is resellable), and triggers Refund (W-13).
- **Alternative Flows:** Partial return (subset of items from the original sale).
- **Failure/Exception Paths:**
  - Item already fully returned previously (double-return attempt) → rejected.
  - Refund amount exceeds the remaining refundable amount on that sale → rejected/capped (see Invariant on refund limits).
- **Business Outcome:** Returns stay strictly tied to verifiable original sales, preventing inflated or duplicate refunds.
- **State Changes:** Return: **Requested → Approved → Refunded** (or **Rejected**). Stock: incremented if resellable. Sale: unaffected itself (remains Completed; return is a separate linked record), but its "remaining refundable amount" decreases.

---

### W-12 Return without Receipt
- **Trigger:** Customer requests a return but cannot provide a valid reference to an original completed sale.
- **Preconditions:** None regarding original sale reference (by definition); Manager must be available.
- **Main Flow:**
  1. Cashier initiates a no-receipt return, capturing item(s) and reason.
  2. System **mandatorily** routes to Manager Override (W-08) regardless of amount — no Cashier self-approval path exists for this case.
  3. Manager approves or denies.
  4. If approved: refund is issued **in Cash only** (per baseline MVP rule, regardless of how the original purchase might have been paid, since no original payment reference exists); stock incremented if item is resellable.
- **Alternative Flows:** None — this workflow always requires Manager approval by design.
- **Failure/Exception Paths:**
  - No Manager available → rejected outright (per baseline rule; no deferred/queued approval).
  - Manager denies → return rejected, reason logged.
- **Business Outcome:** Higher-fraud-risk returns always carry an explicit, accountable Manager decision, and financial exposure is capped to a cash-only payout in MVP.
- **State Changes:** Return: **Requested → Approved → Refunded (Cash)** or **Rejected**.

---

### W-13 Refund (Payment Reversal)
- **Trigger:** An approved Return (W-11 or W-12) or an approved Void-after-payment-capture scenario requires money to be returned to the customer.
- **Preconditions:** An approved return/reversal context exists with a determined refundable amount and (for W-11) a known original payment method.
- **Main Flow:**
  1. System determines refund method: **original payment method** where applicable (W-11), or **Cash** (mandatory for W-12 no-receipt returns).
  2. System processes the refund (cash drawer payout, or card reversal via external payment channel).
  3. Refund recorded and linked to the Return/reversal record; audit event logged.
- **Alternative Flows:** Original payment was split (cash + card) → refund is split proportionally back to each original method, unless policy dictates otherwise (see Open Ambiguity).
- **Failure/Exception Paths:**
  - Card reversal fails/unavailable → flagged for manual reconciliation; refund not marked complete until resolved.
  - Refund amount would exceed the sale's remaining refundable balance → rejected (invariant, see Part 4).
- **Business Outcome:** Money returned to the customer is always traceable to a specific, approved return/reversal event and never exceeds what was actually paid.
- **State Changes:** Return: **Approved → Refunded**. Register cash balance decreases (if cash refund) or external card-reversal record created.

---

### W-14 Stock Addition (Manual Restock)
- **Trigger:** Inventory Staff receives new stock (e.g., delivery) and needs to record it, since supplier/PO management is out of MVP scope.
- **Preconditions:** Product already exists in the catalog (or is created first via W-17).
- **Main Flow:**
  1. Inventory Staff selects the product and enters quantity received.
  2. System increments stock quantity and logs the addition (user, quantity, timestamp).
- **Alternative Flows:** New product created inline as part of the same session (invokes W-17 first).
- **Failure/Exception Paths:**
  - Negative or zero quantity entered → rejected (must be a positive addition).
- **Business Outcome:** Physical stock increases are reflected promptly and attributably in system stock levels.
- **State Changes:** Stock quantity: increased. Audit event created.

---

### W-15 Stock Adjustment
- **Trigger:** Inventory Staff needs to correct stock due to damage, expiry, theft, or count discrepancy (not a new delivery).
- **Preconditions:** Product exists; adjustment reason is provided (mandatory).
- **Main Flow:**
  1. Inventory Staff enters adjustment quantity (positive or negative) and mandatory reason.
  2. System validates the adjustment will not drive stock below zero (per **negative stock not allowed**).
  3. Stock updated; audit event logged with reason.
- **Alternative Flows:** Adjustment as part of a full stock count/audit reconciliation (bulk adjustments, same rule applies per line).
- **Failure/Exception Paths:**
  - Resulting stock would be negative → rejected; Inventory Staff must reconcile the discrepancy (e.g., investigate before forcing to zero).
  - Missing/blank reason → rejected (reason is mandatory for every adjustment).
- **Business Outcome:** Stock records always reflect a deliberate, reasoned, auditable correction — never an unexplained number change.
- **State Changes:** Stock quantity: adjusted (up or down, never below zero). Audit event created.

---

### W-16 Low Stock Handling
- **Trigger:** A sale, adjustment, or scheduled check causes a product's stock to fall at or below its configured low-stock threshold.
- **Preconditions:** A low-stock threshold is configured for the product (Admin/Manager configurable).
- **Main Flow:**
  1. System detects stock at/below threshold following any stock-changing operation.
  2. System raises a low-stock alert visible to Inventory Staff and Manager.
- **Alternative Flows:** Stock reaches zero → alert escalates to "out of stock" status; product may still be visible in catalog but cannot be sold (per **stock availability check** rule) until replenished.
- **Failure/Exception Paths:** N/A (this is a notification workflow, not a blocking one — it does not itself prevent sales; the zero-stock case is what blocks sales, per W-04).
- **Business Outcome:** Inventory shortages are surfaced proactively rather than discovered only when a sale fails.
- **State Changes:** Alert record created/updated (not a financial or stock-state change itself).

---

### W-17 Product Creation / Update
- **Trigger:** Inventory Staff needs to add a new product to the catalog or update existing product details.
- **Preconditions:** Actor has inventory-management permission. **Cashier cannot perform this workflow** (per baseline rule: Cashier cannot modify prices, and by extension does not manage catalog data).
- **Main Flow:**
  1. Inventory Staff enters/edits product details: name, barcode/SKU, category, price, initial stock (for new products).
  2. System validates barcode/SKU uniqueness.
  3. Product saved; if this is a price update, the **new price applies only to future sales** — historical completed sales retain their original recorded price (invariant, see Part 4).
- **Alternative Flows:** Deactivating a product (soft removal) instead of deleting, to preserve historical sale references.
- **Failure/Exception Paths:**
  - Duplicate barcode/SKU → rejected.
  - Attempt by unauthorized role (e.g., Cashier) → rejected per permissions.
- **Business Outcome:** Catalog stays accurate and current without ever corrupting the historical accuracy of past transactions.
- **State Changes:** Product record created or updated; price-change audit event logged if price changed.

---

### W-18 User / Permission Management
- **Trigger:** Admin or Manager needs to create, modify, or deactivate a user account, or Admin needs to change role permissions/thresholds.
- **Preconditions:** Actor has account-management authority appropriate to the target: Manager may manage Cashier/Inventory Staff only; Admin may manage all roles including Manager.
- **Main Flow:**
  1. Actor creates/edits/deactivates a user account and/or role assignment, or Admin edits a role's permission set/thresholds.
  2. System applies the change **immediately** — per baseline rule, permission changes apply to new operations right away (no requirement to wait for re-login, though an already-open session must still be re-checked against live permissions for each new sensitive action).
- **Alternative Flows:** Admin adjusts Manager's approval-threshold ceiling — Manager's effective threshold is bounded by this new ceiling immediately.
- **Failure/Exception Paths:**
  - Manager attempts to create/modify a Manager or Admin account → rejected (segregation of duties).
  - Deactivating a user with an open register session → session must be resolved (force-closed by Manager/Admin) as part of, or immediately following, deactivation — cannot leave an orphaned open session tied to a deactivated user.
- **Business Outcome:** Access rights always reflect current business intent with no meaningful delay window of stale/incorrect permission.
- **State Changes:** User account/role/permission/threshold record updated; audit event logged.

---

### W-19 Tax Configuration
- **Trigger:** Admin needs to define or change tax rate(s) applied at checkout.
- **Preconditions:** Actor is Admin (tax configuration is Admin-owned per baseline decision; Manager does not edit tax rules in MVP).
- **Main Flow:**
  1. Admin defines/updates tax rate(s), globally or per category.
  2. System applies the updated rate to all **subsequent** sales; **sales already Completed retain their originally-applied tax** (consistent with the pricing-history invariant).
- **Alternative Flows:** N/A for MVP (single-store, presumably simple tax structure; category-based tax is supported as a configuration option, not a separate workflow).
- **Failure/Exception Paths:**
  - Invalid tax value (e.g., negative rate) → rejected.
- **Business Outcome:** Tax calculation is centrally controlled and consistently applied without retroactively altering historical transactions.
- **State Changes:** Tax configuration record updated; audit event logged; effective immediately for new sales only.

---

### W-20 Reporting
- **Trigger:** Manager or Admin needs visibility into sales, inventory, cash, or audit activity.
- **Preconditions:** Sufficient underlying transactional/audit data exists; actor has reporting permission scoped to their role (Manager: store-level; Admin: full system).
- **Main Flow:**
  1. Actor selects a report type and filter criteria (date range, register, cashier, product, category).
  2. System aggregates and presents the requested data from existing sale, payment, return, stock-adjustment, and audit records.
- **Alternative Flows:** N/A (reporting is read-only in this step; no data is modified).
- **Failure/Exception Paths:** No data matches filters → empty result set returned, not an error.
- **Business Outcome:** Decision-makers can review store performance and accountability without manual data reconciliation, and every figure in a report is traceable back to a specific auditable transaction.
- **State Changes:** None (read-only).

---

## Part 2 — Business Rules

Each rule is written to be directly testable.

### Pricing
- **PR-01:** Every product has exactly one active price at any point in time.
- **PR-02:** Only Inventory Staff, Manager, or Admin may change a product's price; **Cashier can never modify price** (baseline rule).
- **PR-03:** When a sale line item is created, the product's current active price is captured and stored on the line item at that moment.
- **PR-04:** A price change never retroactively alters any already-Completed sale's recorded line-item price (see Invariant INV-04).
- **PR-05:** Prices must be non-negative values in EGP.

### Discounts
- **DS-01:** A discount may be expressed as a percentage or a fixed EGP amount, applied to a line item or the whole transaction.
- **DS-02:** A discount amount can never reduce a line item's or transaction's total below zero.
- **DS-03:** Every Cashier role has a configured maximum discount threshold (percentage and/or fixed amount) set by Admin (and adjustable by Manager only within Admin's ceiling).
- **DS-04:** A manual discount request exceeding the acting Cashier's threshold **must** trigger Manager Override (W-08) before being applied.
- **DS-05:** If Manager Override is required and unavailable, the discount request is **rejected**, not queued.
- **DS-06:** Every applied discount (self-authorized or Manager-approved) is recorded with the authorizing user's identity.

### Promotions
- **PM-01:** A promotion has a defined validity window (start/end) and eligibility scope (specific product(s), category, or transaction-wide).
- **PM-02:** Only currently-active (within validity window) promotions are eligible for evaluation at checkout time.
- **PM-03:** When multiple promotions are eligible for the same line item or transaction, exactly **one** promotion is applied, determined by a deterministic precedence rule (e.g., highest-discount-value-wins, or explicit priority ranking assigned at promotion configuration time — exact ranking method is an open ambiguity, see Part 6).
- **PM-04:** Promotions never stack automatically; combining a promotion with an additional manual discount requires the manual portion to independently satisfy DS-03/DS-04.
- **PM-05:** Every promotion application is logged, identifying which promotion was applied and which competing promotions (if any) were evaluated but not selected.

### Taxes
- **TX-01:** Tax rate(s) are configured exclusively by Admin (baseline decision); Manager has view-only access in MVP.
- **TX-02:** Tax is calculated based on the rate(s) active **at the time of sale**, applied to the taxable amount (post-discount, unless policy states otherwise — see ambiguity).
- **TX-03:** A completed sale's recorded tax amount never changes retroactively if the tax configuration changes afterward.
- **TX-04:** Tax rates must be zero or positive values; negative tax rates are invalid.

### Inventory / Stock Availability
- **INV-STK-01:** Every product has a single, non-negative integer (or defined unit) stock quantity at any point in time.
- **INV-STK-02:** Stock availability must be verified **at line-item add time** (informational) and **re-verified at sale completion time** (enforced) before a sale can move to Completed.
- **INV-STK-03:** A sale cannot complete if any line item's requested quantity exceeds currently available stock at completion time.
- **INV-STK-04:** Stock is decremented only upon a sale reaching **Completed** state — never at Draft or Payment Pending.
- **INV-STK-05:** Stock is incremented upon an approved Return (resellable items only) or a stock addition/positive adjustment.

### Negative Stock
- **NS-01:** No operation (sale completion, stock adjustment) may result in a product's stock quantity below zero.
- **NS-02:** Any operation that would cause negative stock must be rejected at the point of attempted execution, not silently clamped to zero.

### Returns
- **RT-01:** A return must reference either a valid, Completed original sale (Return-with-Receipt) or be explicitly flagged as a No-Receipt Return.
- **RT-02:** A No-Receipt Return **always** requires Manager approval, regardless of the amount involved.
- **RT-03:** A Return-with-Receipt requires Manager approval only if the refund amount exceeds the acting Cashier's configured threshold.
- **RT-04:** The total amount returned against a given original sale line item can never exceed the amount originally paid for that line item (no over-returning / double-returning).
- **RT-05:** Every return records: items returned, reason, approving user (if escalated), and linkage to the original sale (if applicable).

### Refunds
- **RF-01:** A refund for a Return-with-Receipt is issued via the **original payment method** where technically applicable; if the original payment was split, the refund is split proportionally (see ambiguity in Part 6 for exact proportional method).
- **RF-02:** A refund for a No-Receipt Return is **always issued in Cash** in the MVP, regardless of the (unknown) original payment method.
- **RF-03:** A refund amount can never exceed the remaining refundable balance of the associated original sale (i.e., original amount paid minus any amounts already refunded).
- **RF-04:** Every refund is linked to exactly one Return (or Void-after-payment reversal) record and is logged with amount, method, and timestamp.

### Voids
- **VD-01:** A sale can be voided **only** while in Draft or Payment Pending state.
- **VD-02:** A Completed sale can **never** be voided; it must be handled via Return/Refund.
- **VD-03:** Voiding a sale with any provisionally-captured payment must reverse/release that payment as part of the void operation — no orphaned captured payments.
- **VD-04:** A voided sale never causes a stock decrement (or reverses any provisional decrement/reservation).

### Cash Registers
- **CR-01:** A register can have at most one **Open** session at any time.
- **CR-02:** A register session must be Open before any sale can be started on that register.
- **CR-03:** Closing a register session requires all sales opened under that session to be in a terminal state (Completed or Voided) — no sale may be left in Draft/Payment Pending across a register close.
- **CR-04:** Register close variance = actual counted cash − expected cash (starting float + net cash sales − net cash refunds/payouts during the session); variance is always recorded, even when zero.
- **CR-05:** Only a Manager/Admin may force-close a register session opened by another (or an abandoned) Cashier session.

### Manager Approvals
- **MA-01:** Every sensitive operation requiring approval (discount over threshold, no-receipt return, void-after-payment reversal, high-value refund) must have an explicit Approve/Deny decision recorded before the operation proceeds or is finally rejected.
- **MA-02:** If no authorized Manager (or Admin acting with Manager authority) is available at the time of request, the operation is **rejected** — there is no pending/queued approval state carried forward in MVP.
- **MA-03:** A Manager's approval authority (thresholds) is itself bounded by limits set by Admin; a Manager cannot approve beyond their configured ceiling.
- **MA-04:** Every approval decision (approve or deny) is attributed to a specific authenticated user and timestamp.

### User Permissions
- **UP-01:** Every user has exactly one role (Cashier, Manager, Inventory Staff, Admin) determining their baseline permission set in MVP (no multi-role assignment in scope).
- **UP-02:** Admin defines and can modify the permission set and thresholds available to each role.
- **UP-03:** Manager may manage (create/edit/deactivate) Cashier and Inventory Staff accounts only; Manager cannot manage Manager or Admin accounts.
- **UP-04:** Admin may manage accounts of any role, including Manager and Admin.
- **UP-05:** Any permission or threshold change takes effect **immediately** for all new operations initiated after the change — no requirement to wait for re-login or session refresh.
- **UP-06:** A deactivated user cannot authenticate (W-01) or be used to authorize any new operation, even if a session token technically still exists.

### Audit Logging
- **AL-01:** Every sensitive operation (sale completion, void, return, refund, discount/promotion application, stock adjustment, price change, tax config change, permission change, register open/close, Manager override decision) produces an audit record.
- **AL-02:** An audit record must capture: acting user, timestamp, operation type, and relevant context (amounts, reasons, affected entity references).
- **AL-03:** Audit records are immutable once created — they are never edited or deleted, only ever appended.

### Concurrent Operations
- **CC-01:** Two concurrent operations affecting the same product's stock (e.g., two registers selling the last unit) must not both succeed if doing so would violate NS-01 (negative stock invariant) — exactly one succeeds, the other is rejected/must retry with updated stock info.
- **CC-02:** Stock-affecting operations (sale completion, stock adjustment, return restock) must be evaluated against the **current** stock quantity at the moment of execution, not a stale value read earlier in the workflow.
- **CC-03:** No business operation may leave stock, payment, or audit records in a partially-applied state visible to other concurrent operations (see Transaction Boundaries, Part 5).

---

## Part 3 — State Transitions

### Sale
**States:** `Draft` → `Payment Pending` → `Completed`
                                        ↘ `Voided`
- `Draft`: Line items being added/removed/discounted; no payment yet attempted.
- `Payment Pending`: Payment collection in progress (one or more payment attempts); not yet fully covering total.
- `Completed`: Terminal. Fully paid, stock decremented, receipt issued, audit logged. **Cannot transition out of Completed** (no direct void; only linked Return/Refund records can be created against it).
- `Voided`: Terminal. Only reachable from `Draft` or `Payment Pending`. Represents an abandoned/cancelled pre-completion sale.
- **Held** (sub-state of Draft, informal): a Draft sale set aside and resumable — not a distinct terminal state, functionally still Draft.

**Valid transitions:**
| From | To | Trigger |
|---|---|---|
| (none) | Draft | Start new sale (W-04) |
| Draft | Draft | Add/remove item, apply discount, hold/resume |
| Draft | Payment Pending | Payment attempt initiated |
| Payment Pending | Payment Pending | Additional payment (split), retry after decline |
| Payment Pending | Completed | Full payment confirmed + stock re-validated |
| Draft / Payment Pending | Voided | Cashier void (W-09) |

**Invalid transitions:** Completed → Voided (forbidden, VD-02); Completed → Draft/Payment Pending (forbidden); Voided → any other state (terminal).

---

### Return
**States:** `Requested` → `Approved` → `Refunded`
                        ↘ `Rejected`
- `Requested`: Cashier has initiated a return (with or without receipt); pending eligibility/threshold checks.
- `Approved`: Either auto-approved (within Cashier threshold, receipt case only) or Manager-approved.
- `Refunded`: Terminal. Refund workflow (W-13) completed; money/inventory movements finalized.
- `Rejected`: Terminal. Manager denied, or system-level rejection (e.g., double-return, no Manager available, exceeds refundable balance).

**Valid transitions:**
| From | To | Trigger |
|---|---|---|
| (none) | Requested | Cashier initiates return |
| Requested | Approved | Within Cashier threshold (receipt case) OR Manager approves |
| Requested | Rejected | Manager denies OR validation failure (RT-04) OR no Manager available (MA-02) |
| Approved | Refunded | Refund processing completes (W-13) |

**Invalid transitions:** Refunded/Rejected → any other state (both terminal).

---

### Register Session
**States:** `Closed` → `Open` → `Closed`
- `Closed`: No active session; register not usable for sales.
- `Open`: Active session tied to a specific Cashier; sales can be created against it.

**Valid transitions:**
| From | To | Trigger |
|---|---|---|
| Closed | Open | Register Open (W-02) |
| Open | Closed | Register Close (W-10) or Manager force-close |

**Invalid transitions:** Open → Open (a second concurrent open on the same register is rejected, CR-01); Closed → Closed is a no-op, not a transition.

---

### Manager Override / Approval Request
**States:** `Pending` → `Approved` / `Denied`
- **Valid transitions:** Pending → Approved (Manager/Admin approves); Pending → Denied (Manager/Admin denies, or no Manager available → auto-Denied/Rejected per MA-02).
- **Invalid transitions:** Approved/Denied → any other state (terminal); no "re-open" of a decided override — a new request must be raised if retried.

---

### Stock (Product Quantity) — conceptual state, not a discrete finite-state machine, but bounded by invariants
- Stock quantity moves strictly within **[0, ∞)** via: `+` (stock addition, positive adjustment, return-restock) and `−` (sale completion, negative adjustment).
- No "state" per se, but every mutation must be atomic and pass the non-negativity check before committing (NS-01).

---

## Part 4 — Invariants

Conditions that must **always** remain true, regardless of workflow path:

- **INV-01:** A product's stock quantity is never negative.
- **INV-02:** A `Completed` sale always has associated payment(s) whose total equals or exceeds the sale's final total at the moment of completion.
- **INV-03:** A `Voided` sale has zero net financial effect — no completed payment, no stock decrement remains attributed to it.
- **INV-04:** A line item's recorded price, discount, and tax on a `Completed` sale never change after completion, even if the underlying product price, promotion, or tax configuration later changes.
- **INV-05:** The sum of all refunds issued against a given original sale (or sale line item) never exceeds the amount originally paid for it.
- **INV-06:** Every sensitive operation (as enumerated in AL-01) has a corresponding, immutable audit record.
- **INV-07:** A register can have at most one `Open` session at any given time.
- **INV-08:** Every `Completed` sale, `Approved`/`Refunded` Return, and closed Register session is attributable to exactly one authenticated acting user (and, where applicable, one approving user).
- **INV-09:** A sensitive operation requiring Manager approval never proceeds to a success state without a recorded Approve decision from an authorized Manager/Admin.
- **INV-10:** A Cashier's effective permission/threshold at the moment of any operation reflects the most recently configured value — never a stale cached value.
- **INV-11:** Exactly one promotion is ever applied to a given line item at a given time — never zero-when-eligible-exists (unless none qualify) and never more than one simultaneously (no unintended stacking).
- **INV-12:** A `Rejected` or `Denied` operation leaves the system state identical to before the operation was attempted (no partial side effects).

---

## Part 5 — Transaction Boundaries

The following business operations must behave as a **single atomic unit** — they either fully succeed or fully fail with no partial effect observable to any other operation:

1. **Complete Sale (W-04):** Sale state → Completed + Payment record(s) finalized + Stock decrement (all line items) + Audit event. If stock validation fails for any line item, or payment is insufficient, none of these effects apply — the sale remains in its prior state.
2. **Register Open (W-02):** Session creation + starting-cash record. Either the session exists with its float recorded, or it does not exist at all.
3. **Register Close (W-10):** Expected-cash calculation + variance recording + session state → Closed + audit event. Must not close "partially" (e.g., session closed but variance unrecorded).
4. **Return + Refund + Stock Restock (W-11/W-12 + W-13):** Return approval + refund issuance + stock increment (if resellable) + audit event, treated as one business-atomic sequence — a return should not be marked "Refunded" if the corresponding stock restock or payment reversal failed to apply.
5. **Void (W-09):** Sale state → Voided + any captured-payment reversal/release + audit event, together — a void must not leave a captured payment un-reversed.
6. **Manager Override Decision + Resumption of Originating Operation (W-08):** The approval/denial record and the resulting resumption/cancellation of the originating operation (discount application, return, void) must be consistent — an "Approved" override must always result in the originating operation actually proceeding, never left stranded in an ambiguous state.
7. **Stock Adjustment (W-15) / Stock Addition (W-14):** Quantity mutation + audit event (with reason, for adjustments) — must not record a stock change without its corresponding audit trail, or vice versa.
8. **Price/Product Update (W-17):** Product record update + price-change audit event (when price changes) — as one unit, to guarantee INV-04/INV-06 hold.
9. **Permission/Threshold Change (W-18):** Permission record update + immediate effective-application (UP-05) + audit event — must not be possible for the record to update without immediately being enforced, or vice versa.

**Cross-cutting concern:** Because Cashier (selling) and Inventory Staff (adjusting/restocking) both mutate the same stock quantity independently, **every individual stock mutation (sale completion, adjustment, restock, return-restock) must itself be atomic and consistency-checked against the live quantity** (CC-01/CC-02) — this is a boundary at the level of a *single stock mutation*, nested inside the larger atomic operations above.

---

## Part 6 — Remaining Ambiguities Before Step 4

1. **Promotion precedence method:** The exact deterministic rule for selecting among multiple eligible promotions is not yet defined (e.g., "highest discount value wins" vs. "explicit priority rank set at configuration time" vs. "most specific scope wins"). Must be decided before this becomes testable logic (PM-03).
2. **Tax base for discounted items:** Whether tax is calculated on the pre-discount or post-discount amount is not explicitly confirmed (TX-02 currently assumes post-discount as the likely default).
3. **Split-payment refund proportioning:** When an original sale was paid via split cash/card and a partial or full refund is due, the exact method for splitting the refund back across methods (proportional to original split, or another rule) is undefined (RF-01).
4. **Return eligibility window/policy:** No defined time window or product-category exclusions (e.g., perishables) for what is returnable at all — currently assumed "any item, any time" unless configured otherwise, which may be unrealistic.
5. **Cashier discount/refund threshold values:** The actual numeric default thresholds (percentage/amount) Admin should initially configure are not specified — needed before workflows can be tested end-to-end, though this is a configuration/data concern, not a structural one.
6. **Void scope after payment capture but before full completion:** W-09 assumes any provisional payment capture (e.g., card auth) can always be cleanly reversed/released; real-world card authorization reversal timing/limitations are not addressed here (may be a technical constraint surfaced later, not purely a business rule).
7. **"Large variance" threshold for register close (W-10):** Not yet defined what counts as a variance significant enough to flag for Manager review.
8. **Low-stock threshold ownership:** W-16 assumes a configurable per-product threshold but does not specify who sets it by default (Inventory Staff at product creation, or Manager/Admin globally) — minor but worth confirming.
9. **Manager force-close and mid-shift deactivation interaction:** The exact procedural relationship between W-18 (deactivating a user with an open session) and W-10 (register close/force-close) needs a single confirmed sequence (e.g., does deactivation *trigger* an automatic force-close, or merely *block* until Manager manually force-closes?).

---

*This document concludes Step 3 — Business Workflows & Business Rules. No code, database, API, or UI decisions have been made. The ambiguities in Part 6 should be resolved (or explicitly deferred with a stated assumption) before proceeding to Step 4 — Data Model & Database Design.*
