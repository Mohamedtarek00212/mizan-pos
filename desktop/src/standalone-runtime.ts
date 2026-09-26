import { app, utilityProcess, type UtilityProcess } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { Client } from 'pg';

import { writeDesktopLog } from './desktop-logger';

type RuntimeSecrets = { databasePassword: string; jwtSecret: string };
export type RuntimeMode = 'standalone' | 'external';
export type StandaloneRuntimeStatus = {
  mode: RuntimeMode;
  state: 'stopped' | 'starting' | 'ready' | 'failed';
  apiBaseUrl: string | null;
  errorCode?: 'DATABASE_START_FAILED' | 'BACKEND_START_FAILED' | 'RUNTIME_UNAVAILABLE';
};

const DATABASE_USER = 'mizan_app';
const DATABASE_NAME = 'mizan';
const STARTUP_TIMEOUT_MS = 30_000;

let postgres: LocalPostgres | null = null;
let backend: UtilityProcess | null = null;
let activeDatabaseConnection: { port: number; password: string } | null = null;
let status: StandaloneRuntimeStatus = {
  mode: 'external',
  state: 'stopped',
  apiBaseUrl: null,
};

export function configuredRuntimeMode(): RuntimeMode {
  const requested = process.env.MIZAN_RUNTIME_MODE?.toLowerCase();
  if (requested === 'external') return 'external';
  if (requested === 'standalone') return 'standalone';
  return app.isPackaged || process.env.MIZAN_STANDALONE === '1' ? 'standalone' : 'external';
}

export function getStandaloneRuntimeStatus(): StandaloneRuntimeStatus {
  return { ...status };
}

function runtimeDirectory(): string {
  return path.join(app.getPath('userData'), 'runtime');
}

function secretsPath(): string {
  return path.join(runtimeDirectory(), 'runtime-secrets.json');
}

function dataDirectory(): string {
  return path.join(app.getPath('userData'), 'database');
}

function backendEntryPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'backend', 'dist', 'server.js')
    : path.resolve(__dirname, '../runtime/backend/dist/server.js');
}

function postgresBinaryPath(name: 'initdb' | 'postgres' | 'pg_ctl'): string {
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const executable = process.platform === 'win32' ? `${name}.exe` : name;
  const packageDirectory = app.isPackaged
    ? path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        '@embedded-postgres',
        `${platform}-${process.arch}`,
      )
    : path.resolve(__dirname, '..', 'node_modules', '@embedded-postgres', `${platform}-${process.arch}`);
  return path.join(packageDirectory, 'native', 'bin', executable);
}

function runPostgresCommand(executable: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      env: { ...process.env, LC_MESSAGES: 'C' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += String(chunk); });
    child.stderr.on('data', (chunk) => { output += String(chunk); });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`PostgreSQL command failed with code ${code}: ${output.slice(-1_000)}`));
    });
  });
}

class LocalPostgres {
  private process: ChildProcess | null = null;

  constructor(
    private readonly directory: string,
    private readonly port: number,
    private readonly password: string,
  ) {}

  async initialise(): Promise<void> {
    const passwordFile = path.join(runtimeDirectory(), `init-${crypto.randomUUID()}.pw`);
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(passwordFile, `${this.password}\n`, { mode: 0o600 });
    try {
      await runPostgresCommand(postgresBinaryPath('initdb'), [
        `--pgdata=${this.directory}`,
        '--auth=scram-sha-256',
        `--username=${DATABASE_USER}`,
        `--pwfile=${passwordFile}`,
        '--encoding=UTF8',
        '--locale=C',
      ]);
    } finally {
      fs.unlinkSync(passwordFile);
    }
  }

  async start(): Promise<void> {
    const executable = postgresBinaryPath('postgres');
    if (!fs.existsSync(executable)) throw new Error('Embedded PostgreSQL runtime is unavailable');
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let output = '';
      const child = spawn(executable, [
        '-D', this.directory,
        '-p', String(this.port),
        '-h', '127.0.0.1',
      ], {
        env: { ...process.env, LC_MESSAGES: 'C' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.process = child;
      const timeout = setTimeout(() => {
        if (!settled) reject(new Error('Embedded PostgreSQL startup timed out'));
      }, STARTUP_TIMEOUT_MS);
      child.stderr.on('data', (chunk) => {
        const message = String(chunk);
        output += message;
        if (!settled && message.includes('database system is ready to accept connections')) {
          settled = true;
          clearTimeout(timeout);
          resolve();
        }
      });
      child.once('error', (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(error);
        }
      });
      child.once('close', (code) => {
        this.process = null;
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(
            `Embedded PostgreSQL exited during startup with code ${code}: ${output.slice(-1_000)}`,
          ));
        }
      });
    });
  }

  async ensureApplicationDatabase(): Promise<void> {
    const client = new Client({
      host: '127.0.0.1',
      port: this.port,
      user: DATABASE_USER,
      password: this.password,
      database: 'postgres',
    });
    await client.connect();
    try {
      const result = await client.query<{ exists: boolean }>(
        'SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists',
        [DATABASE_NAME],
      );
      if (!result.rows[0]?.exists) {
        await client.query(`CREATE DATABASE ${client.escapeIdentifier(DATABASE_NAME)}`);
      }
    } finally {
      await client.end();
    }
  }

  async stop(): Promise<void> {
    if (!this.process) return;
    try {
      await runPostgresCommand(postgresBinaryPath('pg_ctl'), [
        'stop', '-D', this.directory, '-m', 'fast', '-w', '-t', '10',
      ]);
    } finally {
      this.process?.kill();
      this.process = null;
    }
  }
}

function readOrCreateSecrets(): RuntimeSecrets {
  const destination = secretsPath();
  const databaseExists = fs.existsSync(path.join(dataDirectory(), 'PG_VERSION'));
  try {
    const parsed = JSON.parse(fs.readFileSync(destination, 'utf8')) as Partial<RuntimeSecrets>;
    if (
      typeof parsed.databasePassword === 'string' && parsed.databasePassword.length >= 32 &&
      typeof parsed.jwtSecret === 'string' && parsed.jwtSecret.length >= 32
    ) {
      return parsed as RuntimeSecrets;
    }
    throw new Error('Runtime secrets file is invalid');
  } catch (error) {
    if (databaseExists || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const secrets: RuntimeSecrets = {
    databasePassword: crypto.randomBytes(32).toString('base64url'),
    jwtSecret: crypto.randomBytes(48).toString('base64url'),
  };
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(secrets), { mode: 0o600 });
  fs.renameSync(temporary, destination);
  return secrets;
}

export async function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not reserve a loopback port'));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForBackend(apiBaseUrl: string, child: UtilityProcess): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let exited = false;
  child.once('exit', () => { exited = true; });
  while (Date.now() < deadline) {
    if (exited) throw new Error('Backend process exited during startup');
    try {
      const response = await fetch(`${apiBaseUrl}/health/ready`, {
        signal: AbortSignal.timeout(1_500),
      });
      if (response.ok) return;
    } catch {
      // The service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Backend readiness timed out');
}

export async function startStandaloneRuntime(): Promise<StandaloneRuntimeStatus> {
  const mode = configuredRuntimeMode();
  status = { mode, state: mode === 'standalone' ? 'starting' : 'stopped', apiBaseUrl: null };
  if (mode === 'external') return getStandaloneRuntimeStatus();

  const secrets = readOrCreateSecrets();
  const databasePort = await reserveLoopbackPort();
  const backendPort = await reserveLoopbackPort();
  const databaseUrl = `postgres://${DATABASE_USER}:${encodeURIComponent(secrets.databasePassword)}` +
    `@127.0.0.1:${databasePort}/${DATABASE_NAME}`;
  activeDatabaseConnection = { port: databasePort, password: secrets.databasePassword };

  try {
    postgres = new LocalPostgres(dataDirectory(), databasePort, secrets.databasePassword);
    if (!fs.existsSync(path.join(dataDirectory(), 'PG_VERSION'))) await postgres.initialise();
    await postgres.start();
    await postgres.ensureApplicationDatabase();
  } catch (error) {
    writeDesktopLog('error', 'standalone_database_start_failed', error);
    await stopStandaloneRuntime();
    status = { mode, state: 'failed', apiBaseUrl: null, errorCode: 'DATABASE_START_FAILED' };
    return getStandaloneRuntimeStatus();
  }

  try {
    const apiBaseUrl = `http://127.0.0.1:${backendPort}/api`;
    const entry = backendEntryPath();
    if (!fs.existsSync(entry)) throw new Error('Packaged backend entry is missing');
    backend = utilityProcess.fork(entry, [], {
      cwd: path.dirname(entry),
      serviceName: 'Mizan Local API',
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: String(backendPort),
        DATABASE_URL: databaseUrl,
        DB_POOL_MAX: '10',
        JWT_SECRET: secrets.jwtSecret,
        JWT_EXPIRES_IN: '8h',
        CORS_ORIGIN: 'mizan://app,http://localhost:5174,http://127.0.0.1:5174',
        LOG_LEVEL: 'info',
        TRUST_PROXY: 'false',
        RUN_MIGRATIONS_ON_START: 'true',
        MIGRATIONS_DIR: app.isPackaged
          ? path.join(process.resourcesPath, 'backend', 'migrations')
          : path.resolve(__dirname, '../runtime/backend/migrations'),
      },
    });
    backend.stdout?.on('data', (chunk) => {
      const message = String(chunk).trim();
      if (message) writeDesktopLog('info', 'standalone_backend_output', message);
    });
    backend.stderr?.on('data', (chunk) => {
      const message = String(chunk).trim();
      if (message) writeDesktopLog('error', 'standalone_backend_output', message);
    });
    backend.once('exit', (code) => {
      writeDesktopLog(code === 0 ? 'info' : 'error', 'standalone_backend_process_exit', { code });
      if (status.state === 'ready') {
        status = { mode, state: 'failed', apiBaseUrl: null, errorCode: 'BACKEND_START_FAILED' };
        writeDesktopLog('error', 'standalone_backend_exited', { code });
      }
    });
    await waitForBackend(apiBaseUrl, backend);
    status = { mode, state: 'ready', apiBaseUrl };
    writeDesktopLog('info', 'standalone_runtime_ready', { databasePort, backendPort });
    return getStandaloneRuntimeStatus();
  } catch (error) {
    writeDesktopLog('error', 'standalone_backend_start_failed', error);
    await stopStandaloneRuntime();
    status = { mode, state: 'failed', apiBaseUrl: null, errorCode: 'BACKEND_START_FAILED' };
    return getStandaloneRuntimeStatus();
  }
}

export async function stopStandaloneRuntime(): Promise<void> {
  const activeBackend = backend;
  const activePostgres = postgres;
  backend = null;
  postgres = null;
  activeDatabaseConnection = null;
  status = { mode: configuredRuntimeMode(), state: 'stopped', apiBaseUrl: null };
  activeBackend?.kill();
  if (activePostgres) {
    await activePostgres.stop().catch((error) => {
      writeDesktopLog('error', 'standalone_database_stop_failed', error);
    });
  }
}

export async function simulatePreviousSchemaForTest(): Promise<void> {
  if (process.env.MIZAN_STANDALONE_SELF_TEST !== '1' || !activeDatabaseConnection) {
    throw new Error('Previous-schema simulation is restricted to the standalone self-test');
  }
  const client = new Client({
    host: '127.0.0.1',
    port: activeDatabaseConnection.port,
    user: DATABASE_USER,
    password: activeDatabaseConnection.password,
    database: DATABASE_NAME,
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS store_settings');
    await client.query('DELETE FROM schema_migrations WHERE filename = $1', [
      '0020_create_store_settings.sql',
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
