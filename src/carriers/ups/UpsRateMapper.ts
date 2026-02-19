import type { Address, Package } from '../../domain/models';
import type {
  UpsAddress,
  UpsPackage,
  UpsRateRequest,
  UpsShipment,
  UpsShipper,
} from './ups.types';

function toUpsAddress(addr: Address): UpsAddress {
  const lines: string[] = [addr.street1];
  if (addr.street2) lines.push(addr.street2);
  if (addr.street3) lines.push(addr.street3);
  return {
    AddressLine: lines,
    City: addr.city,
    StateProvinceCode: addr.stateProvinceCode,
    PostalCode: addr.postalCode,
    CountryCode: addr.countryCode,
  };
}

function toUpsPackage(pkg: Package): UpsPackage {
  const dimCode = pkg.dimensionUnit === 'IN' ? 'IN' : 'CM';
  const weightCode = pkg.weightUnit === 'KGS' ? 'KGS' : pkg.weightUnit === 'OZS' ? 'OZS' : 'LBS';
  return {
    PackagingType: { Code: '02', Description: 'Package' },
    Dimensions: {
      UnitOfMeasurement: { Code: dimCode, Description: dimCode === 'IN' ? 'Inches' : 'Centimeters' },
      Length: String(pkg.length),
      Width: String(pkg.width),
      Height: String(pkg.height),
    },
    PackageWeight: {
      UnitOfMeasurement: { Code: weightCode, Description: weightCode },
      Weight: String(pkg.weight),
    },
  };
}

export function buildUpsRateRequest(
  origin: Address,
  destination: Address,
  packages: Package[],
  serviceLevel?: string,
  requestId?: string
): UpsRateRequest {
  const shipmentPackages =
    packages.length === 1 ? toUpsPackage(packages[0]!) : packages.map(toUpsPackage);

  const shipment: UpsShipment = {
    Shipper: { Name: origin.name, Address: toUpsAddress(origin) } as UpsShipper,
    ShipTo: { Name: destination.name, Address: toUpsAddress(destination) },
    ShipFrom: { Name: origin.name, Address: toUpsAddress(origin) },
    Package: shipmentPackages,
    PaymentDetails: {
      ShipmentCharge: [{ Type: '01', BillShipper: { AccountNumber: '' } }],
    },
    NumOfPieces: String(packages.length),
  };

  if (serviceLevel) {
    shipment.Service = { Code: serviceLevel, Description: serviceLevel };
  }

  const requestOption = serviceLevel ? 'Rate' : 'Shop';
  return {
    RateRequest: {
      Request: {
        TransactionReference: requestId ? { CustomerContext: requestId } : undefined,
        RequestOption: requestOption,
      },
      Shipment: shipment,
    },
  };
}
