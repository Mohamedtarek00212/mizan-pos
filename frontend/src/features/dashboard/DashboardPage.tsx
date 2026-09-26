import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Role, useAuth } from '../../shared/auth/AuthContext';
import pointOfSaleVisual from '../../assets/dashboard/point-of-sale.png';
import cashRegisterVisual from '../../assets/dashboard/cash-register-mint.png';
import returnsVisual from '../../assets/dashboard/returns-refunds.png';
import inventoryVisual from '../../assets/dashboard/inventory.png';
import productsVisual from '../../assets/dashboard/products.png';
import categoriesVisual from '../../assets/dashboard/categories.png';
import reportsVisual from '../../assets/dashboard/reports.png';
import auditVisual from '../../assets/dashboard/audit-log.png';
import promotionsVisual from '../../assets/dashboard/promotions.png';
import approvalsVisual from '../../assets/dashboard/manager-approvals.png';
import taxVisual from '../../assets/dashboard/tax-settings.png';
import usersVisual from '../../assets/dashboard/users-management.png';

interface Module {
  to: string;
  label: string;
  description: string;
  visual: string;
  roles: Role[];
}

const operationModules: Module[] = [
  { to: '/pos', label: 'dashboard.posLink', description: 'dashboard.moduleDescriptions.pos', visual: pointOfSaleVisual, roles: ['CASHIER', 'MANAGER', 'ADMIN'] },
  { to: '/registers', label: 'dashboard.registersLink', description: 'dashboard.moduleDescriptions.registers', visual: cashRegisterVisual, roles: ['CASHIER', 'MANAGER', 'ADMIN'] },
  { to: '/returns', label: 'dashboard.returnsLink', description: 'dashboard.moduleDescriptions.returns', visual: returnsVisual, roles: ['CASHIER', 'MANAGER', 'ADMIN'] },
];

const inventoryModules: Module[] = [
  { to: '/inventory', label: 'dashboard.inventoryLink', description: 'dashboard.moduleDescriptions.inventory', visual: inventoryVisual, roles: ['INVENTORY_STAFF', 'MANAGER', 'ADMIN'] },
  { to: '/products', label: 'dashboard.productsLink', description: 'dashboard.moduleDescriptions.products', visual: productsVisual, roles: ['INVENTORY_STAFF', 'MANAGER', 'ADMIN'] },
  { to: '/categories', label: 'dashboard.categoriesLink', description: 'dashboard.moduleDescriptions.categories', visual: categoriesVisual, roles: ['INVENTORY_STAFF', 'MANAGER', 'ADMIN'] },
];

const managementModules: Module[] = [
  { to: '/reports', label: 'dashboard.reportsLink', description: 'dashboard.moduleDescriptions.reports', visual: reportsVisual, roles: ['MANAGER', 'ADMIN'] },
  { to: '/audit-logs', label: 'dashboard.auditLink', description: 'dashboard.moduleDescriptions.audit', visual: auditVisual, roles: ['MANAGER', 'ADMIN'] },
  { to: '/promotions', label: 'dashboard.promotionsLink', description: 'dashboard.moduleDescriptions.promotions', visual: promotionsVisual, roles: ['MANAGER', 'ADMIN'] },
  { to: '/approvals', label: 'dashboard.approvalsLink', description: 'dashboard.moduleDescriptions.approvals', visual: approvalsVisual, roles: ['MANAGER', 'ADMIN'] },
  { to: '/tax-config', label: 'dashboard.taxConfigLink', description: 'dashboard.moduleDescriptions.tax', visual: taxVisual, roles: ['MANAGER', 'ADMIN'] },
  { to: '/users', label: 'dashboard.manageUsersLink', description: 'dashboard.moduleDescriptions.users', visual: usersVisual, roles: ['MANAGER', 'ADMIN'] },
];

export function DashboardPage(): JSX.Element {
  const { t } = useTranslation();
  const { user } = useAuth();

  const renderSection = (title: string, modules: Module[]) => {
    const visible = modules.filter((module) => user && module.roles.includes(user.role));
    if (!visible.length) return null;

    return (
      <section>
        <h2 className="dashboard__section-title">{t(title)}</h2>
        <div className="module-grid">
          {visible.map((module) => (
            <Link className="module-card" to={module.to} key={module.to}>
              <img className="module-card__visual" src={module.visual} alt="" />
              <strong>{t(module.label)}</strong>
              <small>{t(module.description)}</small>
              <span className="module-card__arrow" aria-hidden="true">←</span>
            </Link>
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="dashboard">
      <header className="dashboard__hero">
        <div className="dashboard__hero-copy">
          <span className="dashboard__eyebrow">{t('dashboard.eyebrow')}</span>
          <h1>{t('dashboard.welcome', { name: user?.fullName })}</h1>
        </div>
      </header>
      {renderSection('dashboard.sections.operations', operationModules)}
      {renderSection('dashboard.sections.inventory', inventoryModules)}
      {renderSection('dashboard.sections.management', managementModules)}
    </div>
  );
}
