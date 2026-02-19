# Cybership Carrier Integration Service

A production-quality TypeScript service that wraps the UPS Rating API to fetch shipping rates. Callers receive normalized rate quotes—they never see raw UPS request/response formats.

## Features

- **Rate Shopping**: Accept origin, destination, package dimensions/weight, optional service level → return normalized rate quotes
- **OAuth 2.0 Auth**: UPS client-credentials flow with token acquisition, caching, and transparent refresh on expiry
- **Extensible Architecture**: Adding FedEx or USPS requires implementing the `CarrierAdapter` interface; UPS code remains untouched
- **Configuration**: All secrets via environment variables; `.env.example` provided
- **Validation**: Zod runtime validation for all domain models; input validated before any external call
- **Error Handling**: Structured errors for timeouts, 4xx/5xx, malformed responses, rate limiting, auth failures

## Tech Stack

- TypeScript (strict mode)
- Node.js
- Zod
- Axios
- Jest + nock (tests)

## Project Structure

```
src/
  carriers/
    base/CarrierAdapter.ts    # Abstract carrier interface
    ups/
      UpsAdapter.ts           # UPS rate implementation
      UpsAuthClient.ts        # OAuth token management
      UpsRateMapper.ts        # Domain → UPS payload mapping
      ups.types.ts            # UPS API types
  domain/
    models.ts                 # Domain models + Zod schemas
    errors.ts                 # Structured error types
  services/
    ShippingService.ts        # Carrier routing
  config/
    config.ts                 # Environment-based config
tests/
  ups/
    ups-rate.test.ts
    ups-auth.test.ts
  shipping-service.test.ts
```

## Design Decisions

### 1. Plugin Architecture

`CarrierAdapter` defines a single method `getRates(request): Promise<RateResponse>`. To add FedEx or USPS:

1. Create `FedExAdapter` implementing `CarrierAdapter`
2. Register it in `createShippingService()` via the carriers map
3. No changes to `ShippingService`, domain models, or UPS code

### 2. Token Lifecycle

`UpsAuthClient` caches the access token and refreshes when it expires (with a 60-second buffer). Token acquisition and reuse are transparent to callers. Tests verify acquisition, reuse, and refresh-on-expiry.

### 3. Normalized Domain Model

Callers use `Address`, `Package`, `RateRequest`, and `RateResponse`—carrier-agnostic types. Raw UPS payloads stay inside `UpsRateMapper` and `UpsAdapter`. Adding new carriers only requires mapping their APIs to these types.

### 4. Validation Before External Calls

All inputs are validated with Zod before any HTTP request. Invalid data results in `VALIDATION_ERROR` without hitting the network.

### 5. Structured Errors

`CarrierServiceError` carries `code`, `message`, `carrier`, `statusCode`, and optional `upstreamMessage`. All failures surface through this type instead of raw exceptions.

### 6. Mocked HTTP in Tests

nock stubs all HTTP calls. No live API keys are needed. Tests cover request payload construction, response parsing, auth lifecycle, and error scenarios.

## Getting Started

### Install

```bash
npm install
```

### Configuration

Copy `.env.example` to `.env` and set:

- `UPS_CLIENT_ID` – UPS OAuth client ID (or use stub defaults)
- `UPS_CLIENT_SECRET` – UPS OAuth client secret

Optional overrides:

- `UPS_AUTH_URL` – OAuth token endpoint (default: `https://onlinetools.ups.com/security/v1/oauth/token`)
- `UPS_RATE_URL` – Rating API endpoint (default: `https://onlinetools.ups.com/api/rating/v2409/Rate`)
- `HTTP_TIMEOUT_MS` – Request timeout (default: 15000)

### Build

```bash
npm run build
```

### Run Tests

```bash
npm test
```

With coverage:

```bash
npm run test:coverage
```

### Usage Example

```typescript
import { createShippingService } from './src';

const service = createShippingService();

const result = await service.getRates('UPS', {
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
    { weight: 5, length: 10, width: 8, height: 6 },
  ],
});

console.log(result.quotes);
// [{ carrier: 'UPS', serviceName: 'Ground', totalCharge: 12.50, ... }, ...]
```

## What Would Improve This

1. **Retries**: Add configurable retries for transient failures (503, network errors) with exponential backoff.
2. **Circuit Breaker**: Integrate a circuit breaker to avoid hammering a failing carrier.
3. **Logging**: Add structured logging (e.g. Pino) with request IDs for tracing.
4. **Health Checks**: Expose a health endpoint that verifies auth token validity.
5. **Multi-Carrier Shop**: Extend `ShippingService` to call multiple carriers in parallel and merge quotes.
6. **Caching**: Cache rate responses for identical requests with a short TTL.
7. **OpenTelemetry**: Add spans for carrier calls to observe latency and errors.
