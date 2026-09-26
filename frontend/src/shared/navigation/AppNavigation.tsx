import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Role, useAuth } from '../auth/AuthContext';
import mizanLogoMark from '../../assets/brand/mizan-logo-mark.png';
import { Icon, IconName } from '../ui/Icon';

interface NavItem { to: string; label: string; icon: IconName; roles: Role[]; }

const operations: NavItem[] = [
  { to: '/', label: 'nav.home', icon: 'home', roles: ['CASHIER', 'MANAGER', 'INVENTORY_STAFF', 'ADMIN'] },
  { to: '/pos', label: 'dashboard.posLink', icon: 'pos', roles: ['CASHIER', 'MANAGER', 'ADMIN'] },
  { to: '/registers', label: 'dashboard.registersLink', icon: 'register', roles: ['CASHIER', 'MANAGER', 'ADMIN'] },
  { to: '/returns', label: 'dashboard.returnsLink', icon: 'return', roles: ['CASHIER', 'MANAGER', 'ADMIN'] },
];
const inventory: NavItem[] = [
  { to: '/inventory', label: 'dashboard.inventoryLink', icon: 'inventory', roles: ['INVENTORY_STAFF', 'MANAGER', 'ADMIN'] },
  { to: '/products', label: 'dashboard.productsLink', icon: 'product', roles: ['INVENTORY_STAFF', 'MANAGER', 'ADMIN'] },
  { to: '/categories', label: 'dashboard.categoriesLink', icon: 'category', roles: ['INVENTORY_STAFF', 'MANAGER', 'ADMIN'] },
];
const management: NavItem[] = [
  { to: '/reports', label: 'dashboard.reportsLink', icon: 'report', roles: ['MANAGER', 'ADMIN'] },
  { to: '/audit-logs', label: 'dashboard.auditLink', icon: 'audit', roles: ['MANAGER', 'ADMIN'] },
  { to: '/promotions', label: 'dashboard.promotionsLink', icon: 'promotion', roles: ['MANAGER', 'ADMIN'] },
  { to: '/approvals', label: 'dashboard.approvalsLink', icon: 'approval', roles: ['MANAGER', 'ADMIN'] },
  { to: '/tax-config', label: 'dashboard.taxConfigLink', icon: 'tax', roles: ['MANAGER', 'ADMIN'] },
  { to: '/users', label: 'dashboard.manageUsersLink', icon: 'users', roles: ['MANAGER', 'ADMIN'] },
  { to: '/data-management', label: 'dashboard.dataManagementLink', icon: 'data', roles: ['ADMIN'] },
];

export function AppNavigation(): JSX.Element | null {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  if (!user) return null;

  const group = (title: string, items: NavItem[]) => {
    const visible = items.filter((item) => item.roles.includes(user.role));
    if (!visible.length) return null;
    return <div className="nav-group">
      <div className="nav-group__title">{t(title)}</div>
      {visible.map((item) => <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}>
        <span className="nav-item__icon"><Icon name={item.icon} size={19} /></span><span>{t(item.label)}</span>
      </NavLink>)}
    </div>;
  };

  return <aside className="app-nav">
    <NavLink className="brand" to="/">
      <span className="brand__mark"><img src={mizanLogoMark} alt="" /></span>
      <span><strong>{t('brand.name')}</strong><small>{t('brand.tagline')}</small></span>
    </NavLink>
    <nav aria-label={t('nav.main')} className="app-nav__links">
      {group('nav.operations', operations)}
      {group('nav.inventory', inventory)}
      {group('nav.management', management)}
    </nav>
    <div className="nav-user">
      <span className="nav-user__avatar"><Icon name="user" size={20} /></span>
      <span className="nav-user__identity"><strong>{user.fullName}</strong><small>{t(`roles.${user.role}`)}</small></span>
      <button className="app-nav__logout" onClick={logout} aria-label={t('dashboard.logout')}><Icon name="logout" size={18} /></button>
    </div>
  </aside>;
}
