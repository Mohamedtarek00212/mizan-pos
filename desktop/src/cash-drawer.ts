import net from 'node:net';

export type CashDrawerResult = {
  ok: boolean;
  error?: 'NOT_CONFIGURED' | 'CONNECTION_FAILED' | 'TIMEOUT';
};

const DEFAULT_PRINTER_PORT = 9100;
const CONNECTION_TIMEOUT_MS = 2_000;

/**
 * Sends the standard ESC/POS drawer-kick pulse to a network receipt printer.
 * Most RJ11/RJ12 drawers are driven by the printer rather than by the computer.
 */
export function pulseCashDrawer(): Promise<CashDrawerResult> {
  const host = process.env.MIZAN_CASH_DRAWER_HOST?.trim();
  if (!host) return Promise.resolve({ ok: false, error: 'NOT_CONFIGURED' });

  const parsedPort = Number(process.env.MIZAN_CASH_DRAWER_PORT ?? DEFAULT_PRINTER_PORT);
  const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65_535
    ? parsedPort
    : DEFAULT_PRINTER_PORT;
  const pin = process.env.MIZAN_CASH_DRAWER_PIN === '1' ? 1 : 0;
  const pulse = Buffer.from([0x1b, 0x70, pin, 0x19, 0xfa]);

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (result: CashDrawerResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(CONNECTION_TIMEOUT_MS);
    socket.once('connect', () => {
      socket.end(pulse, () => finish({ ok: true }));
    });
    socket.once('timeout', () => finish({ ok: false, error: 'TIMEOUT' }));
    socket.once('error', () => finish({ ok: false, error: 'CONNECTION_FAILED' }));
  });
}
