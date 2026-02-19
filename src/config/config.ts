/**
 * Configuration loaded from environment variables.
 * Never hardcode secrets.
 */

const UPS_AUTH_URL = 'https://onlinetools.ups.com/security/v1/oauth/token';
const UPS_RATE_URL = 'https://onlinetools.ups.com/api/rating/v2409/Rate';
const DEFAULT_HTTP_TIMEOUT_MS = 15_000;

export interface UpsConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  rateUrl: string;
}

export interface HttpConfig {
  timeoutMs: number;
}

export interface Config {
  ups: UpsConfig;
  http: HttpConfig;
}

function getEnv(name: string, defaultValue?: string): string {
  const value = process.env[name] ?? defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Provide it or use stub defaults.`);
  }
  return value;
}

function getEnvOptional(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

function getEnvNumber(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return defaultValue;
  return n;
}

export function loadConfig(): Config {
  const upsClientId = getEnvOptional('UPS_CLIENT_ID', 'stub_client_id');
  const upsClientSecret = getEnvOptional('UPS_CLIENT_SECRET', 'stub_client_secret');

  return {
    ups: {
      clientId: upsClientId,
      clientSecret: upsClientSecret,
      authUrl: getEnvOptional('UPS_AUTH_URL', UPS_AUTH_URL),
      rateUrl: getEnvOptional('UPS_RATE_URL', UPS_RATE_URL),
    },
    http: {
      timeoutMs: getEnvNumber('HTTP_TIMEOUT_MS', DEFAULT_HTTP_TIMEOUT_MS),
    },
  };
}
