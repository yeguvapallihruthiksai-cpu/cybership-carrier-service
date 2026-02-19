import type { RateRequest, RateResponse } from '../../domain/models';

/**
 * Abstract interface for carrier adapters.
 * Adding FedEx or USPS only requires implementing this interface;
 * UPS code remains untouched.
 */
export interface CarrierAdapter {
  readonly carrierName: string;

  /**
   * Fetch normalized rate quotes for the given request.
   * Implementation handles carrier-specific auth, request building, and response mapping.
   */
  getRates(request: RateRequest): Promise<RateResponse>;
}
