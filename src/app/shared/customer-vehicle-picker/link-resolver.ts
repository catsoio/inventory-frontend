import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { WorkshopApi } from '../../core/api/workshop-api';
import { VehicleLookup } from '../../core/models';
import type { PickerValue } from './customer-vehicle-picker';

/** Kund och bil som finns i registren. */
export interface ResolvedLink {
  customerId: string;
  vehicleId: string;
}

/**
 * Gör om väljarens värde till riktiga id:n. Har man bara skrivit en ny kund och/eller ett nytt
 * regnr skapas de nu, när formuläret sparas, så att man slipper en dialog i dialogen. Finns regnumret
 * redan används den bilen. Märke och modell hämtas ur fordonsregistret om det går; resten fyller
 * man i senare på kundens eller bilens kort.
 */
@Injectable({ providedIn: 'root' })
export class LinkResolver {
  private readonly api = inject(WorkshopApi);

  resolve(link: PickerValue): Observable<ResolvedLink> {
    const p = link.pending;
    if (!p) return of({ customerId: link.customerId, vehicleId: link.vehicleId });
    // Numret är namnet tills man fyller i det riktiga (namn krävs i registret).
    const newCustomer = () =>
      this.api.createCustomer({
        type: 'private',
        name: p.customerName ?? '',
        ...(p.customerPhone ? { phone: p.customerPhone } : {}),
      });
    // Bara en ny kund, ingen bil.
    const regNo = p.regNo;
    if (!regNo) {
      return newCustomer().pipe(map((c) => ({ customerId: c.id, vehicleId: '' })));
    }
    return this.api.vehicles({ q: regNo, includeArchived: true, limit: 5 }).pipe(
      map((page) => page.items.find((v) => v.regNo === regNo) ?? null),
      switchMap((existing) => {
        if (existing) return of({ customerId: existing.customerId, vehicleId: existing.id });
        const customerId$ = p.customerId
          ? of(p.customerId)
          : newCustomer().pipe(map((c) => c.id));
        return customerId$.pipe(
          switchMap((customerId) =>
            this.api.lookupVehicle(regNo).pipe(
              catchError(() => of<VehicleLookup>({ status: 'unavailable', info: null })),
              switchMap((r) =>
                this.api.createVehicle({
                  customerId,
                  regNo,
                  make: r.info?.make ?? null,
                  model: r.info?.model ?? null,
                  year: r.info?.year ?? null,
                  vin: r.info?.vin ?? null,
                }),
              ),
              map((v) => ({ customerId, vehicleId: v.id })),
            ),
          ),
        );
      }),
    );
  }
}
