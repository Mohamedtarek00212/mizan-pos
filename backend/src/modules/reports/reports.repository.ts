import { pool } from '../../db/pool';
import { ReportFilters } from './reports.types';

function conditions(
  filters: ReportFilters,
  dateColumn: string,
  aliases = { register: 'r', cashier: 'u' },
) {
  const values: unknown[] = [];
  const clauses: string[] = [];
  const add = (value: unknown, sql: (placeholder: string) => string) => {
    values.push(value);
    clauses.push(sql(`$${values.length}`));
  };
  if (filters.from) add(filters.from, (p) => `${dateColumn} >= ${p}`);
  if (filters.to) add(filters.to, (p) => `${dateColumn} <= ${p}`);
  if (filters.registerId) add(filters.registerId, (p) => `${aliases.register}.id = ${p}`);
  if (filters.cashierId) add(filters.cashierId, (p) => `${aliases.cashier}.id = ${p}`);
  return { values, clauses };
}

export const reportsRepository = {
  async salesSummary(filters: ReportFilters) {
    const query = conditions(filters, 's.completed_at');
    query.clauses.unshift(`s.status = 'COMPLETED'`);
    if (filters.productId) {
      query.values.push(filters.productId);
      query.clauses.push(
        `EXISTS (SELECT 1 FROM sale_items psi WHERE psi.sale_id = s.id AND psi.product_id = $${query.values.length})`,
      );
    }
    const where = `WHERE ${query.clauses.join(' AND ')}`;
    const [summary, rows] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS sale_count,
                COALESCE(SUM(s.subtotal_amount), 0)::numeric AS subtotal,
                COALESCE(SUM(s.discount_amount), 0)::numeric AS discounts,
                COALESCE(SUM(s.tax_amount), 0)::numeric AS tax,
                COALESCE(SUM(s.total_amount), 0)::numeric AS total,
                COALESCE(AVG(s.total_amount), 0)::numeric AS average_sale
           FROM sales s
           JOIN register_sessions rs ON rs.id = s.register_session_id
           JOIN registers r ON r.id = rs.register_id
           JOIN users u ON u.id = s.cashier_id ${where}`,
        query.values,
      ),
      pool.query(
        `SELECT s.completed_at::date AS date, COUNT(*)::int AS sale_count,
                COALESCE(SUM(s.total_amount), 0)::numeric AS total,
                COALESCE(SUM(s.discount_amount), 0)::numeric AS discounts,
                COALESCE(SUM(s.tax_amount), 0)::numeric AS tax
           FROM sales s
           JOIN register_sessions rs ON rs.id = s.register_session_id
           JOIN registers r ON r.id = rs.register_id
           JOIN users u ON u.id = s.cashier_id ${where}
          GROUP BY s.completed_at::date ORDER BY date DESC`,
        query.values,
      ),
    ]);
    return { summary: summary.rows[0], rows: rows.rows };
  },

  async cashReconciliation(filters: ReportFilters) {
    const query = conditions(filters, 'rs.closed_at');
    query.clauses.unshift(`rs.status = 'CLOSED'`);
    const where = `WHERE ${query.clauses.join(' AND ')}`;
    const [summary, rows] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS session_count,
                COALESCE(SUM(rs.expected_cash), 0)::numeric AS expected_cash,
                COALESCE(SUM(rs.counted_cash), 0)::numeric AS counted_cash,
                COALESCE(SUM(rs.variance), 0)::numeric AS net_variance,
                COUNT(*) FILTER (WHERE ABS(rs.variance) > COALESCE(rs.variance_threshold_snapshot, 0))::int AS flagged_count
           FROM register_sessions rs JOIN registers r ON r.id = rs.register_id
           JOIN users u ON u.id = rs.cashier_id ${where}`,
        query.values,
      ),
      pool.query(
        `SELECT rs.id, r.code AS register_code, u.full_name AS cashier_name,
                rs.opened_at, rs.closed_at, rs.expected_cash, rs.counted_cash,
                rs.variance, rs.variance_threshold_snapshot,
                (ABS(rs.variance) > COALESCE(rs.variance_threshold_snapshot, 0)) AS flagged
           FROM register_sessions rs JOIN registers r ON r.id = rs.register_id
           JOIN users u ON u.id = rs.cashier_id ${where}
          ORDER BY rs.closed_at DESC`,
        query.values,
      ),
    ]);
    return { summary: summary.rows[0], rows: rows.rows };
  },

  async inventoryStatus(filters: ReportFilters) {
    const values: unknown[] = [];
    const clauses = ['p.is_active = true'];
    if (filters.productId) {
      values.push(filters.productId);
      clauses.push(`p.id = $${values.length}`);
    }
    if (filters.categoryId) {
      values.push(filters.categoryId);
      clauses.push(`p.category_id = $${values.length}`);
    }
    const where = `WHERE ${clauses.join(' AND ')}`;
    const [summary, rows] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS product_count,
                COALESCE(SUM(p.current_stock), 0)::int AS total_units,
                COUNT(*) FILTER (WHERE p.current_stock = 0)::int AS out_count,
                COUNT(*) FILTER (WHERE p.current_stock > 0 AND p.current_stock <= p.reorder_threshold)::int AS low_count
           FROM products p ${where}`,
        values,
      ),
      pool.query(
        `SELECT p.id, p.sku, p.name, c.name AS category_name, p.current_stock,
                p.reorder_threshold,
                CASE WHEN p.current_stock = 0 THEN 'OUT'
                     WHEN p.current_stock <= p.reorder_threshold THEN 'LOW' ELSE 'OK' END AS stock_status
           FROM products p JOIN categories c ON c.id = p.category_id ${where}
          ORDER BY (p.current_stock = 0) DESC,
                   (p.current_stock <= p.reorder_threshold) DESC, p.name`,
        values,
      ),
    ]);
    return { summary: summary.rows[0], rows: rows.rows };
  },

  async returnsRefunds(filters: ReportFilters) {
    const query = conditions(filters, 'ret.requested_at', { register: 'reg', cashier: 'u' });
    if (filters.productId) {
      query.values.push(filters.productId);
      query.clauses.push(
        `EXISTS (SELECT 1 FROM return_items pri WHERE pri.return_id = ret.id AND pri.product_id = $${query.values.length})`,
      );
    }
    const where = query.clauses.length ? `WHERE ${query.clauses.join(' AND ')}` : '';
    const joins = `FROM returns ret
      LEFT JOIN register_sessions rs ON rs.id = ret.register_session_id
      LEFT JOIN registers reg ON reg.id = rs.register_id
      JOIN users u ON u.id = ret.requested_by`;
    const [summary, rows] = await Promise.all([
      pool.query(
        `SELECT COUNT(DISTINCT ret.id)::int AS return_count,
                COUNT(DISTINCT ret.id) FILTER (WHERE ret.status = 'REFUNDED')::int AS refunded_count,
                COALESCE(SUM(ref.amount) FILTER (WHERE ref.status = 'COMPLETED'), 0)::numeric AS refunded_amount,
                COUNT(ref.id) FILTER (WHERE ref.status = 'FAILED')::int AS failed_refund_count
           ${joins} LEFT JOIN refunds ref ON ref.return_id = ret.id ${where}`,
        query.values,
      ),
      pool.query(
        `SELECT ret.id, ret.status, ret.reason, ret.requested_at, u.full_name AS requested_by_name,
                reg.code AS register_code,
                COALESCE(SUM(ref.amount) FILTER (WHERE ref.status = 'COMPLETED'), 0)::numeric AS refunded_amount,
                COUNT(ref.id) FILTER (WHERE ref.status = 'FAILED')::int AS failed_refund_count
           ${joins} LEFT JOIN refunds ref ON ref.return_id = ret.id ${where}
          GROUP BY ret.id, u.full_name, reg.code ORDER BY ret.requested_at DESC`,
        query.values,
      ),
    ]);
    return { summary: summary.rows[0], rows: rows.rows };
  },
};
