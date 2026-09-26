# Mizan POS — Data Analytics Case Study

## Executive summary

Mizan POS captures the complete operational lifecycle of a supermarket: register
opening, sales, payments, discounts, inventory movements, returns, refunds, and
cash reconciliation. The analytical objective is to convert those transactions
into reliable measures that help store management improve revenue visibility,
stock availability, cashier control, and refund monitoring.

## Business questions

The reporting layer is designed to answer questions such as:

1. How are net sales, discounts, tax, and transaction volume changing over time?
2. What is the average transaction value, and how does it vary by cashier or
   register?
3. Which products are out of stock or below their reorder threshold?
4. Which register sessions have material cash variances?
5. How much has been refunded, and which refund attempts failed?
6. Which products, users, and operational actions require investigation through
   the audit trail?

## Core KPI definitions

| KPI | Definition | Main source |
| --- | --- | --- |
| Gross subtotal | Sum of completed-sale subtotals before discounts and tax | `sales.subtotal_amount` |
| Discount value | Sum of discounts granted on completed sales | `sales.discount_amount` |
| Net sales | Sum of completed-sale totals | `sales.total_amount` |
| Average transaction value | Net sales divided by completed transaction count | `sales` |
| Tax collected | Sum of tax on completed sales | `sales.tax_amount` |
| Cash variance | Counted cash minus expected cash per closed session | `register_sessions` |
| Low-stock products | Active products with stock above zero and at/below reorder threshold | `products` |
| Out-of-stock products | Active products with zero stock | `products` |
| Refunded amount | Sum of successfully completed refunds | `refunds.amount` |
| Failed refunds | Count of refund records with a failed status | `refunds` |

## Analytical data model

The model uses PostgreSQL as the system of record. `sales` is the transaction
header, while `sale_items` provides product-level detail. Register sessions,
cashiers, products, categories, payments, returns, and refunds provide the main
dimensions and operational context.

Historical accuracy is protected by storing price, tax rate, discount, and line
total snapshots on each sale item. Later catalog changes therefore do not rewrite
past performance. Stock changes are represented as immutable movements rather
than inferred only from the current quantity.

## Data-quality and governance controls

- Versioned SQL migrations make schema changes repeatable and reviewable.
- Foreign keys protect relationships between operational entities.
- Check constraints reject negative amounts, invalid quantities, and unsupported
  workflow statuses.
- Completed sales require timestamps and unique receipt numbers.
- Audit events preserve who performed sensitive business actions.
- Parameterized SQL reduces injection risk and keeps report filters consistent.
- Integration tests run against PostgreSQL and validate the reporting workflow
  using real relational data.

## Implemented reporting views

The application exposes four operational reporting areas:

- **Sales performance:** transaction count, subtotal, discounts, tax, net sales,
  average sale value, and daily trend.
- **Cash reconciliation:** expected cash, counted cash, net variance, and flagged
  sessions above the configured threshold.
- **Inventory health:** total products and units, low-stock products, out-of-stock
  products, and item-level status.
- **Returns and refunds:** return count, successful refunds, refunded value, and
  failed-refund monitoring.

Reports can be filtered by date range and, where relevant, register, cashier,
product, or category. The API implementation is available in
`backend/src/modules/reports/reports.repository.ts`.

## Recommended portfolio presentation

Present this project as a **retail data product and analytical system**, supported
by one dashboard screenshot and a short walkthrough of a decision scenario—for
example, identifying low-stock items while comparing sales and cash variance.
Pair it with a separate analysis-first project built in Power BI, Tableau, Excel,
or Python to demonstrate exploratory analysis, visualization choices, and written
business recommendations in greater depth.
