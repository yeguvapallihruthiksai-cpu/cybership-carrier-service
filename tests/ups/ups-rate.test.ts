import nock from 'nock';
import { UpsAuthClient } from '../../src/carriers/ups/UpsAuthClient';
import { UpsAdapter } from '../../src/carriers/ups/UpsAdapter';
import { CarrierServiceError } from '../../src/domain/errors';
import type { RateRequest } from '../../src/domain/models';

const AUTH_URL = 'https://onlinetools.ups.com/security/v1/oauth/token';
const RATE_URL = 'https://onlinetools.ups.com/api/rating/v2409/Rate';

const sampleRequest: RateRequest = {
  origin: {
    name: 'Acme Inc',
    street1: '123 Main St',
    city: 'Timonium',
    stateProvinceCode: 'MD',
    postalCode: '21093',
    countryCode: 'US',
  },
  destination: {
    name: 'Widget Co',
    street1: '456 Oak Ave',
    city: 'Alpharetta',
    stateProvinceCode: 'GA',
    postalCode: '30005',
    countryCode: 'US',
  },
  packages: [
    {
      weight: 5,
      weightUnit: 'LBS',
      length: 10,
      width: 8,
      height: 6,
      dimensionUnit: 'IN',
    },
  ],
};

function createAdapter(): UpsAdapter {
  const authClient = new UpsAuthClient(
    {
      clientId: 'test',
      clientSecret: 'secret',
      authUrl: AUTH_URL,
      rateUrl: RATE_URL,
    },
    5000
  );
  return new UpsAdapter({
    authClient,
    rateUrl: RATE_URL,
    timeoutMs: 5000,
  });
}

function stubAuth(): nock.Scope {
  return nock('https://onlinetools.ups.com')
    .post('/security/v1/oauth/token')
    .reply(200, {
        access_token: 'mock_token',
      token_type: 'Bearer',
      expires_in: 3600,
    });
}

describe('UpsAdapter', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  describe('request payload', () => {
    it('builds correct UPS Rate request from domain models', async () => {
      let capturedBody: unknown = null;
      stubAuth();
      nock('https://onlinetools.ups.com')
        .post('/api/rating/v2409/Rate', (body: unknown) => {
          capturedBody = body;
          return true;
        })
        .reply(200, {
          RateResponse: {
            RatedShipment: [
              {
                Service: { Code: '03', Name: 'Ground' },
                TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '12.50' },
              },
            ],
          },
        });

      const adapter = createAdapter();
      await adapter.getRates(sampleRequest);

      expect(capturedBody).toBeDefined();
      const req = capturedBody as { RateRequest?: { Shipment?: { Shipper?: unknown; ShipTo?: unknown; Package?: unknown } } };
      expect(req.RateRequest?.Shipment?.Shipper).toBeDefined();
      expect(req.RateRequest?.Shipment?.ShipTo).toBeDefined();
      expect(req.RateRequest?.Shipment?.Package).toBeDefined();

      const shipper = req.RateRequest?.Shipment?.Shipper as { Name?: string; Address?: { AddressLine?: string[]; City?: string; PostalCode?: string } };
      expect(shipper.Name).toBe('Acme Inc');
      expect(shipper.Address?.City).toBe('Timonium');
      expect(shipper.Address?.PostalCode).toBe('21093');
      expect(shipper.Address?.AddressLine?.[0]).toBe('123 Main St');

      const pkg = req.RateRequest?.Shipment?.Package as { Dimensions?: { Length?: string; Width?: string; Height?: string }; PackageWeight?: { Weight?: string } };
      expect(pkg.Dimensions?.Length).toBe('10');
      expect(pkg.Dimensions?.Width).toBe('8');
      expect(pkg.Dimensions?.Height).toBe('6');
      expect(pkg.PackageWeight?.Weight).toBe('5');
    });

    it('includes optional service level when provided', async () => {
      let capturedBody: unknown = null;
      stubAuth();
      nock('https://onlinetools.ups.com')
        .post('/api/rating/v2409/Rate', (body: unknown) => {
          capturedBody = body;
          return true;
        })
        .reply(200, {
          RateResponse: {
            RatedShipment: [
              { Service: { Code: '01', Name: 'Next Day Air' }, TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '45.00' } },
            ],
          },
        });

      const adapter = createAdapter();
      await adapter.getRates({ ...sampleRequest, serviceLevel: '01' });

      const req = capturedBody as { RateRequest?: { Shipment?: { Service?: { Code?: string } } } };
      expect(req.RateRequest?.Shipment?.Service?.Code).toBe('01');
    });
  });

  describe('response parsing', () => {
    it('parses successful response and normalizes into RateQuote', async () => {
      stubAuth();
      nock('https://onlinetools.ups.com')
        .post('/api/rating/v2409/Rate')
        .reply(200, {
          RateResponse: {
            RatedShipment: [
              {
                Service: { Code: '03', Name: 'Ground' },
                TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '12.50' },
              },
              {
                Service: { Code: '01', Name: 'Next Day Air' },
                TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '45.99' },
                GuaranteedDelivery: { BusinessDaysInTransit: '1' },
              },
            ],
          },
        });

      const adapter = createAdapter();
      const result = await adapter.getRates(sampleRequest);

      expect(result.quotes).toHaveLength(2);
      expect(result.quotes[0]).toMatchObject({
        carrier: 'UPS',
        serviceName: 'Ground',
        serviceCode: '03',
        totalCharge: 12.5,
        currency: 'USD',
      });
      expect(result.quotes[1]).toMatchObject({
        carrier: 'UPS',
        serviceName: 'Next Day Air',
        serviceCode: '01',
        totalCharge: 45.99,
        currency: 'USD',
        transitDays: 1,
      });
    });

    it('uses NegotiatedRateCharges when present', async () => {
      stubAuth();
      nock('https://onlinetools.ups.com')
        .post('/api/rating/v2409/Rate')
        .reply(200, {
          RateResponse: {
            RatedShipment: [
              {
                Service: { Code: '03', Name: 'Ground' },
                NegotiatedRateCharges: {
                  TotalCharge: { CurrencyCode: 'USD', MonetaryValue: '9.99' },
                },
              },
            ],
          },
        });

      const adapter = createAdapter();
      const result = await adapter.getRates(sampleRequest);

      expect(result.quotes[0]?.totalCharge).toBe(9.99);
    });
  });

  describe('auth token lifecycle', () => {
    it('obtains token before rate request', async () => {
      const authScope = stubAuth();
      nock('https://onlinetools.ups.com')
        .post('/api/rating/v2409/Rate')
        .matchHeader('authorization', 'Bearer mock_token')
        .reply(200, {
          RateResponse: {
            RatedShipment: [{ Service: { Code: '03' }, TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '10' } }],
          },
        });

      const adapter = createAdapter();
      await adapter.getRates(sampleRequest);

      expect(authScope.isDone()).toBe(true);
    });
  });

  describe('error handling', () => {
    it('handles 4xx carrier error', async () => {
      stubAuth();
      nock('https://onlinetools.ups.com')
        .post('/api/rating/v2409/Rate')
        .reply(400, {
          Fault: {
            detail: {
              Errors: [
                {
                  ErrorDetail: [{ PrimaryErrorCode: { Code: '111285', Description: 'Invalid postal code' } }],
                },
              ],
            },
          },
        });

      const adapter = createAdapter();
      const promise = adapter.getRates(sampleRequest);

      await expect(promise).rejects.toThrow(CarrierServiceError);
      await expect(promise).rejects.toMatchObject({
        code: 'CARRIER_ERROR',
        carrier: 'UPS',
        statusCode: 400,
      });
    });

    it('handles 5xx carrier error', async () => {
      stubAuth();
      nock('https://onlinetools.ups.com').post('/api/rating/v2409/Rate').reply(500);

      const adapter = createAdapter();
      const promise = adapter.getRates(sampleRequest);

      await expect(promise).rejects.toThrow(CarrierServiceError);
      await expect(promise).rejects.toMatchObject({
        code: 'CARRIER_ERROR',
        statusCode: 500,
      });
    });

    it('handles 429 rate limiting', async () => {
      stubAuth();
      nock('https://onlinetools.ups.com')
        .post('/api/rating/v2409/Rate')
        .reply(429, { message: 'Too many requests' });

      const adapter = createAdapter();
      const promise = adapter.getRates(sampleRequest);

      await expect(promise).rejects.toThrow(CarrierServiceError);
      await expect(promise).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        carrier: 'UPS',
      });
    });

    it('handles malformed JSON response', async () => {
      stubAuth();
      nock('https://onlinetools.ups.com')
        .post('/api/rating/v2409/Rate')
        .reply(200, 'not json at all');

      const adapter = createAdapter();
      const promise = adapter.getRates(sampleRequest);

      await expect(promise).rejects.toThrow(CarrierServiceError);
      await expect(promise).rejects.toMatchObject({
        code: 'MALFORMED_RESPONSE',
      });
    });

    it('handles timeout', async () => {
      stubAuth();
      nock('https://onlinetools.ups.com')
        .post('/api/rating/v2409/Rate')
        .delayConnection(10000)
        .reply(200, {});

      const authClient = new UpsAuthClient(
        { clientId: 'x', clientSecret: 'y', authUrl: AUTH_URL, rateUrl: RATE_URL },
        5000
      );
      const adapter = new UpsAdapter({
        authClient,
        rateUrl: RATE_URL,
        timeoutMs: 100,
      });
      const promise = adapter.getRates(sampleRequest);

      await expect(promise).rejects.toThrow(CarrierServiceError);
      await expect(promise).rejects.toMatchObject({
        code: 'TIMEOUT',
      });
    });

    it('validates input before external call', async () => {
      const adapter = createAdapter();

      await expect(
        adapter.getRates({
          ...sampleRequest,
          packages: [],
        })
      ).rejects.toThrow();

      await expect(
        adapter.getRates({
          ...sampleRequest,
          origin: { ...sampleRequest.origin, city: '' },
        })
      ).rejects.toThrow();
    });
  });
});
