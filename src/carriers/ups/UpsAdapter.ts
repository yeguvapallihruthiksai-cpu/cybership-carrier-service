import axios, { AxiosInstance } from 'axios';
import type { CarrierAdapter } from '../base/CarrierAdapter';
import type { RateRequest, RateResponse, RateQuote } from '../../domain/models';
import {
  CarrierServiceError,
  createCarrierError,
  createMalformedResponseError,
  createNetworkError,
  createRateLimited,
  createTimeoutError,
} from '../../domain/errors';
import { RateRequestSchema } from '../../domain/models';
import { createValidationError } from '../../domain/errors';
import type { UpsRateRequest, UpsRateResponse, UpsRatedShipment } from './ups.types';
import { UpsAuthClient } from './UpsAuthClient';
import { buildUpsRateRequest } from './UpsRateMapper';

export interface UpsAdapterDeps {
  authClient: UpsAuthClient;
  rateUrl: string; // full URL, e.g. https://onlinetools.ups.com/api/rating/v2409/Rate
  timeoutMs: number;
}

function parseMonetaryValue(val: string | number | undefined): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  return 0;
}

function parseTransitDays(val: string | number | undefined): number | undefined {
  if (val === undefined) return undefined;
  const n = typeof val === 'number' ? val : parseInt(String(val), 10);
  return Number.isNaN(n) ? undefined : Math.max(0, n);
}

function mapRatedShipment(shipment: UpsRatedShipment): RateQuote | null {
  const service = shipment.Service;
  if (!service?.Code) return null;

  const totalCharges =
    shipment.NegotiatedRateCharges?.TotalCharge ??
    shipment.TotalCharges ??
    shipment.TransportationCharges;
  const monetaryValue = totalCharges?.MonetaryValue;
  const currencyCode = totalCharges?.CurrencyCode ?? 'USD';
  const totalCharge = parseMonetaryValue(monetaryValue);

  const transitDays = shipment.GuaranteedDelivery?.BusinessDaysInTransit
    ? parseTransitDays(shipment.GuaranteedDelivery.BusinessDaysInTransit)
    : undefined;

  return {
    carrier: 'UPS',
    serviceName: service.Name ?? service.Description ?? service.Code,
    serviceCode: service.Code,
    totalCharge,
    currency: currencyCode,
    transitDays,
  };
}

function parseUpsRateResponse(body: unknown): RateQuote[] {
  const resp = body as UpsRateResponse | undefined;
  const ratedShipments = resp?.RateResponse?.RatedShipment;
  if (!ratedShipments) return [];

  const arr = Array.isArray(ratedShipments) ? ratedShipments : [ratedShipments];
  const quotes: RateQuote[] = [];
  for (const s of arr) {
    const q = mapRatedShipment(s);
    if (q) quotes.push(q);
  }
  return quotes;
}

export class UpsAdapter implements CarrierAdapter {
  readonly carrierName = 'UPS';
  private readonly authClient: UpsAuthClient;
  private readonly client: AxiosInstance;
  private readonly rateUrl: string;

  constructor(deps: UpsAdapterDeps) {
    this.authClient = deps.authClient;
    this.rateUrl = deps.rateUrl;
    const base = deps.rateUrl.replace(/\/[^/]*$/, '');
    this.client = axios.create({
      baseURL: base,
      timeout: deps.timeoutMs,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async getRates(request: RateRequest): Promise<RateResponse> {
    const parsed = RateRequestSchema.safeParse(request);
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      throw createValidationError(msg, request.requestId);
    }
    const req = parsed.data;

    const token = await this.authClient.getAccessToken();
    const upsPayload = buildUpsRateRequest(
      req.origin,
      req.destination,
      req.packages,
      req.serviceLevel,
      req.requestId
    );

    try {
      const response = await this.client.post<unknown>(this.rateUrl, upsPayload, {
        headers: {
          Authorization: `Bearer ${token}`,
          transId: req.requestId ?? `cybership-${Date.now()}`,
          transactionSrc: 'cybership',
        },
      });

      const body = response.data;
      if (typeof body !== 'object' || body === null) {
        throw createMalformedResponseError('UPS', 'Response is not an object');
      }

      const quotes = parseUpsRateResponse(body);
      return {
        quotes,
        requestId: req.requestId,
      };
    } catch (err) {
      throw this.wrapRateError(err as Error, req.requestId);
    }
  }

  private wrapRateError(err: Error, _requestId?: string): never {
    if (err instanceof CarrierServiceError) {
      throw err;
    }
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') {
        throw createTimeoutError('UPS');
      }
      const status = err.response?.status;
      const body = err.response?.data;

      if (status === 429) {
        const msg = typeof body === 'object' && body !== null && 'message' in body
          ? String((body as Record<string, unknown>).message)
          : undefined;
        throw createRateLimited('UPS', msg);
      }

      if (status && status >= 200 && status < 300) {
        const cause = (err as { cause?: Error }).cause;
        if (cause?.name === 'SyntaxError' || cause?.message?.includes('JSON')) {
          throw createMalformedResponseError('UPS', 'Invalid JSON in response');
        }
      }

      if (status && status >= 400) {
        let upstreamMsg: string | undefined;
        if (typeof body === 'object' && body !== null) {
          const b = body as Record<string, unknown>;
          const fault = b['Fault'] as Record<string, unknown> | undefined;
          const desc = fault?.detail as Record<string, unknown> | undefined;
          const errs = desc?.['Errors'] as Array<Record<string, unknown>> | undefined;
          const errDetail = errs?.[0]?.['ErrorDetail'] as Array<Record<string, unknown>> | undefined;
          const primary = errDetail?.[0]?.['PrimaryErrorCode'] as Record<string, unknown> | undefined;
          if (primary?.['Description']) {
            upstreamMsg = String(primary['Description']);
          } else {
            const resp = b['response'] as Record<string, unknown> | undefined;
            const errors = resp?.['errors'] as Array<Record<string, unknown>> | undefined;
            if (errors?.[0]?.['message']) {
              upstreamMsg = String(errors[0]['message']);
            }
          }
        }
        throw createCarrierError(
          'UPS',
          upstreamMsg ?? `UPS returned ${status}`,
          status,
          upstreamMsg
        );
      }

      throw createNetworkError(err.message ?? 'Rate request failed', 'UPS');
    }
    throw err;
  }
}
