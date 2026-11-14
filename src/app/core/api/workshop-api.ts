import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  BlocketStatus,
  CarInfoStatus,
  CompanyLookup,
  Customer,
  CustomerDetail,
  CustomerInput,
  Page,
  Resource,
  ServiceType,
  Supplier,
  SupplierDetail,
  SupplierInput,
  Vehicle,
  VehicleDetail,
  VehicleInput,
  VehicleLookup,
} from '../models';

export interface Archived {
  /** true = fanns i historiken och arkiverades i stället för att raderas. */
  archived: boolean;
}

function toParams(obj: object): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
  }
  return p;
}

/** Kundregister, bilar, mekaniker/platser och åtgärder: allt som bokningar pekar på. */
@Injectable({ providedIn: 'root' })
export class WorkshopApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory`;

  // --- kunder ---

  customers(
    query: { q?: string; includeArchived?: boolean; limit?: number; offset?: number } = {},
  ): Observable<Page<Customer>> {
    return this.http.get<Page<Customer>>(`${this.base}/customers`, { params: toParams(query) });
  }

  customer(id: string): Observable<CustomerDetail> {
    return this.http.get<CustomerDetail>(`${this.base}/customers/${id}`);
  }

  createCustomer(body: CustomerInput): Observable<Customer> {
    return this.http.post<Customer>(`${this.base}/customers`, body);
  }

  updateCustomer(id: string, body: CustomerInput): Observable<Customer> {
    return this.http.patch<Customer>(`${this.base}/customers/${id}`, body);
  }

  removeCustomer(id: string): Observable<Archived> {
    return this.http.delete<Archived>(`${this.base}/customers/${id}`);
  }

  // --- leverantörer ---

  suppliers(
    query: { q?: string; includeArchived?: boolean; limit?: number; offset?: number } = {},
  ): Observable<Page<Supplier>> {
    return this.http.get<Page<Supplier>>(`${this.base}/suppliers`, { params: toParams(query) });
  }

  supplier(id: string): Observable<SupplierDetail> {
    return this.http.get<SupplierDetail>(`${this.base}/suppliers/${id}`);
  }

  createSupplier(body: SupplierInput): Observable<Supplier> {
    return this.http.post<Supplier>(`${this.base}/suppliers`, body);
  }

  updateSupplier(id: string, body: SupplierInput): Observable<Supplier> {
    return this.http.patch<Supplier>(`${this.base}/suppliers/${id}`, body);
  }

  removeSupplier(id: string): Observable<Archived> {
    return this.http.delete<Archived>(`${this.base}/suppliers/${id}`);
  }

  // --- bilar ---

  vehicles(
    query: {
      q?: string;
      customerId?: string;
      includeArchived?: boolean;
      limit?: number;
      offset?: number;
    } = {},
  ): Observable<Page<Vehicle>> {
    return this.http.get<Page<Vehicle>>(`${this.base}/vehicles`, { params: toParams(query) });
  }

  vehicle(id: string): Observable<VehicleDetail> {
    return this.http.get<VehicleDetail>(`${this.base}/vehicles/${id}`);
  }

  /**
   * Allt registret vet om ett regnr (däck och fälg per axel, vikter, drivlina, besiktning).
   * Svarar alltid med en status, aldrig fel. `refresh` läser registret på nytt och uppdaterar bilen.
   */
  lookupVehicle(regNo: string, refresh = false): Observable<VehicleLookup> {
    return this.http.get<VehicleLookup>(
      `${this.base}/vehicles/lookup/${encodeURIComponent(regNo)}`,
      refresh ? { params: { refresh: 'true' } } : {},
    );
  }

  /**
   * Namn, adress, telefon, momsnummer och F-skatt för ett organisationsnummer ur ett öppet
   * företagsregister. Svarar alltid med en status, aldrig fel. Personnummer slås aldrig upp.
   * `refresh` frågar källan på nytt.
   */
  lookupCompany(orgNo: string, refresh = false): Observable<CompanyLookup> {
    return this.http.get<CompanyLookup>(
      `${this.base}/companies/lookup/${encodeURIComponent(orgNo)}`,
      refresh ? { params: { refresh: 'true' } } : {},
    );
  }

  /** Verkstadens egen inloggning hos car.info; aldrig lösenordet. */
  carInfo(): Observable<CarInfoStatus> {
    return this.http.get<CarInfoStatus>(`${this.base}/settings/carinfo`);
  }

  /** Kontrollerar inloggningen hos car.info och sparar den (ägare). */
  saveCarInfo(email: string, password: string): Observable<CarInfoStatus> {
    return this.http.put<CarInfoStatus>(`${this.base}/settings/carinfo`, { email, password });
  }

  clearCarInfo(): Observable<CarInfoStatus> {
    return this.http.delete<CarInfoStatus>(`${this.base}/settings/carinfo`);
  }

  /** Verkstadens anslutning till Blocket; aldrig nyckeln (ägare). */
  blocket(): Observable<BlocketStatus> {
    return this.http.get<BlocketStatus>(`${this.base}/settings/blocket`);
  }

  /** Kontrollerar en ny nyckel hos Blocket och sparar den; utan nyckel ändras bara resten (ägare). */
  saveBlocket(body: { token?: string; dealerCode?: string | null }): Observable<BlocketStatus> {
    return this.http.put<BlocketStatus>(`${this.base}/settings/blocket`, body);
  }

  clearBlocket(): Observable<BlocketStatus> {
    return this.http.delete<BlocketStatus>(`${this.base}/settings/blocket`);
  }

  createVehicle(body: VehicleInput): Observable<Vehicle> {
    return this.http.post<Vehicle>(`${this.base}/vehicles`, body);
  }

  updateVehicle(id: string, body: VehicleInput): Observable<Vehicle> {
    return this.http.patch<Vehicle>(`${this.base}/vehicles/${id}`, body);
  }

  removeVehicle(id: string): Observable<Archived> {
    return this.http.delete<Archived>(`${this.base}/vehicles/${id}`);
  }

  // --- mekaniker och platser ---

  resources(includeArchived = false): Observable<Resource[]> {
    return this.http.get<Resource[]>(`${this.base}/resources`, {
      params: toParams({ includeArchived }),
    });
  }

  createResource(body: Partial<Resource>): Observable<Resource> {
    return this.http.post<Resource>(`${this.base}/resources`, body);
  }

  updateResource(id: string, body: Partial<Resource>): Observable<Resource> {
    return this.http.patch<Resource>(`${this.base}/resources/${id}`, body);
  }

  removeResource(id: string): Observable<Archived> {
    return this.http.delete<Archived>(`${this.base}/resources/${id}`);
  }

  // --- åtgärder ---

  serviceTypes(includeArchived = false): Observable<ServiceType[]> {
    return this.http.get<ServiceType[]>(`${this.base}/service-types`, {
      params: toParams({ includeArchived }),
    });
  }

  createServiceType(body: Partial<ServiceType>): Observable<ServiceType> {
    return this.http.post<ServiceType>(`${this.base}/service-types`, body);
  }

  updateServiceType(id: string, body: Partial<ServiceType>): Observable<ServiceType> {
    return this.http.patch<ServiceType>(`${this.base}/service-types/${id}`, body);
  }

  removeServiceType(id: string): Observable<Archived> {
    return this.http.delete<Archived>(`${this.base}/service-types/${id}`);
  }
}
