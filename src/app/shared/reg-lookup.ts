import { Injectable, inject } from '@angular/core';
import { Observable, map, of, switchMap } from 'rxjs';
import { StorageApi } from '../core/api/storage-api';
import { WorkshopApi } from '../core/api/workshop-api';
import { Vehicle } from '../core/models';

export interface RegCheck {
  /** Bilen finns redan i registret. */
  taken: Vehicle | null;
  /** Märke och modell från en tidigare inlämning av samma bil. */
  earlier: { make: string | null; model: string | null } | null;
}

/** Vad vi redan vet om ett regnr: finns bilen i registret, eller har den lämnats in förut? */
@Injectable({ providedIn: 'root' })
export class RegLookup {
  private readonly workshop = inject(WorkshopApi);
  private readonly storage = inject(StorageApi);

  check(regNo: string): Observable<RegCheck> {
    return this.workshop.vehicles({ q: regNo, includeArchived: true, limit: 5 }).pipe(
      switchMap((p) => {
        const taken = p.items.find((v) => v.regNo === regNo) ?? null;
        if (taken) return of<RegCheck>({ taken, earlier: null });
        return this.storage.deposits({ q: regNo, limit: 10 }).pipe(
          map(({ items }): RegCheck => {
            const old = items.find((d) => d.vehicle.regNo === regNo);
            return {
              taken: null,
              earlier: old ? { make: old.vehicle.make, model: old.vehicle.model } : null,
            };
          }),
        );
      }),
    );
  }
}
