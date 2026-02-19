import type { CarrierAdapter } from '../carriers/base/CarrierAdapter';
import type { RateRequest, RateResponse } from '../domain/models';
import { createCarrierNotFound } from '../domain/errors';

export interface ShippingServiceDeps {
  carriers: Map<string, CarrierAdapter>;
}

export class ShippingService {
  private readonly carriers: Map<string, CarrierAdapter>;

  constructor(deps: ShippingServiceDeps) {
    this.carriers = deps.carriers;
  }

  getRates(carrierName: string, request: RateRequest): Promise<RateResponse> {
    const adapter = this.carriers.get(carrierName.toUpperCase());
    if (!adapter) {
      return Promise.reject(createCarrierNotFound(carrierName));
    }
    return adapter.getRates(request);
  }

  getAvailableCarriers(): string[] {
    return Array.from(this.carriers.keys());
  }
}
