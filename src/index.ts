import { loadConfig } from './config/config';
import { UpsAuthClient } from './carriers/ups/UpsAuthClient';
import { UpsAdapter } from './carriers/ups/UpsAdapter';
import { ShippingService } from './services/ShippingService';

export { ShippingService } from './services/ShippingService';
export type { RateRequest, RateResponse, RateQuote, Address, Package } from './domain/models';
export { CarrierServiceError, createValidationError } from './domain/errors';

export function createShippingService(): ShippingService {
  const config = loadConfig();
  const upsAuth = new UpsAuthClient(config.ups, config.http.timeoutMs);
  const upsAdapter = new UpsAdapter({
    authClient: upsAuth,
    rateUrl: config.ups.rateUrl,
    timeoutMs: config.http.timeoutMs,
  });

  const carriers = new Map<string, import('./carriers/base/CarrierAdapter').CarrierAdapter>();
  carriers.set('UPS', upsAdapter);

  return new ShippingService({ carriers });
}
