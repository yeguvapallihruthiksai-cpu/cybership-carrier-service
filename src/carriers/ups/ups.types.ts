/**
 * UPS Rating API request/response types (internal, not exposed to callers).
 * Based on UPS API v2409 documentation.
 */

export interface UpsOAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface UpsAddress {
  AddressLine: string[];
  City: string;
  StateProvinceCode: string;
  PostalCode: string;
  CountryCode: string;
}

export interface UpsShipper {
  Name: string;
  Address: UpsAddress;
}

export interface UpsPackageDimensions {
  UnitOfMeasurement: { Code: string; Description: string };
  Length: string;
  Width: string;
  Height: string;
}

export interface UpsPackageWeight {
  UnitOfMeasurement: { Code: string; Description: string };
  Weight: string;
}

export interface UpsPackage {
  PackagingType: { Code: string; Description: string };
  Dimensions: UpsPackageDimensions;
  PackageWeight: UpsPackageWeight;
}

export interface UpsService {
  Code: string;
  Description: string;
}

export interface UpsShipment {
  Shipper: UpsShipper;
  ShipTo: { Name: string; Address: UpsAddress };
  ShipFrom: { Name: string; Address: UpsAddress };
  Package: UpsPackage | UpsPackage[];
  PaymentDetails?: {
    ShipmentCharge: Array<{
      Type: string;
      BillShipper: { AccountNumber: string };
    }>;
  };
  Service?: UpsService;
  NumOfPieces?: string;
}

export interface UpsRateRequest {
  RateRequest: {
    Request: {
      TransactionReference?: { CustomerContext?: string };
      RequestOption?: string;
    };
    Shipment: UpsShipment;
  };
}

export interface UpsRatedShipment {
  Service: { Code: string; Name?: string; Description?: string };
  TotalCharges?: { CurrencyCode: string; MonetaryValue: string };
  TransportationCharges?: { CurrencyCode: string; MonetaryValue: string };
  NegotiatedRateCharges?: {
    ItemizedCharges?: Array<{ Code?: string; Description?: string; MonetaryValue: string }>;
    TotalCharge: { CurrencyCode: string; MonetaryValue: string };
  };
  GuaranteedDelivery?: { BusinessDaysInTransit?: string };
}

export interface UpsRateResponse {
  RateResponse?: {
    Response?: { ResponseStatus?: { Code?: string; Description?: string } };
    RatedShipment?: UpsRatedShipment | UpsRatedShipment[];
  };
}
