# Supermarket POS System — System Architecture & Backend Design

**Step 5: System Architecture & Backend Design**

**Baseline:** Builds directly on `@/Users/mohamedtarek/Supermarket POS System/docs/01-requirements-analysis.md`, `@/Users/mohamedtarek/Supermarket POS System/docs/02-use-cases-and-roles.md`, `@/Users/mohamedtarek/Supermarket POS System/docs/03-workflows-and-business-rules.md`, and `@/Users/mohamedtarek/Supermarket POS System/docs/04-data-model.md`. The Step 4 data model is the approved baseline and is **not** redesigned here.

**Newly resolved Step 4 decisions folded into this design:**
- Every product requires a `category_id` (NOT NULL, no longer nullable).
- `approval_thresholds` is **versioned/history-aware** (effective-dated rows per role, not a single mutable row).
- `products.barcode` uniqueness applies only among **active** products (reusable once a product is deactivated).
- All monetary calculations use a **consistent 2-decimal (EGP fils-free) rounding policy**, applied at one designated point per calculation chain (see §7 Validation Strategy).
- Return window = **7 calendar days** from the sale's `completed_at`, evaluated using the **store's local date** (not raw UTC offset arithmetic).
- **No multi-store fields** added — single-store assumption remains implicit, per "do not over-engineer."
- Manual stock adjustments require **reason + actor + audit reference** (already modeled via `stock_movements.reason` + `performed_by` + corresponding `audit_logs` row).
- Receipt numbers are **centrally sequential integers**, DB-sequence-backed, single global scope.
- `stock_movements` is confirmed as the **inventory source of truth**; `products.current_stock` is a **cache**, synchronized atomically within the same transaction as every movement.

**Conventions for this step:**
- **Auth:** stateless JWT access tokens; role-based authorization; live `users.is_active` re-check on every request (JWTs cannot be revoked mid-life, so deactivation is enforced by re-querying user status, not by trusting token claims alone).
- **Stack:** framework/language-agnostic. Layers are described conceptually (API/Controller → Service → Repository → Database). No specific programming language or framework is committed to in this step.
- **API style:** REST-style HTTP endpoints, JSON request/response bodies (illustrative, not a final wire-format commitment).

---

## Part A — Architecture

### A1. Overall System Architecture

**Modular monolith.** A single deployable backend application, internally organized into cohesive modules that mirror business domains, each with its own Controller/Service/Repository slice:

```
┌─────────────────────────────────────────────────────────────┐
│                     Backend Application                      │
│                                                                │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
│  │   Auth     │ │  Catalog   │ │   Sales    │ │ Inventory  │   │
│  │  Module    │ │  Module    │ │  Module    │ │  Module    │   │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘   │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
│  │ Registers  │ │ Returns/   │ │ Approvals  │ │ Users/     │   │
│  │  Module    │ │ Refunds    │ │  Module    │ │Permissions │   │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘   │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐                  │
│  │    Tax     │ │ Reporting  │ │   Audit    │                  │
│  │  Module    │ │  Module    │ │  Module    │                  │
│  └───────────┘ └───────────┘ └───────────┘                  │
│                                                                │
│              Shared: DB connection/transaction manager,       │
│              JWT auth middleware, error-handling middleware   │
└─────────────────────────────────────┬─────────────────────────┘
                                       │
                                  ┌────▼────┐
                                  │ Database │
                                  └─────────┘
```

- Modules communicate **in-process** (direct service calls), not over the network — no message broker, no service mesh.
- Each module owns its slice of the schema conceptually but the database itself remains a single shared relational store (per Step 4).
- **No microservices** for MVP: single-store, moderate transaction volume, and a small team do not justify the operational overhead (deployment complexity, distributed transactions, network latency) that microservices would introduce. Revisit only if multi-store scale genuinely requires independent scaling/deployment of specific domains.

### A2. Frontend Responsibility

- Presentation, UX flow, input capture (barcode scan integration, forms), and **optimistic/preview calculations only** (e.g., showing a running total as items are added) for responsiveness.
- The frontend **never** is the source of truth for pricing, discounts, tax, stock availability, or permissions — every value it displays before an operation completes is a preview; the backend recomputes and validates everything server-side before persisting.
- The frontend calls backend APIs for every state-changing action; it holds no independent business logic that could diverge from backend rules (directly satisfies the "business rules must not live only in the frontend" principle).

### A3. Backend Responsibility

- All validation (shape + business rule), all authorization decisions, all business rule enforcement, all persistence, all audit logging.
- The backend is the **sole authority** for: current price, current stock, applicable tax/promotions, permission/threshold checks, and every state transition (Sale, Return, Register Session, Manager Approval).

### A4. Authentication & Authorization Architecture

- **Authentication:** Username/password login (`W-01`) issues a short-lived **JWT access token** containing `user_id` and `role` claims. No refresh-token flow is specified as mandatory for MVP but is a reasonable addition (see Open Questions).
- **Live deactivation enforcement (`UP-06`):** because a JWT cannot be revoked before expiry, every authenticated request's middleware re-checks `users.is_active` (and current `role_id`) directly from the database — the token identifies *who*, but the database determines *whether they still may act*. This guarantees immediate effect of deactivation/role changes (`UP-05`) despite a stateless token.
- **Authorization:** role-based access control (RBAC) enforced via a server-side middleware/guard per endpoint, checking the caller's live role against the endpoint's required role(s)/permission key (from `role_permissions`).
- **Threshold-based authorization** (discount/refund limits): resolved dynamically per-request from the **current effective** `approval_thresholds` row (via effective-dated lookup, since thresholds are now versioned) — never cached in the JWT, since thresholds can change between token issuance and use (`UP-05`, `MA-03`).
- **Manager-approval elevation:** a Manager approving an escalation is a *separate* authorization check at the moment of decision (not inherited from the original request), and is itself bounded by the Manager's own configured ceiling (`MA-03`).

### A5. Business / Service Layer Responsibilities

- One service class/module per business domain (e.g., `SalesService`, `InventoryService`, `ReturnsService`, `ApprovalsService`, `RegisterSessionService`, `UsersService`, `TaxService`, `PromotionsService`, `ReportingService`, `AuditService`).
- Each service method corresponds to one business operation (e.g., `SalesService.completeSale(saleId)`) and is responsible for:
  1. Re-validating all preconditions (state, stock, thresholds) at execution time — never trusting a stale precondition check from earlier in the request lifecycle.
  2. Orchestrating repository calls within a single transaction boundary (see A8).
  3. Writing the corresponding `audit_logs` entry as part of the same operation.
  4. Raising well-defined business exceptions (see A9) rather than generic errors.
- Services **never** talk to each other's repositories directly across domains without going through the owning service's public method — this keeps invariants (e.g., stock non-negativity) enforceable in exactly one place.

### A6. Data Access / Repository Layer Responsibilities

- One repository per entity/aggregate (e.g., `ProductRepository`, `SaleRepository`, `StockMovementRepository`, `RegisterSessionRepository`, `ApprovalThresholdRepository`).
- Repositories contain **only** persistence logic: CRUD-style queries, filtering, and the specific locking reads needed for concurrency control (e.g., "select product for update"). They contain **no business rules** — a repository never decides *whether* a discount is allowed, only *how* to read/write the corresponding rows.
- This separation keeps services independently testable against repository interfaces/mocks, and keeps the persistence technology swappable in principle (though no specific database technology is chosen in this step, consistent with Step 4).

### A7. Validation Strategy

Two enforced tiers, both server-side:

1. **Request-shape validation** (API boundary): required fields present, correct types, basic ranges (e.g., quantity > 0, non-empty strings) — rejects malformed requests early with `400`/`422` before touching business logic.
2. **Business-rule validation** (service layer): the substantive rules from Step 3 — stock availability, discount/refund thresholds, state-machine legality (e.g., cannot void a Completed sale), promotion eligibility/precedence, return window (7 calendar days, store-local date), return-quantity caps (`RT-04`), refund-amount caps (`RF-03`).

**Frontend-side validation** exists purely for UX responsiveness (e.g., disabling a submit button, inline hints) and is **never** relied upon for correctness — every business rule tier-2 check listed above is re-executed server-side regardless of what the frontend already checked.

**Monetary rounding policy:** all monetary calculations (discount, tax, line totals, sale totals, refund splits) round to **2 decimal places** at the point where a value is persisted or displayed, using a single shared rounding utility (e.g., round-half-up, applied consistently) so that the same input always produces the same stored value — preventing cumulative floating-point drift across services. Rounding is applied once per computed field, not repeatedly at each intermediate step, to avoid compounding rounding error.

### A8. Transaction Boundaries

Directly implementing the boundaries identified in `@/Users/mohamedtarek/Supermarket POS System/docs/03-workflows-and-business-rules.md` (Part 5) as **"one service method = one database transaction"**:

| Service Method | Atomic Unit |
|---|---|
| `SalesService.completeSale()` | Stock re-validation + `stock_movements` inserts + `products.current_stock` update + `payments` finalization + `sales.status → COMPLETED` + receipt number assignment + `audit_logs` insert |
| `RegisterSessionService.open()` | `register_sessions` insert (guarded by the partial-unique-open-session constraint) + `audit_logs` insert |
| `RegisterSessionService.close()` | Expected-cash computation + `register_sessions.status → CLOSED` + variance recording + `audit_logs` insert |
| `ReturnsService.approveAndRefund()` | `returns.status → APPROVED/REFUNDED` + `refunds` insert(s) + `stock_movements` restock insert (if resellable) + `products.current_stock` update + `audit_logs` insert |
| `SalesService.voidSale()` | `sales.status → VOIDED` + payment reversal/release + `audit_logs` insert |
| `ApprovalsService.decide()` | `manager_approvals.status → APPROVED/DENIED` + resumption or termination of the originating operation, evaluated within the same transaction so an "Approved" decision can never be left stranded |
| `InventoryService.adjustStock()` / `.addStock()` | `stock_movements` insert + `products.current_stock` update + `audit_logs` insert |
| `CatalogService.updateProduct()` | `products` update + `audit_logs` insert (when price changes) |
| `UsersService.updatePermissions()` / `ApprovalThresholdService.setEffectiveThreshold()` | New versioned config row insert + immediate-effective guarantee + `audit_logs` insert |

Each row above is enforced as a **single database transaction**: if any step fails, the entire operation rolls back, leaving the prior state fully intact (`INV-12`).

### A9. Error Handling Strategy

A consistent error taxonomy, each mapped to an HTTP status and a structured JSON error shape (`{ "error_code": ..., "message": ..., "details": {...} }`):

| Category | Example | HTTP Status |
|---|---|---|
| Request validation error | missing required field, invalid type | `400` |
| Authentication error | missing/invalid/expired token | `401` |
| Authorization error | role lacks permission, threshold exceeded without approval | `403` |
| Not found | product/sale/return ID doesn't exist | `404` |
| Business rule conflict | insufficient stock, invalid state transition, over-return | `409` (conflict) or `422` (unprocessable, for pure rule violations without a concurrency angle) |
| Concurrency conflict | lost race on last-unit stock, register already open | `409` |
| Manager approval required/unavailable | escalation needed but no manager available (`MA-02`) | `403` with a specific `error_code: APPROVAL_UNAVAILABLE` |
| Unexpected/internal error | unhandled exception | `500` |

- Every rejected sensitive operation still produces a **technical log entry** (for debugging) even though it does not produce an `audit_logs` row (since `audit_logs` records actual attempted/decided actions per `AL-01`, and a request that fails validation before reaching a service's core logic was never really "attempted" in the business sense — see Open Questions for the boundary case of a Manager *denial*, which **does** get an audit row since a decision was actually made).
- No silent failures: every exception path returns a structured, actionable error to the caller.

### A10. Audit Logging Flow

- The `AuditService.record(actorId, actionType, entityType, entityId, before, after, reason)` helper is called from **inside** each business service method, as the last step before the transaction commits — never as an asynchronous/fire-and-forget side effect, guaranteeing `audit_logs` and the business change succeed or fail together (`AL-01`, atomicity boundary A8).
- A cross-cutting **audit-writing pattern** (e.g., a decorator/interceptor invoked by each service method, conceptually) avoids repeating boilerplate while keeping the actual `INSERT` inside the same transaction as the triggering change.
- `audit_logs` rows are never updated or deleted by any code path (`AL-03`) — no repository method for update/delete is exposed on this entity at all, enforcing immutability structurally rather than by convention alone.

### A11. Inventory Concurrency Strategy

- **Mechanism (now concretely specified, deferred in Step 4):** pessimistic row-level locking. When a service is about to mutate a product's stock (sale completion, adjustment, restock), it acquires a lock on that specific `products` row (illustrative: `SELECT ... FOR UPDATE`-style read) at the start of the transaction, re-reads the current `current_stock` under that lock, validates the operation against it, then writes the new `stock_movements` row and updated cache — all before releasing the lock at commit.
- This serializes concurrent mutations to the *same* product (two registers selling the last unit cannot both proceed) while leaving unrelated products' transactions unaffected (fine-grained, not a global lock).
- The DB-level `CHECK (current_stock >= 0)` constraint (Step 4 §5) remains as a last-resort integrity guard even if application logic has a defect.
- On a lock-acquisition timeout or a failed check, the transaction rolls back and the caller receives a `409 Concurrency Conflict`, with guidance to retry (e.g., re-fetch current stock and re-attempt, which is a client/service-layer retry concern, not a silent auto-retry that could mask real errors).

### A12. Manager Approval Flow

- **Synchronous, no queue, for MVP.** When a Cashier-initiated action needs escalation (discount over threshold, no-receipt return, void-after-payment), the service creates a `manager_approvals` row (`status = PENDING`) and returns a response indicating "awaiting approval," referencing the approval's ID.
- A Manager (or Admin) calls a dedicated `POST /approvals/{id}/decision` endpoint to approve or deny; this is a **separate authenticated request**, not a callback — in practice this typically means the Manager is physically present and a UI surfaces the pending request to them at that moment (e.g., a shared approval screen or the Manager's own device), but the exact UX mechanism is out of scope for this architecture step.
- **No manager available (`MA-02`):** if the initiating flow cannot locate an authenticated, active Manager/Admin to hand off to, the original operation is rejected immediately with `403 APPROVAL_UNAVAILABLE` — no `PENDING` row lingers indefinitely awaiting an approver, consistent with Step 3's "rejected outright" rule. (If a `PENDING` row was already created before determining no manager is reachable, it is immediately marked `DENIED` with a system-generated reason, preserving the audit trail per `INV-09`.)
- Approval decisions themselves are versioned/thresholds-aware per A4 — the deciding Manager's authority is checked live at decision time, not at request time.

### A13. Payment Processing Boundary

- Card payments are handled through an abstracted `PaymentGateway` interface — a boundary this backend defines but whose concrete implementation (a real third-party processor) is **external and out of scope** for this MVP's architecture.
- The `SalesService`/`PaymentsService` treats a gateway call as an external dependency **inside** the sale-completion transaction's logical flow, but the actual gateway call itself cannot be part of the same database transaction (it's a network call to an external system). The pattern is:
  1. Attempt gateway authorization (outside the DB transaction).
  2. On confirmed success, begin the DB transaction to record the `payments` row and proceed with sale completion.
  3. On confirmed failure, no DB changes occur; sale remains `PAYMENT_PENDING`.
  4. On **ambiguous/timeout** response (`W-06`'s key exception case), the payment is recorded with `status = 'FAILED'` pending manual reconciliation *or* left unrecorded with the sale explicitly flagged for manual follow-up — the system must never guess success and silently complete a sale that wasn't actually paid for.
- Cash payments have no external dependency and are recorded directly within the sale-completion transaction.

### A14. Configuration Management

- Business-tunable configuration (tax rates, approval thresholds, discount limits, register variance threshold) lives in **database-backed, versioned tables** (`tax_rates`, `approval_thresholds`), editable at runtime by Admin — **not** environment variables or static config files, because these must be changeable by a non-technical Admin user through the application itself and take effect immediately (`UP-05`) without a deployment.
- Purely technical/infrastructure configuration (DB connection string, JWT signing secret, log levels) remains in environment-level configuration, separate from business configuration — this is a deployment concern, not a business one, and is not elaborated further here.

### A15. Reporting Architecture

- MVP reporting is a **read-only query layer** directly against the operational schema (no separate data warehouse, no ETL pipeline) — justified by single-store scale and the "do not over-engineer" principle.
- `ReportingService` composes aggregate queries across `sales`, `sale_items`, `payments`, `stock_movements`, `returns`, `refunds`, and `audit_logs` for the report types identified in `W-20` (sales summary, cash reconciliation, inventory status, audit trail).
- Reports are computed on-demand per request; if performance becomes a concern at higher transaction volume, targeted read-replicas or materialized summary tables are a future optimization, not an MVP requirement (see Open Questions).

### A16. Logging & Observability

- **Two distinct log streams, kept separate:**
  1. **Technical/operational logs** (application errors, request traces, performance timing) — for engineering debugging, not part of the permanent business record, may be pruned/rotated per standard operational practice.
  2. **Business audit logs** (`audit_logs` table) — the permanent, immutable business accountability record described throughout this document; never pruned, never treated as "just logs."
- Structured logging (consistent field names: timestamp, request ID, user ID, module, severity) is assumed for the technical stream to support debugging and future observability tooling (metrics/tracing), without committing to a specific tool in this step.

### A17. Security Boundaries

- **Server-side authorization is absolute** — no endpoint trusts a client-supplied role, permission flag, or threshold value; every check re-derives the caller's live role/permissions/thresholds from the database on each request.
- Passwords are stored as salted hashes (algorithm choice deferred to implementation, e.g., a standard adaptive hash), never in plaintext.
- JWTs are short-lived to limit the exposure window of a compromised token; combined with the live `is_active` re-check (A4), this bounds the practical impact of both token theft and delayed deactivation.
- All inputs are validated/sanitized at the API boundary (A7) to guard against injection-style attacks, independent of the specific persistence technology eventually chosen.
- Rate-limiting on the login endpoint is noted as a reasonable MVP-level safeguard against credential brute-forcing, without specifying an implementation mechanism (kept intentionally lightweight, not over-engineered).

---

## Part B — API Design

> Notation: all endpoints require a valid JWT unless noted; "Required Role" lists the minimum role(s) permitted. Request/response summaries are illustrative field lists, not final wire contracts.

### B1. Authentication

| Method | Endpoint | Purpose | Required Role | Request Summary | Response Summary | Key Validation/Errors |
|---|---|---|---|---|---|---|
| POST | `/auth/login` | Authenticate and obtain a JWT | None (public) | `username`, `password` | `access_token`, `user_id`, `role`, `expires_at` | `401` invalid credentials; `403` account deactivated; rate-limited |
| POST | `/auth/logout` | Client-side token discard acknowledgement (no server session to invalidate under stateless JWT) | Any authenticated | — | `204` | `401` if token already invalid |
| GET | `/auth/me` | Get current authenticated user's identity/role | Any authenticated | — | `user_id`, `username`, `full_name`, `role`, `is_active` | `401` invalid/expired token; `403` if deactivated since token issuance |

### B2. Users / Roles / Permissions

| Method | Endpoint | Purpose | Required Role | Request Summary | Response Summary | Key Validation/Errors |
|---|---|---|---|---|---|---|
| GET | `/users` | List users (filterable by role/status) | Manager, Admin | query: `role`, `is_active` | list of user summaries | `403` if Manager attempts to see Admin/Manager-only fields (scoping, see note) |
| POST | `/users` | Create a new user account | Manager (Cashier/Inventory only), Admin (any role) | `username`, `password`, `full_name`, `role` | created user summary | `400` invalid role for creator; `409` username taken |
| PATCH | `/users/{id}` | Update user details/role/deactivate | Manager (own-scope only), Admin (any) | partial fields, e.g. `is_active`, `role`, `full_name` | updated user summary | `403` Manager attempting to modify Manager/Admin account (`UP-03`); `404` not found |
| GET | `/roles` | List roles and their permission sets | Admin | — | role list with `role_permissions` | — |
| PATCH | `/roles/{id}/permissions` | Update a role's permission set | Admin | list of `permission_key` grants | updated permission set | `403` non-Admin; `400` invalid permission key |
| GET | `/approval-thresholds/{role}` | Get current effective threshold for a role | Manager, Admin | — | `max_self_discount_pct`, `max_self_refund_amt`, `register_variance_alert_threshold`, `effective_from` | `404` no threshold configured |
| GET | `/approval-thresholds/{role}/history` | Get versioned threshold history for a role | Admin | — | list of effective-dated threshold rows | — |
| POST | `/approval-thresholds/{role}` | Create a new effective-dated threshold version | Admin | new threshold values + `effective_from` | created threshold version | `403` non-Admin; `400` invalid values (e.g., negative) |

### B3. Categories

| Method | Endpoint | Purpose | Required Role | Request Summary | Response Summary | Key Validation/Errors |
|---|---|---|---|---|---|---|
| GET | `/categories` | List all categories | Any authenticated | — | list of `{id, name}` | — |
| POST | `/categories` | Create a category | Inventory Staff, Manager, Admin | `name` | created category | `409` duplicate name |
| PATCH | `/categories/{id}` | Rename a category | Inventory Staff, Manager, Admin | `name` | updated category | `404` not found; `409` duplicate |

### B4. Products (Catalog)

| Method | Endpoint | Purpose | Required Role | Request Summary | Response Summary | Key Validation/Errors |
|---|---|---|---|---|---|---|
| GET | `/products` | Search/list products (by name, category, active status) | Any authenticated | query: `q`, `category_id`, `is_active` | paginated product list | — |
| GET | `/products/barcode/{barcode}` | Barcode lookup for checkout scan | Cashier, Manager, Admin | — | product detail incl. `current_price`, `current_stock` | `404` no active product for barcode |
| GET | `/products/{id}` | Get product detail | Any authenticated | — | full product detail | `404` not found |
| POST | `/products` | Create a new product | Inventory Staff, Manager, Admin | `sku`, `barcode?`, `name`, `category_id` (required), `current_price`, initial stock | created product | `400` missing category (`PR`-related rule now mandatory); `409` duplicate SKU/barcode among active products |
| PATCH | `/products/{id}` | Update product details/price | Inventory Staff, Manager, Admin (never Cashier, `PR-02`) | partial fields | updated product | `403` if caller is Cashier; `409` barcode collision with another active product; price change triggers `audit_logs` entry |
| PATCH | `/products/{id}/deactivate` | Soft-deactivate a product (frees its barcode for reuse) | Inventory Staff, Manager, Admin | — | updated product (`is_active=false`) | `404` not found |

### B5. Tax Configuration

| Method | Endpoint | Purpose | Required Role | Request Summary | Response Summary | Key Validation/Errors |
|---|---|---|---|---|---|---|
| GET | `/tax-rates` | List current effective tax rate(s) (global + per-category) | Manager (view-only), Admin | — | list of active `tax_rates` | — |
| GET | `/tax-rates/history` | List full tax rate history | Admin | — | list of all `tax_rates` rows incl. expired | `403` non-Admin |
| POST | `/tax-rates` | Create a new effective-dated tax rate | Admin only (`TX-01`) | `category_id?` (null=global), `rate_pct`, `effective_from` | created tax rate | `403` non-Admin (including Manager); `400` negative rate |

### B6. Promotions

| Method | Endpoint | Purpose | Required Role | Request Summary | Response Summary | Key Validation/Errors |
|---|---|---|---|---|---|---|
| GET | `/promotions` | List promotions (filter by active/scope) | Manager, Admin | query: `is_active`, `scope` | list of promotions | — |
| GET | `/promotions/eligible` | Get currently-eligible promotions for a given product/category (used internally by checkout, exposed for transparency/testing) | Cashier, Manager, Admin | query: `product_id` or `category_id` | ranked eligible promotions (precedence order) | — |
| POST | `/promotions` | Create a promotion | Manager, Admin | `name`, `scope`, `product_id?`/`category_id?`, `discount_type`, `discount_value`, `valid_from`, `valid_to` | created promotion | `400` scope/FK mismatch; `400` `valid_to <= valid_from` |
| PATCH | `/promotions/{id}` | Update/deactivate a promotion | Manager, Admin | partial fields | updated promotion | `404` not found |

---

### B7. Registers

| Method | Endpoint | Purpose | Required Role | Request Summary | Response Summary | Key Validation/Errors |
|---|---|---|---|---|---|---|
| GET | `/registers` | List registers and their current status | Cashier, Manager, Admin | — | list of `{id, code, is_active, current_session_status}` | — |
| POST | `/registers/{id}/sessions` | Open a register session (`W-02`) | Cashier | `starting_cash` | created session `{id, status:'OPEN', opened_at}` | `409` register already has an open session (`CR-01`); `409` cashier already has another open session |
| GET | `/registers/{id}/sessions/current` | Get the register's currently open session, if any | Cashier, Manager, Admin | — | session detail or `404` | `404` no open session |
| POST | `/registers/{id}/sessions/{sessionId}/close` | Close a register session (`W-10`) | Cashier (own session), Manager (any, force-close) | `counted_cash` | closed session with `expected_cash`, `variance` | `409` open sales remain unresolved (`CR-03`); `403` Cashier closing another's session (Manager-only force-close) |

### B8. Sales (Checkout)

| Method | Endpoint | Purpose | Required Role | Request Summary | Response Summary | Key Validation/Errors |
|---|---|---|---|---|---|---|
| POST | `/sales` | Start a new draft sale under the caller's open register session | Cashier | `register_session_id` | created sale `{id, status:'DRAFT'}` | `409` no open register session for caller |
| POST | `/sales/{id}/items` | Add a line item (barcode/product + quantity) | Cashier | `product_id`, `quantity` | updated sale with recalculated totals | `409` sale not `DRAFT`; `409` insufficient stock (informational check, `W-03`) |
| PATCH | `/sales/{id}/items/{itemId}` | Update quantity or remove a line item | Cashier | `quantity` (0 = remove) | updated sale | `409` sale not `DRAFT` |
| POST | `/sales/{id}/discounts` | Apply a manual discount or promotion to the sale/line item | Cashier (within threshold), else triggers approval | `scope` (item/sale), `discount_type`, `value` | updated sale, or `{approval_pending: true, approval_id}` | `403 APPROVAL_UNAVAILABLE` if over threshold and no manager reachable (`DS-05`) |
| POST | `/sales/{id}/hold` | Hold the in-progress draft sale | Cashier | — | sale marked held (still `DRAFT`) | `409` sale not `DRAFT` |
| POST | `/sales/{id}/resume` | Resume a held sale | Cashier | — | sale detail | `404` not found/not held |
| POST | `/sales/{id}/void` | Void a pre-completion sale (`W-09`) | Cashier | `reason?` | sale marked `VOIDED` | `409` sale already `COMPLETED` (`VD-02`, use Return/Refund instead) |
| POST | `/sales/{id}/complete` | Finalize the sale after payment(s) cover the total (`W-04`) | Cashier | — | completed sale with `receipt_number`, final totals | `409` insufficient payment; `409` stock became unavailable (re-validated, `INV-STK-03`); triggers atomic transaction per A8 |
| GET | `/sales/{id}` | Get sale detail (for lookup/receipt/return reference) | Cashier, Manager, Admin | — | full sale + line items + payments | `404` not found |
| GET | `/sales` | List/search sales (by register, cashier, date, receipt number) | Manager, Admin | query filters | paginated sale summaries | — |

### B9. Payments

| Method | Endpoint | Purpose | Required Role | Request Summary | Response Summary | Key Validation/Errors |
|---|---|---|---|---|---|---|
| POST | `/sales/{id}/payments/cash` | Record a cash payment/tender toward the sale (`W-05`) | Cashier | `tendered_amount` | payment record + `change_due` | `409` sale not in `DRAFT`/`PAYMENT_PENDING` |
| POST | `/sales/{id}/payments/card` | Initiate a card payment toward the sale (`W-06`) | Cashier | `amount` | payment record with `status` (`CAPTURED`/`FAILED`) | `402`/`409` card declined; ambiguous-timeout handled per A13 (flagged, not silently completed) |
| GET | `/sales/{id}/payments` | List payments recorded against a sale | Cashier, Manager, Admin | — | list of payments | `404` sale not found |

### B10. Returns

| Method | Endpoint | Purpose | Required Role | Request Summary | Response Summary | Key Validation/Errors |
|---|---|---|---|---|---|---|
| POST | `/returns` | Initiate a return, with or without a `sale_id` reference (`W-11`/`W-12`) | Cashier | `sale_id?`, `items: [{sale_item_id? , product_id, quantity}]`, `reason` | created return `{status:'REQUESTED'}`, or `{approval_pending:true, approval_id}` if escalation required | `409` return window expired (>7 calendar days, store-local date, `RT` policy); `409` over-return (`RT-04`); `403 APPROVAL_UNAVAILABLE` if no-receipt and no manager reachable (`RT-02`/`MA-02`) |
| GET | `/returns/{id}` | Get return detail incl. linked refund(s) | Cashier, Manager, Admin | — | return + return_items + refunds | `404` not found |
| GET | `/returns` | List/search returns (by sale, date, status) | Manager, Admin | query filters | paginated return summaries | — |

### B11. Refunds

| Method | Endpoint | Purpose | Required Role | Request Summary | Response Summary | Key Validation/Errors |
|---|---|---|---|---|---|---|
| GET | `/returns/{id}/refunds` | Get refund(s) issued for an approved return | Cashier, Manager, Admin | — | list of refunds (method, amount, status) | `404` return not found |
| POST | `/returns/{id}/refunds/retry` | Retry a refund that failed/needs manual reconciliation (e.g., card reversal failure, `W-13`) | Manager, Admin | — | updated refund status | `409` return not in a refundable state |

*(Note: refund issuance itself is primarily system-triggered as part of `ApprovalsService.decide()`/`ReturnsService.approveAndRefund()` per A8, not a standalone cashier-facing create endpoint — exposed here mainly for status/retry visibility.)*

### B12. Approvals (Manager Overrides)

| Method | Endpoint | Purpose | Required Role | Request Summary | Response Summary | Key Validation/Errors |
|---|---|---|---|---|---|---|
| GET | `/approvals?status=PENDING` | List pending approval requests (for Manager's dashboard) | Manager, Admin | query: `status` | list of pending approvals with context (`amount_context`, `entity_type`, `requested_by`) | — |
| GET | `/approvals/{id}` | Get a specific approval request's detail | Manager, Admin, (requester Cashier — own request only) | — | approval detail | `404` not found |
| POST | `/approvals/{id}/decision` | Approve or deny a pending request (`W-08`) | Manager, Admin | `decision` (`APPROVE`/`DENY`), `note?` | updated approval + resumed/terminated originating operation | `409` already decided; `403` deciding Manager's own threshold ceiling exceeded (`MA-03`) |

### B13. Inventory

| Method | Endpoint | Purpose | Required Role | Request Summary | Response Summary | Key Validation/Errors |
|---|---|---|---|---|---|---|
| POST | `/products/{id}/stock/add` | Record a manual stock addition/restock (`W-14`) | Inventory Staff, Manager, Admin | `quantity` (positive) | created `stock_movements` row, updated `current_stock` | `400` non-positive quantity |
| POST | `/products/{id}/stock/adjust` | Record a manual stock adjustment (`W-15`) | Inventory Staff, Manager, Admin | `quantity_delta` (signed), `reason` (mandatory) | created `stock_movements` row, updated `current_stock` | `400` missing reason; `409` would drive stock negative (`NS-01`/`NS-02`) |
| GET | `/products/{id}/stock/movements` | Get stock movement history for a product (traceability) | Inventory Staff, Manager, Admin | query: date range | paginated `stock_movements` list | `404` product not found |
| GET | `/inventory/low-stock` | List products at/below their reorder threshold (`W-16`) | Inventory Staff, Manager, Admin | — | list of low-stock products | — |

### B14. Reports

| Method | Endpoint | Purpose | Required Role | Request Summary | Response Summary | Key Validation/Errors |
|---|---|---|---|---|---|---|
| GET | `/reports/sales-summary` | Sales totals by date range/register/cashier/product | Manager, Admin | query filters | aggregated sales figures | — |
| GET | `/reports/cash-reconciliation` | Register session variances over a date range | Manager, Admin | query filters | list of session variances | — |
| GET | `/reports/inventory-status` | Current stock levels + low-stock/out-of-stock summary | Manager, Admin | query filters | inventory status report | — |
| GET | `/reports/returns-refunds` | Return/refund volume and amounts over a period | Manager, Admin | query filters | aggregated return/refund figures | — |

### B15. Audit

| Method | Endpoint | Purpose | Required Role | Request Summary | Response Summary | Key Validation/Errors |
|---|---|---|---|---|---|---|
| GET | `/audit-logs` | Query audit trail by entity/actor/date/action type | Manager (store-scoped), Admin (full) | query: `entity_type`, `entity_id`, `actor_id`, `action_type`, date range | paginated audit log entries | — |
| GET | `/audit-logs/{id}` | Get a single audit log entry's full before/after detail | Manager, Admin | — | full audit entry incl. snapshots | `404` not found |

---

## Closing Notes

**Architecture principles satisfied:**
- Business rules enforced exclusively server-side (A2, A3, A7) — frontend holds no authoritative logic.
- Server-side authorization on every endpoint (A4, A17) — no client-trusted role/permission/threshold values.
- Atomic transactions for all financial/inventory operations (A8, mapped 1:1 to Step 3's transaction boundaries).
- Historical immutability preserved (no PATCH/DELETE endpoints exist for `sale_items` post-completion, `audit_logs`, or completed `sales` beyond status-limited transitions).
- Reliable, transactional audit logging (A10) — every sensitive endpoint's underlying service writes its audit row in the same transaction.
- Inventory race conditions explicitly handled via row-level locking (A11), not left to chance.
- Modular monolith, no microservices (A1) — single deployable unit, in-process module communication.

## Open Questions Before Coding Begins

1. **JWT refresh strategy:** should short-lived access tokens be paired with a refresh-token flow (to avoid frequent re-logins during a shift), or is re-login on expiry acceptable for MVP given shift-length sessions?
2. **Approval hand-off UX mechanism:** this document assumes a Manager is reachable to call `POST /approvals/{id}/decision`, but the actual notification/hand-off mechanism (shared screen, Manager's own device, in-person PIN entry) is a frontend/UX design concern for the next phase — needs a decision before that phase begins.
3. **Card payment gateway selection:** `PaymentGateway` is abstracted here; the actual provider (and its specific ambiguous-response handling contract) is an external integration decision outside this architecture step.
4. **Pagination/filtering conventions:** exact query parameter conventions (cursor vs. offset pagination, standard filter parameter names) should be standardized once implementation begins, for consistency across all list endpoints.
5. **Rate-limiting mechanism:** noted as needed for `/auth/login` (A17) but the specific mechanism/library/threshold is an implementation detail deferred to coding.
6. **Reporting performance at scale:** if transaction volume grows significantly beyond single-store MVP expectations, on-demand aggregate queries (A15) may need read replicas or materialized views — not a concern for initial MVP launch.

---

*This document concludes Step 5 — System Architecture & Backend Design. No implementation code, migrations, frontend screens, or actual API implementations have been created; no microservices architecture was chosen; the Step 4 data model was not redesigned (only the previously open decisions were resolved and reflected here). The next phase should address the Open Questions above where relevant before implementation begins.*
