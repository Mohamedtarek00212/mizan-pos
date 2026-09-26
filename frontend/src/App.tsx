import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { CategoriesPage } from './features/catalog/CategoriesPage';
import { ProductFormPage } from './features/catalog/ProductFormPage';
import { ProductsPage } from './features/catalog/ProductsPage';
import { TaxConfigPage } from './features/catalog/TaxConfigPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { LoginPage } from './features/auth/LoginPage';
import { PosPage } from './features/pos/PosPage';
import { ReceiptPage } from './features/pos/ReceiptPage';
import { OpenRegisterPage } from './features/registers/OpenRegisterPage';
import { RegisterSessionPage } from './features/registers/RegisterSessionPage';
import { RegistersPage } from './features/registers/RegistersPage';
import { UsersPage } from './features/users/UsersPage';
import { PromotionsPage } from './features/promotions/PromotionsPage';
import { ApprovalsPage } from './features/approvals/ApprovalsPage';
import { ReturnsPage } from './features/returns/ReturnsPage';
import { ReturnDetailPage } from './features/returns/ReturnDetailPage';
import { InventoryPage } from './features/inventory/InventoryPage';
import { LowStockPage } from './features/inventory/LowStockPage';
import { StockAdjustmentPage } from './features/inventory/StockAdjustmentPage';
import { StockMovementsPage } from './features/inventory/StockMovementsPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { AuditLogsPage } from './features/audit/AuditLogsPage';
import { LanguageSwitcher } from './i18n/LanguageSwitcher';
import { AuthProvider } from './shared/auth/AuthContext';
import { RequireAuth } from './shared/auth/RequireAuth';
import { RequireRole } from './shared/auth/RequireRole';
import { AppNavigation } from './shared/navigation/AppNavigation';
import { DesktopConnectionGate } from './shared/desktop/DesktopConnectionGate';
import { DesktopNavigationBridge } from './shared/desktop/DesktopNavigationBridge';
import { StoreInitializationGate } from './features/setup/StoreInitializationGate';
import { DataManagementPage } from './features/setup/DataManagementPage';

/**
 * App shell and role-gated route table. Additional routes are registered here
 * as each feature phase is implemented (see Step 6 §2 for the target map).
 */
export function App(): JSX.Element {
  return (
    <DesktopConnectionGate>
      <StoreInitializationGate>
      <AuthProvider>
        <BrowserRouter>
        <DesktopNavigationBridge />
        <div className="app-shell">
          <AppNavigation />
          <section className="app-stage">
            <LanguageSwitcher />
            <main className="app-main">
              <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/users"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['MANAGER', 'ADMIN']}>
                  <UsersPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/data-management"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['ADMIN']}>
                  <DataManagementPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/categories"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['INVENTORY_STAFF', 'MANAGER', 'ADMIN']}>
                  <CategoriesPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/products"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['INVENTORY_STAFF', 'MANAGER', 'ADMIN']}>
                  <ProductsPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/products/new"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['INVENTORY_STAFF', 'MANAGER', 'ADMIN']}>
                  <ProductFormPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/products/:id"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['INVENTORY_STAFF', 'MANAGER', 'ADMIN']}>
                  <ProductFormPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/tax-config"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['MANAGER', 'ADMIN']}>
                  <TaxConfigPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/promotions"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['MANAGER', 'ADMIN']}>
                  <PromotionsPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/approvals"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['MANAGER', 'ADMIN']}>
                  <ApprovalsPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/returns"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['CASHIER', 'MANAGER', 'ADMIN']}>
                  <ReturnsPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/returns/:id"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['CASHIER', 'MANAGER', 'ADMIN']}>
                  <ReturnDetailPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/inventory"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['INVENTORY_STAFF', 'MANAGER', 'ADMIN']}>
                  <InventoryPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/inventory/low-stock"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['INVENTORY_STAFF', 'MANAGER', 'ADMIN']}>
                  <LowStockPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/inventory/adjust/:productId"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['INVENTORY_STAFF', 'MANAGER', 'ADMIN']}>
                  <StockAdjustmentPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/inventory/movements/:productId"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['INVENTORY_STAFF', 'MANAGER', 'ADMIN']}>
                  <StockMovementsPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/reports"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['MANAGER', 'ADMIN']}>
                  <ReportsPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/audit-logs"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['MANAGER', 'ADMIN']}>
                  <AuditLogsPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/registers"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['CASHIER', 'MANAGER', 'ADMIN']}>
                  <RegistersPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/registers/:id/open"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['CASHIER']}>
                  <OpenRegisterPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/registers/:id/session"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['CASHIER', 'MANAGER', 'ADMIN']}>
                  <RegisterSessionPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/pos"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['CASHIER', 'MANAGER', 'ADMIN']}>
                  <PosPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/pos/receipt/:saleId"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['CASHIER', 'MANAGER', 'ADMIN']}>
                  <ReceiptPage />
                </RequireRole>
              </RequireAuth>
            }
          />
              </Routes>
            </main>
          </section>
        </div>
        </BrowserRouter>
      </AuthProvider>
      </StoreInitializationGate>
    </DesktopConnectionGate>
  );
}
