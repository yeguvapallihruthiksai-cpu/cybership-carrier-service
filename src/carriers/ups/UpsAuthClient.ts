import axios, { AxiosInstance } from 'axios';
import type { UpsConfig } from '../../config/config';
import type { UpsOAuthResponse } from './ups.types';
import {
  createAuthFailure,
  createNetworkError,
  createTimeoutError,
  type CarrierServiceError,
} from '../../domain/errors';

const BUFFER_SECONDS = 60;

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

export class UpsAuthClient {
  private readonly client: AxiosInstance;
  private readonly config: UpsConfig;
  private cachedToken: CachedToken | null = null;

  constructor(config: UpsConfig, timeoutMs: number) {
    this.config = config;
    this.client = axios.create({
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }

  private isTokenValid(token: CachedToken): boolean {
    return Date.now() < token.expiresAt - BUFFER_SECONDS * 1000;
  }

  async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.isTokenValid(this.cachedToken)) {
      return this.cachedToken.accessToken;
    }
    const fresh = await this.acquireToken();
    this.cachedToken = fresh;
    return fresh.accessToken;
  }

  private async acquireToken(): Promise<CachedToken> {
    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
      'utf-8'
    ).toString('base64');

    try {
      const response = await this.client.post<UpsOAuthResponse>(
        this.config.authUrl,
        'grant_type=client_credentials',
        {
          headers: {
            Authorization: `Basic ${credentials}`,
          },
        }
      );

      const data = response.data;
      if (!data?.access_token) {
        throw createAuthFailure(
          'Invalid OAuth response: missing access_token',
          'UPS'
        );
      }

      const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
      return {
        accessToken: data.access_token,
        expiresAt: Date.now() + expiresIn * 1000,
      };
    } catch (err) {
      throw this.wrapAuthError(err as Error);
    }
  }

  private wrapAuthError(err: Error): CarrierServiceError {
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') {
        return createTimeoutError('UPS');
      }
      if (err.response) {
        const status = err.response.status;
        const body = err.response.data;
        const msg =
          typeof body === 'object' && body?.error_description
            ? String(body.error_description)
            : body?.error
              ? String(body.error)
              : `OAuth failed with status ${status}`;
        return createAuthFailure(msg, 'UPS');
      }
      return createNetworkError(err.message ?? 'OAuth request failed', 'UPS');
    }
    return createAuthFailure(
      err instanceof Error ? err.message : 'Unknown OAuth error',
      'UPS'
    );
  }

  clearCache(): void {
    this.cachedToken = null;
  }
}
