import nock from 'nock';
import { UpsAuthClient } from '../../src/carriers/ups/UpsAuthClient';
import { CarrierServiceError } from '../../src/domain/errors';

const AUTH_URL = 'https://onlinetools.ups.com/security/v1/oauth/token';

function createAuthClient(): UpsAuthClient {
  return new UpsAuthClient(
    {
      clientId: 'test_client',
      clientSecret: 'test_secret',
      authUrl: AUTH_URL,
      rateUrl: 'https://onlinetools.ups.com/api/rating/v2409/Rate',
    },
    5000
  );
}

describe('UpsAuthClient', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  it('acquires token and returns access_token', async () => {
    nock('https://onlinetools.ups.com')
      .post('/security/v1/oauth/token', 'grant_type=client_credentials')
      .reply(200, {
        access_token: 'mock_token_abc123',
        token_type: 'Bearer',
        expires_in: 3600,
      });

    const client = createAuthClient();
    const token = await client.getAccessToken();

    expect(token).toBe('mock_token_abc123');
  });

  it('reuses cached token when still valid', async () => {
    nock('https://onlinetools.ups.com')
      .post('/security/v1/oauth/token')
      .reply(200, {
        access_token: 'cached_token',
        token_type: 'Bearer',
        expires_in: 3600,
      });

    const client = createAuthClient();
    const t1 = await client.getAccessToken();
    const t2 = await client.getAccessToken();

    expect(t1).toBe('cached_token');
    expect(t2).toBe('cached_token');
    expect(nock.pendingMocks()).toHaveLength(0);
  });

  it('refreshes token when expired', async () => {
    nock('https://onlinetools.ups.com')
      .post('/security/v1/oauth/token')
      .reply(200, {
        access_token: 'first_token',
        token_type: 'Bearer',
        expires_in: 1,
      })
      .post('/security/v1/oauth/token')
      .reply(200, {
        access_token: 'refreshed_token',
        token_type: 'Bearer',
        expires_in: 3600,
      });

    const client = createAuthClient();
    const t1 = await client.getAccessToken();
    expect(t1).toBe('first_token');

    await new Promise((r) => setTimeout(r, 2100));
    const t2 = await client.getAccessToken();
    expect(t2).toBe('refreshed_token');
  });

  it('throws CarrierServiceError on 401 auth failure', async () => {
    nock('https://onlinetools.ups.com')
      .post('/security/v1/oauth/token')
      .reply(401, {
        error: 'invalid_client',
        error_description: 'Client authentication failed',
      });

    const client = createAuthClient();
    const promise = client.getAccessToken();

    await expect(promise).rejects.toThrow(CarrierServiceError);
    await expect(promise).rejects.toMatchObject({
      code: 'AUTH_FAILURE',
      carrier: 'UPS',
    });
  });

  it('throws on malformed OAuth response (missing access_token)', async () => {
    nock('https://onlinetools.ups.com')
      .post('/security/v1/oauth/token')
      .reply(200, { token_type: 'Bearer' });

    const client = createAuthClient();
    const promise = client.getAccessToken();

    await expect(promise).rejects.toThrow(CarrierServiceError);
    await expect(promise).rejects.toMatchObject({
      code: 'AUTH_FAILURE',
    });
  });

  it('clears cache when clearCache is called', async () => {
    nock('https://onlinetools.ups.com')
      .post('/security/v1/oauth/token')
      .reply(200, {
        access_token: 'token_one',
        token_type: 'Bearer',
        expires_in: 3600,
      })
      .post('/security/v1/oauth/token')
      .reply(200, {
        access_token: 'token_two',
        token_type: 'Bearer',
        expires_in: 3600,
      });

    const client = createAuthClient();
    const t1 = await client.getAccessToken();
    expect(t1).toBe('token_one');

    client.clearCache();
    const t2 = await client.getAccessToken();
    expect(t2).toBe('token_two');
  });
});
