/**
 * Structured errors for the carrier integration service.
 * Callers receive these instead of raw HTTP/network errors.
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTH_FAILURE'
  | 'CARRIER_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'CARRIER_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'MALFORMED_RESPONSE'
  | 'UNKNOWN_ERROR';

export interface CarrierErrorDetails {
  code: ErrorCode;
  message: string;
  carrier?: string;
  statusCode?: number;
  upstreamMessage?: string;
  requestId?: string;
}

export class CarrierServiceError extends Error {
  public readonly code: ErrorCode;
  public readonly carrier?: string;
  public readonly statusCode?: number;
  public readonly upstreamMessage?: string;
  public readonly requestId?: string;

  constructor(details: CarrierErrorDetails) {
    super(details.message);
    this.name = 'CarrierServiceError';
    this.code = details.code;
    this.carrier = details.carrier;
    this.statusCode = details.statusCode;
    this.upstreamMessage = details.upstreamMessage;
    this.requestId = details.requestId;
    Object.setPrototypeOf(this, CarrierServiceError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      carrier: this.carrier,
      statusCode: this.statusCode,
      upstreamMessage: this.upstreamMessage,
      requestId: this.requestId,
    };
  }
}

export function createValidationError(message: string, requestId?: string): CarrierServiceError {
  return new CarrierServiceError({ code: 'VALIDATION_ERROR', message, requestId });
}

export function createAuthFailure(message: string, carrier?: string): CarrierServiceError {
  return new CarrierServiceError({ code: 'AUTH_FAILURE', message, carrier });
}

export function createCarrierNotFound(carrier: string): CarrierServiceError {
  return new CarrierServiceError({
    code: 'CARRIER_NOT_FOUND',
    message: `Unknown carrier: ${carrier}`,
    carrier,
  });
}

export function createRateLimited(carrier: string, message?: string): CarrierServiceError {
  return new CarrierServiceError({
    code: 'RATE_LIMITED',
    message: message ?? `Rate limited by ${carrier}`,
    carrier,
  });
}

export function createCarrierError(
  carrier: string,
  message: string,
  statusCode?: number,
  upstreamMessage?: string
): CarrierServiceError {
  return new CarrierServiceError({
    code: 'CARRIER_ERROR',
    message,
    carrier,
    statusCode,
    upstreamMessage,
  });
}

export function createNetworkError(message: string, carrier?: string): CarrierServiceError {
  return new CarrierServiceError({ code: 'NETWORK_ERROR', message, carrier });
}

export function createTimeoutError(carrier: string): CarrierServiceError {
  return new CarrierServiceError({
    code: 'TIMEOUT',
    message: `Request to ${carrier} timed out`,
    carrier,
  });
}

export function createMalformedResponseError(
  carrier: string,
  message?: string
): CarrierServiceError {
  return new CarrierServiceError({
    code: 'MALFORMED_RESPONSE',
    message: message ?? `Malformed response from ${carrier}`,
    carrier,
  });
}
