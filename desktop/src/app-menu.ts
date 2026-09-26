import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';

import { DESKTOP_CHANNELS } from './contracts';

type WindowProvider = () => BrowserWindow | null;

export function installApplicationMenu(
  getMainWindow: WindowProvider,
  checkForUpdates: () => void,
): void {
  const navigate = (path: string) => {
    const window = getMainWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send(DESKTOP_CHANNELS.navigate, path);
      window.show();
      window.focus();
    }
  };

  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' as const, label: 'About Mizan POS | عن ميزان' },
            { type: 'separator' as const },
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
            { role: 'quit' as const, label: 'Quit Mizan POS | إنهاء ميزان' },
          ],
        }]
      : []),
    {
      label: 'Navigate | التنقل',
      submenu: [
        { label: 'Overview | نظرة عامة', accelerator: 'CmdOrCtrl+1', click: () => navigate('/') },
        { label: 'Point of Sale | نقطة البيع', accelerator: 'CmdOrCtrl+2', click: () => navigate('/pos') },
        { label: 'Registers | الخزائن', accelerator: 'CmdOrCtrl+3', click: () => navigate('/registers') },
        { label: 'Inventory | المخزون', accelerator: 'CmdOrCtrl+4', click: () => navigate('/inventory') },
        { label: 'Reports | التقارير', accelerator: 'CmdOrCtrl+5', click: () => navigate('/reports') },
      ],
    },
    {
      label: 'View | عرض',
      submenu: [
        { role: 'reload', label: 'Reload | إعادة تحميل' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' as const }]),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window | النافذة',
      role: 'windowMenu',
      submenu: [
        { role: 'minimize', label: 'Minimize | تصغير' },
        { role: 'zoom', label: 'Zoom | تكبير' },
        ...(process.platform === 'darwin'
          ? [{ type: 'separator' as const }, { role: 'front' as const }]
          : [{ role: 'close' as const, label: 'Close | إغلاق' }]),
      ],
    },
    {
      label: 'Help | المساعدة',
      submenu: [
        {
          label: 'Check for Updates… | البحث عن تحديثات…',
          click: checkForUpdates,
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
