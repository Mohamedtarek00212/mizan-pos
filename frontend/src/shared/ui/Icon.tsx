import { ReactNode } from 'react';

export type IconName =
  | 'home'
  | 'pos'
  | 'register'
  | 'return'
  | 'inventory'
  | 'product'
  | 'category'
  | 'report'
  | 'audit'
  | 'promotion'
  | 'approval'
  | 'tax'
  | 'user'
  | 'users'
  | 'logout'
  | 'data'
  | 'restore';

const drawings: Record<IconName, ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v10h13V10" /><path d="M9.5 20v-6h5v6" /></>,
  pos: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h2m3 0h2m3 0h.01M7 16h5" /></>,
  register: <><path d="M5 9h14l2 11H3L5 9Z" /><path d="M7 9V4h8l2 5M7 14h10M7 17h3" /></>,
  return: <><path d="m9 7-5 5 5 5" /><path d="M4 12h10a6 6 0 0 1 6 6v1" /></>,
  inventory: <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="m4 7v10l8 4 8-4V7M12 11v10" /></>,
  product: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.5 7.5 4 7.5-4M12 11.5V21" /></>,
  category: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" /><path d="M17 14v6m-3-3h6" /></>,
  report: <><path d="M4 20V10m5 10V4m6 16v-7m5 7V7" /><path d="M3 20h18" /></>,
  audit: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5V3h6v1.5M9 9h6m-6 4h6m-6 4h3" /></>,
  promotion: <><circle cx="8" cy="8" r="2" /><circle cx="16" cy="16" r="2" /><path d="m17.5 5.5-11 13" /></>,
  approval: <><path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
  tax: <><path d="M6 3h10l3 3v15l-3-2-2 2-2-2-2 2-2-2-2 2V3Z" /><path d="M9 8h6m-6 4h6m-6 4h3" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-2a5.5 5.5 0 0 1 11 0v2" /><circle cx="17" cy="9" r="2" /><path d="M16 14a4.5 4.5 0 0 1 4.5 4.5V20" /></>,
  logout: <><path d="M10 4H5v16h5M14 8l4 4-4 4m4-4H9" /></>,
  data: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
  restore: <><path d="M4 7v5h5" /><path d="M5.5 17a8 8 0 1 0 .2-10.2L4 8" /><path d="M12 8v5l3 2" /></>,
};

export function Icon({ name, size = 22 }: { name: IconName; size?: number }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {drawings[name]}
    </svg>
  );
}
