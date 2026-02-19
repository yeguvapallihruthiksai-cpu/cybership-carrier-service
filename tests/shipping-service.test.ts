import nock from 'nock';
import { createShippingService } from '../src';
import { CarrierServiceError } from '../src/domain/errors';

const AUTH_URL = 'https://onlinetools.ups.com/security/v1/oauth/token';
const RATE_URL = 'https://onlinetools.ups.com/api/rating/v2409/Rate';

beforeEach(() => {
  nock.cleanAll();
  process.env.UPS_CLIENT_ID = 'test';
  process.env.UPS_CLIENT_SECRET = 'test';
  process.env.UPS_AUTH_URL = AUTH_URL;
  process.env.UPS_RATE_URL = RATE_URL;
});

describe('ShippingService', () => {
  it('routes to UPS adapter and returns normalized rates', async () => {
    nock('https://onlinetools.ups.com')
      .post('/security/v1/oauth/token')
      .reply(200, { access_token: 't', token_type: 'Bearer', expires_in: 3600 });
    nock('https://onlinetools.ups.com')
      .post('/api/rating/v2409/Rate')
      .reply(200, {
        RateResponse: {
          RatedShipment: [
            { Service: { Code: '03', Name: 'Ground' }, TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '15.00' } },
          ],
        },
      });

    const service = createShippingService();
    const result = await service.getRates('UPS', {
      origin: {
        name: 'A',
        street1: '1 Main',
        city: 'NYC',
        stateProvinceCode: 'NY',
        postalCode: '10001',
        countryCode: 'US',
      },
      destination: {
        name: 'B',
        street1: '2 Oak',
        city: 'LA',
        stateProvinceCode: 'CA',
        postalCode: '90001',
        countryCode: 'US',
      },
      packages: [{ weight: 1, length: 5, width: 5, height: 5, weightUnit: 'LBS', dimensionUnit: 'IN' }],
    });

    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0]).toMatchObject({
      carrier: 'UPS',
      serviceName: 'Ground',
      totalCharge: 15,
    });
  });

  it('throws CARRIER_NOT_FOUND for unknown carrier', async () => {
    const service = createShippingService();

    await expect(
      service.getRates('FEDEX', {
        origin: {
          name: 'A',
          street1: '1',
          city: 'NYC',
          stateProvinceCode: 'NY',
          postalCode: '10001',
          countryCode: 'US',
        },
        destination: {
          name: 'B',
          street1: '2',
          city: 'LA',
          stateProvinceCode: 'CA',
          postalCode: '90001',
          countryCode: 'US',
        },
        packages: [{ weight: 1, length: 5, width: 5, height: 5, weightUnit: 'LBS', dimensionUnit: 'IN' }],
      })
    ).rejects.toMatchObject({
      code: 'CARRIER_NOT_FOUND',
      message: expect.stringContaining('FEDEX'),
    });
  });

  it('returns available carriers', () => {
    const service = createShippingService();
    expect(service.getAvailableCarriers()).toContain('UPS');
  });
});
