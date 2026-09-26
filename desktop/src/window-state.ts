import { app, screen, type BrowserWindow, type Rectangle } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

interface PersistedWindowState extends Rectangle {
  isMaximized: boolean;
}

const DEFAULT_BOUNDS: Rectangle = {
  x: 80,
  y: 80,
  width: 1440,
  height: 900,
};

function stateFilePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function isVisibleOnAConnectedDisplay(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea }) => {
    const horizontalOverlap =
      Math.min(bounds.x + bounds.width, workArea.x + workArea.width) -
      Math.max(bounds.x, workArea.x);
    const verticalOverlap =
      Math.min(bounds.y + bounds.height, workArea.y + workArea.height) -
      Math.max(bounds.y, workArea.y);

    return horizontalOverlap >= 160 && verticalOverlap >= 120;
  });
}

export function readWindowState(): PersistedWindowState {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFilePath(), 'utf8')) as Partial<PersistedWindowState>;
    const candidate: PersistedWindowState = {
      x: Number(parsed.x),
      y: Number(parsed.y),
      width: Math.max(1024, Number(parsed.width)),
      height: Math.max(700, Number(parsed.height)),
      isMaximized: parsed.isMaximized === true,
    };

    const hasFiniteBounds = [candidate.x, candidate.y, candidate.width, candidate.height].every(
      (value) => Number.isFinite(value),
    );
    if (hasFiniteBounds && isVisibleOnAConnectedDisplay(candidate)) {
      return candidate;
    }
  } catch {
    // A missing or invalid state file should never prevent the POS from starting.
  }

  const workArea = screen.getPrimaryDisplay().workArea;
  return {
    ...DEFAULT_BOUNDS,
    x: workArea.x + Math.max(0, Math.round((workArea.width - DEFAULT_BOUNDS.width) / 2)),
    y: workArea.y + Math.max(0, Math.round((workArea.height - DEFAULT_BOUNDS.height) / 2)),
    width: Math.min(DEFAULT_BOUNDS.width, workArea.width),
    height: Math.min(DEFAULT_BOUNDS.height, workArea.height),
    isMaximized: false,
  };
}

export function persistWindowState(window: BrowserWindow): void {
  const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds();
  const state: PersistedWindowState = {
    ...bounds,
    isMaximized: window.isMaximized(),
  };
  const destination = stateFilePath();
  const temporary = `${destination}.tmp`;

  try {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, destination);
  } catch (error) {
    console.error('Could not persist the desktop window state.', error);
  }
}
