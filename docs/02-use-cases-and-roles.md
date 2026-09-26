# Supermarket POS System — Use Cases & User Roles

**Step 2: Use Cases & User Roles**

**Scope decisions applied in this document:**
Single store MVP · Currency: EGP · Payment methods: Cash, Card · Roles: Cashier, Store Manager, Inventory Staff, Admin · No customer management, supplier/PO, loyalty, or offline mode in MVP · Tax is configurable · Returns/refunds included · Audit logging included · Architecture must stay extensible for future multi-store, but multi-store is NOT implemented now.

---

## 1. Use Case Inventory by Role

### 1.1 Cashier
- UC-01 Login / Logout
- UC-02 Open Register (Start Shift)
- UC-03 Close Register (End Shift)
- UC-04 Start New Sale Transaction
- UC-05 Add Item to Transaction (Scan/Search)
- UC-06 Remove Item / Modify Quantity
- UC-07 Apply Discount to Transaction or Item
- UC-08 Hold Transaction
- UC-09 Resume Held Transaction
- UC-10 Cancel/Void Transaction (Before Payment)
- UC-11 Take Payment (Cash)
- UC-12 Take Payment (Card)
- UC-13 Split Payment (Cash + Card)
- UC-14 Complete Sale & Issue Receipt
- UC-15 Process Return/Refund (With Receipt)
- UC-16 Process Return/Refund (Without Receipt) — *requires Manager approval*
- UC-17 Void Completed Transaction — *requires Manager approval*
- UC-18 Request Manager Override (generic escalation)
- UC-19 Price Check (lookup without adding to sale)

### 1.2 Store Manager
- UC-20 Approve Manager Override (discount/void/refund/no-receipt-return)
- UC-21 View Sales Reports (daily/periodic, by cashier/register/product)
- UC-22 View Cash Reconciliation / Variance Reports
- UC-23 View Audit Log
- UC-24 Manage Promotions & Discount Rules
- UC-25 Manage Tax Configuration
- UC-26 Manage Staff Accounts (create/deactivate Cashier & Inventory Staff)
- UC-27 View Inventory Status & Low-Stock Alerts
- UC-28 Force-Close/Investigate Register Session (e.g., cashier forgot to close)
- UC-29 Set Approval Thresholds (discount %, refund amount, etc.)

### 1.3 Inventory Staff
- UC-30 Add New Product
- UC-31 Update Product Details (name, price, category, barcode)
- UC-32 Adjust Stock Quantity (with mandatory reason)
- UC-33 Record Stock Receipt (manual restock entry)
- UC-34 View Low-Stock / Expiry Alerts
- UC-35 Perform Stock Count / Audit

### 1.4 Admin
- UC-36 Manage All User Accounts & Roles (including Managers)
- UC-37 Configure Store Settings (store info, registers)
- UC-38 Configure Tax Rules (global authority; Manager may have delegated access per UC-25)
- UC-39 View Full Audit Log & System History
- UC-40 Configure Business Rule Defaults (approval thresholds, discount limits) — org-level default, Manager UC-29 may override per store within limits

---

## 2. Detailed Use Cases (Core MVP)

### UC-04 / UC-05 / UC-14 — Core Sale Transaction Flow
*(Grouped as one primary end-to-end use case: "Perform Sale")*

- **Actor:** Cashier
- **Preconditions:** Cashier is logged in; register session is open (UC-02 complete).
- **Main Flow:**
  1. Cashier starts a new transaction (UC-04).
  2. Cashier scans or searches for each item; item is added with current price and applicable tax (UC-05).
  3. System updates running subtotal, tax, and total after each item.
  4. Cashier applies discounts if applicable (UC-07).
  5. Cashier selects payment method(s) and completes payment (UC-11/12/13).
  6. System finalizes the transaction, decrements inventory, generates a receipt, and logs the transaction (UC-14).
- **Alternative Flows:**
  - Cashier holds the transaction mid-sale (UC-08) and resumes later (UC-09).
  - Cashier removes an item or adjusts quantity before payment (UC-06).
  - Customer pays via split payment (UC-13).
- **Exceptions / Failure Cases:**
  - Item barcode not found → cashier performs manual search/lookup (UC-19-adjacent) or escalates.
  - Insufficient stock recorded in system for scanned item → warning shown; Manager may need to confirm sale (policy TBD — see Open Question).
  - Payment declined (card) → cashier retries or switches payment method; transaction remains open.
  - Register/network failure mid-transaction → transaction must be recoverable, not lost (see NFR from Step 1).
- **Expected Outcome:** Sale is finalized, inventory decremented, receipt issued, transaction and payment logged with cashier/register/timestamp for audit.

---

### UC-07 — Apply Discount to Transaction or Item
- **Actor:** Cashier (self-service within limit), Store Manager (approval above limit)
- **Preconditions:** Active transaction in progress; discount rule exists or manual discount is within cashier's authorized threshold.
- **Main Flow:**
  1. Cashier selects item(s) or whole transaction to discount.
  2. Cashier applies a predefined promotion or enters a manual discount (% or fixed).
  3. System validates discount against configured limits (UC-29/UC-40).
  4. If within cashier limit, discount applied immediately; totals recalculated.
- **Alternative Flow:** Discount exceeds cashier's threshold → system requests Manager override (UC-18 → UC-20).
- **Exceptions:** Manager unavailable/denies override → discount rejected, cashier informed.
- **Expected Outcome:** Discount applied and logged with the authorizing user (cashier or manager) for audit.
- **Relationship:** Depends on UC-24 (Promotions) and UC-29 (Thresholds); triggers UC-18/UC-20 when over threshold.

---

### UC-15 — Process Return/Refund (With Receipt)
- **Actor:** Cashier
- **Preconditions:** Original transaction reference (receipt/ID) is available and retrievable in the system.
- **Main Flow:**
  1. Cashier looks up original transaction via receipt reference.
  2. Cashier selects item(s) being returned.
  3. System validates item(s) belong to that transaction and calculates refund amount (respecting original discounts/tax).
  4. If refund amount is within cashier's authorized threshold, cashier processes refund directly.
  5. System restores inventory (if item is resellable) and issues refund via original payment method (or per policy).
  6. Transaction is logged as a return, linked to the original sale.
- **Alternative Flow:** Refund exceeds threshold → escalate to Manager (UC-18 → UC-20).
- **Exceptions:**
  - Item not eligible for return (policy-defined, e.g., perishables) → rejected with reason logged.
  - Refund amount recalculation mismatch (altered item/price disputes) → flagged for Manager review.
- **Expected Outcome:** Refund issued, inventory adjusted appropriately, return transaction logged and linked to original sale.
- **Relationship:** Extends UC-04 (Sale) via reference; depends on UC-20 for over-threshold cases.

---

### UC-16 — Process Return/Refund (Without Receipt)
- **Actor:** Cashier (initiator), Store Manager (mandatory approver)
- **Preconditions:** No valid original transaction reference available.
- **Main Flow:**
  1. Cashier initiates a "no-receipt return" request, entering item(s) and reason.
  2. System requires mandatory Manager approval regardless of amount (higher fraud risk).
  3. Manager reviews and approves/denies (UC-20).
  4. If approved, refund is issued per store policy (e.g., store credit only, or cash/card at Manager's discretion) and inventory updated if item is resellable.
- **Exceptions:** Manager denies request → return rejected, logged with reason.
- **Expected Outcome:** Return either completed under Manager authorization or rejected; fully logged for audit regardless of outcome.
- **Relationship:** Always triggers UC-20; distinct from UC-15 due to mandatory escalation.

---

### UC-17 — Void Completed Transaction
- **Actor:** Cashier (initiator), Store Manager (mandatory approver)
- **Preconditions:** Transaction has already been completed/paid.
- **Main Flow:**
  1. Cashier selects a completed transaction to void (e.g., wrong item rung up after payment).
  2. System requires Manager approval.
  3. Manager approves/denies (UC-20).
  4. If approved, transaction is reversed: inventory restored, payment reversed/refunded, transaction marked void (not deleted).
- **Exceptions:** Payment reversal fails (e.g., card reversal issue) → flagged for manual reconciliation.
- **Expected Outcome:** Original transaction remains in history marked "voided," linked reversal record created, audit trail preserved (voids are never hard-deleted).
- **Relationship:** Always triggers UC-20; distinct from UC-10 (pre-payment cancel, no approval needed).

---

### UC-02 / UC-03 — Register Open/Close
- **Actor:** Cashier
- **Preconditions (Open):** Cashier is authenticated; register is not already open by another session.
- **Main Flow (Open):**
  1. Cashier logs in and selects a register.
  2. Cashier enters starting cash amount.
  3. System creates a register session tied to cashier, register, and timestamp.
- **Main Flow (Close):**
  1. Cashier initiates register close at end of shift.
  2. System shows expected cash total (starting cash + cash sales − cash refunds/payouts).
  3. Cashier enters actual counted cash.
  4. System calculates variance (over/short) and logs it.
- **Exceptions:**
  - Register already open under another session → error, must resolve (Manager may force-close via UC-28).
  - Large variance detected → flagged for Manager review.
- **Expected Outcome:** Register session closed with reconciled/variance-logged cash total; session data available for reporting (UC-22).

---

### UC-30 / UC-31 — Manage Product Catalog
- **Actor:** Inventory Staff (Manager may also have access per business decision — see Open Question)
- **Preconditions:** User authenticated with inventory-management permission.
- **Main Flow:**
  1. Inventory Staff adds a new product (name, barcode/SKU, category, base price, initial stock) or edits an existing product's details.
  2. System validates uniqueness of barcode/SKU.
  3. Product is saved and becomes available for sale (if active) or immediately reflects updated details for future transactions.
- **Exceptions:** Duplicate barcode/SKU → rejected with error.
- **Expected Outcome:** Catalog reflects accurate, current product data; change is attributable to the staff member (audit).

---

### UC-32 — Adjust Stock Quantity
- **Actor:** Inventory Staff
- **Preconditions:** Product exists in catalog.
- **Main Flow:**
  1. Inventory Staff selects product and enters adjustment quantity (+/-) and mandatory reason (damage, expiry, theft, count correction, restock).
  2. System updates stock level and logs the adjustment with user, reason, timestamp.
- **Exceptions:** Adjustment would result in negative stock → system warns/blocks depending on policy (TBD).
- **Expected Outcome:** Stock level accurately reflects physical inventory; adjustment is auditable.
- **Relationship:** Feeds UC-27 (low-stock alerts) and UC-21/UC-23 reporting.

---

### UC-20 — Approve Manager Override
- **Actor:** Store Manager
- **Preconditions:** A pending escalation exists (from UC-07, UC-15, UC-16, or UC-17).
- **Main Flow:**
  1. Manager is notified/prompted (in-person PIN entry or approval screen — mechanism TBD, no UI decisions here).
  2. Manager reviews the request context (amount, reason, cashier, item).
  3. Manager approves or denies.
  4. System logs decision with Manager identity and timestamp, then resumes the originating flow.
- **Exceptions:** No Manager available on-site → transaction cannot proceed past the restricted action (business continuity risk — see Open Question).
- **Expected Outcome:** Every override has a clear approving authority recorded; originating use case resumes or is cancelled based on decision.
- **Relationship:** Central dependency for UC-07, UC-15, UC-16, UC-17.

---

### UC-21 / UC-22 / UC-23 — Reporting & Audit Review
- **Actor:** Store Manager (UC-21, UC-22), Admin (UC-23, full access), Manager (UC-23, store-scoped)
- **Preconditions:** Sufficient transaction/audit history exists.
- **Main Flow:**
  1. Manager/Admin selects a report type and date range/filters (by register, cashier, product).
  2. System aggregates and displays relevant sales, cash variance, or audit entries.
- **Expected Outcome:** Role has actionable visibility into store performance and accountability trail without needing manual data compilation.

---

### UC-26 / UC-36 — Manage Staff Accounts
- **Actor:** Store Manager (UC-26: Cashier & Inventory Staff only), Admin (UC-36: all roles, including Managers)
- **Preconditions:** Actor has account-management permission.
- **Main Flow:**
  1. Actor creates/edits/deactivates a user account and assigns a role.
  2. System enforces that Manager cannot create/modify Admin or other Manager accounts (segregation of duties).
- **Exceptions:** Attempt to deactivate a user with an active open register session → system warns/forces session resolution first.
- **Expected Outcome:** User directory stays accurate; role assignment enforces least-privilege by default.

---

### UC-24 / UC-25 / UC-29 — Configuration Use Cases
- **Actor:** Store Manager
- **Preconditions:** Manager authenticated with configuration permissions.
- **Main Flow:**
  1. Manager creates/edits a promotion (item/category, discount type, validity dates) — UC-24.
  2. Manager configures tax rate(s) per category or globally — UC-25.
  3. Manager sets approval thresholds for discounts/refunds/voids — UC-29.
- **Exceptions:** Overlapping promotions on same item — system must apply a defined precedence rule (see Missing Requirement below).
- **Expected Outcome:** Business rules are centrally configurable, not hardcoded, and apply consistently at checkout.
- **Relationship:** UC-25/UC-29 may be bounded by Admin-level defaults (UC-38/UC-40).

---

## 3. Core MVP vs. Future Use Cases

### Core MVP (in scope now)
UC-01 through UC-40 as listed above are **all MVP-relevant** given the stated scope, **except** the following, which are explicitly deferred:

### Future / Out of Scope for MVP
- Customer management, profiles, purchase history (no UC defined — deferred per Step 1).
- Loyalty program / points (deferred).
- Supplier & Purchase Order management, including formal "goods received against PO" workflow — MVP only supports **manual stock receipt** (UC-33) without a supplier/PO entity.
- Offline/degraded-network transaction mode — MVP assumes connectivity; recovery-from-crash requirement (data not lost) still applies but "full offline operation" does not.
- Multi-store administration (switching store context, cross-store reporting, cross-store stock transfer) — architecture must stay extensible (e.g., don't hardcode single-store assumptions into core entities), but no multi-store UI/logic is built now.
- Digital receipt delivery (email/SMS) — assume printed receipt only for MVP unless stated otherwise (see Open Question carried from Step 1).

---

## 4. Use Case Relationships

- **UC-02 (Open Register)** must precede **UC-04 (Start Sale)**; a sale cannot occur without an open register session.
- **UC-04 → UC-05 → UC-14** form the linear backbone of a sale; UC-06/UC-07/UC-08/UC-09/UC-13 are optional branches within that flow.
- **UC-07, UC-15, UC-16, UC-17** all **extend/depend on UC-20** (Manager Override) when exceeding cashier authority — UC-20 is a shared "included use case."
- **UC-15 (Return with receipt)** *extends* the original **UC-04/UC-14** sale — requires a reference to a prior completed transaction.
- **UC-16 (Return without receipt)** and **UC-17 (Void)** always require **UC-20**, unlike UC-07/UC-15 which only require it above a threshold.
- **UC-32 (Stock Adjustment)** and **UC-05 (Add Item to Sale)** both mutate the same stock quantity — potential concurrency conflict point (see Missing Requirement).
- **UC-24 (Promotions)** and **UC-25 (Tax Config)** are both consumed at calculation time during **UC-05/UC-14** — checkout totals depend on current configuration state.
- **UC-26 (Manager manages staff)** is scoped beneath **UC-36 (Admin manages staff)** — Admin has superset authority; Manager's authority is a constrained subset (cannot touch Manager/Admin accounts).
- **UC-29 (Manager thresholds)** operates within bounds possibly set by **UC-40 (Admin default thresholds)** — relationship direction (Admin sets ceiling, Manager sets store-specific value within it) is an assumption needing confirmation (see Open Question).
- **UC-03 (Close Register)** produces data consumed by **UC-22 (Cash Reconciliation Report)**.
- **UC-30/UC-31/UC-32 (Inventory Staff catalog/stock actions)** feed **UC-27 (Low-Stock Alerts)** and **UC-21/UC-23 (Reporting/Audit)**.

---

## 5. High-Level Use Case Map

```
                         ┌────────────────────────┐
                         │        ADMIN            │
                         │ (UC-36,37,38,39,40)      │
                         └───────────┬─────────────┘
                                     │ configures defaults / manages all users
                                     ▼
                         ┌────────────────────────┐
                         │      STORE MANAGER       │
                         │ UC-20 Approve Override   │
                         │ UC-21 Sales Reports       │
                         │ UC-22 Cash Reconciliation │
                         │ UC-23 Audit Log (store)   │
                         │ UC-24 Promotions          │
                         │ UC-25 Tax Config          │
                         │ UC-26 Manage Staff        │
                         │ UC-27 View Inventory      │
                         │ UC-28 Force-close Register │
                         │ UC-29 Approval Thresholds  │
                         └───────┬───────────┬───────┘
                approves/escalates│           │oversees
                                 ▼           ▼
        ┌─────────────────────────┐   ┌──────────────────────────┐
        │        CASHIER            │   │     INVENTORY STAFF       │
        │ UC-01 Login/Logout         │   │ UC-30 Add Product          │
        │ UC-02 Open Register        │   │ UC-31 Update Product       │
        │ UC-03 Close Register       │   │ UC-32 Adjust Stock          │
        │ UC-04..14 Perform Sale     │   │ UC-33 Record Stock Receipt │
        │ UC-15/16 Return/Refund     │   │ UC-34 Low-Stock/Expiry View │
        │ UC-17 Void Transaction     │   │ UC-35 Stock Count/Audit     │
        │ UC-18 Request Override     │   └──────────────┬────────────┘
        │ UC-19 Price Check          │                  │
        └───────────┬───────────────┘                   │
                    │ decrements/reads stock             │ updates stock
                    ▼                                    ▼
              ┌─────────────────────────────────────────────┐
              │              SHARED STOCK / PRODUCT DATA       │
              └─────────────────────────────────────────────┘
```

**Reading the map:** Cashier and Inventory Staff both operate on the same underlying stock data from different directions (sell-side vs. supply-side), which is why concurrency and stock-accuracy is a cross-cutting concern. Manager sits above both operational roles for approval/oversight; Admin sits above Manager for system-wide configuration and account governance.

---

## 6. Missing Business Requirements Discovered

While defining these use cases, the following gaps were identified that Step 1 did not fully resolve:

1. **Promotion precedence rule** — no rule yet defines what happens when multiple promotions apply to the same item/transaction (stack, take best, take first-defined?).
2. **Negative stock policy** — undefined whether the system should hard-block a sale/adjustment that would drive stock below zero, or merely warn and allow (common in real retail due to miscounts).
3. **Return eligibility policy** — no defined rule for which products are returnable (e.g., perishables, opened items, sale items) — needed to properly gate UC-15/UC-16.
4. **Refund payment method policy** — unclear if refunds must go back to the original payment method (e.g., card refund to card) or if cash/store-credit substitution is allowed — affects UC-15/UC-16/UC-17.
5. **Manager-unavailable fallback** — no defined business continuity rule for when a Manager-required approval (UC-20) cannot be obtained (e.g., sole Manager off-site). Is there a secondary approver (Admin remote approval) or is the action simply blocked?
6. **Concurrent stock contention** — no rule for two registers competing for the last unit of stock (first-come-first-served at payment time? reserved at add-to-cart time?).
7. **Price-catalog authority** — Step 1 left open whether Inventory Staff can set prices or only Manager/Admin; this affects permissions on UC-30/UC-31.
8. **Receipt delivery mechanism** — still undecided (print only vs. also digital) — affects UC-14 outcome definition.
9. **Void vs. Return distinction in edge timing** — if a void is requested after the customer has left the store, is it still a "void" or does it become a "return"? Needs a clear business-rule boundary.
10. **Session/permission revocation timing** — if Admin/Manager deactivates a Cashier mid-shift (open register), is the register auto-force-closed, locked, or left pending Manager action (UC-28)?

---

## 7. Conflicting or Ambiguous Requirements to Resolve

1. **Manager vs. Admin threshold authority (UC-29 vs. UC-40):** Ambiguous whether Admin-set thresholds are a hard ceiling Manager cannot exceed, or just an initial default Manager can freely override. Needs explicit decision.
2. **Tax configuration ownership (UC-25 vs. UC-38):** Both Manager and Admin are listed with tax-configuration capability from Step 1/Step 2 drafting — needs a single source of truth: is tax configured once at Admin/system level (simplest for single-store MVP) with Manager only *viewing* it, or can Manager actually edit tax rules?
3. **Inventory Staff vs. Manager pricing authority:** Step 1's open question ("who sets prices") remains unresolved and directly affects permission boundaries for UC-30/UC-31.
4. **Stock check timing at checkout:** Ambiguous whether "insufficient stock" during a sale (UC-05) should be a hard block, a warning cashier can override, or something requiring Manager approval — impacts a core, frequent flow and needs resolution before workflow design.
5. **No-receipt return payout method:** Ambiguous whether a Manager-approved no-receipt return (UC-16) can be refunded as cash, only as store credit, or Manager's discretionary choice — has direct financial-risk implications.
6. **Definition of "void" scope:** Ambiguous whether void (UC-17) is only allowed same-day/same-shift, or possible anytime after payment — affects inventory/financial reconciliation rules.

---

*This document concludes Step 2 — Use Cases & User Roles. No code, database, API, or UI decisions have been made. The missing requirements and conflicts in Sections 6–7 should be resolved (or explicitly deferred with a stated assumption) before proceeding to Step 3 — Business Workflows & Business Rules.*
