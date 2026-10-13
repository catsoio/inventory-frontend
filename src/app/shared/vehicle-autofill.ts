import { Injectable, inject } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { StorageApi } from '../core/api/storage-api';
import { WorkshopApi } from '../core/api/workshop-api';
import { Vehicle, VehicleLookup } from '../core/models';

/** Fälten på ett bilformulär som hämtas åt en. */
export interface VehicleFields {
  make: FormControl<string>;
  model: FormControl<string>;
  year: FormControl<number | null>;
  vin: FormControl<string>;
}

/** Vilket formulär som helst som har bilens fält. */
export interface VehicleForm {
  controls: VehicleFields;
}

export interface AutofillResult {
  /** Regnumret finns redan på en bil i registret. */
  taken: Vehicle | null;
  /** Fälten fylldes från fordonsregistret och är låsta. */
  locked: boolean;
  note: { warn: boolean; text: string; link?: string[] } | null;
}

const NONE: AutofillResult = { taken: null, locked: false, note: null };

/**
 * Vad som händer när man lämnat regnr-fältet på ett bilformulär: finns bilen redan hos någon
 * kund varnar vi. Annars hämtas märke, modell, årsmodell och chassinummer ur fordonsregistret,
 * fälten fylls och låses. Går det inte får man ett litet meddelande och fyller i själv.
 */
@Injectable({ providedIn: 'root' })
export class VehicleAutofill {
  private readonly workshop = inject(WorkshopApi);
  private readonly storage = inject(StorageApi);

  run(form: VehicleForm, regNo: string): Observable<AutofillResult> {
    this.unlock(form, true);
    if (regNo.length < 2) return of(NONE);
    return this.workshop.vehicles({ q: regNo, includeArchived: true, limit: 5 }).pipe(
      switchMap((p) => {
        const taken = p.items.find((v) => v.regNo === regNo) ?? null;
        if (taken) {
          return of<AutofillResult>({
            taken,
            locked: false,
            note: {
              warn: true,
              text: `${regNo} finns redan hos ${taken.customer?.name ?? 'en annan kund'}${taken.active ? '' : ' (arkiverad bil)'}. `,
              link: ['/vehicles', taken.id],
            },
          });
        }
        return this.workshop.lookupVehicle(regNo).pipe(
          // Svaret är alltid en status, men ett nätverksfel ska inte heller stoppa formuläret.
          catchError(() => of<VehicleLookup>({ status: 'unavailable', info: null })),
          switchMap((r) => this.apply(form, regNo, r)),
        );
      }),
    );
  }

  /** Låser upp fälten. `clear` tömmer dem också, när de fyllts i automatiskt. */
  unlock(form: VehicleForm, clear = false) {
    const c = form.controls;
    const locked = c.make.disabled;
    for (const ctl of [c.make, c.model, c.year, c.vin] as FormControl[]) ctl.enable();
    if (clear && locked) {
      c.make.setValue('');
      c.model.setValue('');
      c.year.setValue(null);
      c.vin.setValue('');
    }
  }

  private apply(form: VehicleForm, regNo: string, r: VehicleLookup): Observable<AutofillResult> {
    const c = form.controls;
    if (r.status === 'found' && r.info) {
      c.make.setValue(r.info.make ?? '');
      c.model.setValue(r.info.model ?? '');
      c.year.setValue(r.info.year);
      c.vin.setValue(r.info.vin ?? '');
      for (const ctl of [c.make, c.model, c.year, c.vin] as FormControl[]) ctl.disable();
      return of({
        taken: null,
        locked: true,
        note: { warn: false, text: 'Hämtat från fordonsregistret.' },
      });
    }
    // Hittades inte: kanske har bilen lämnats in hos oss förut, då får man åtminstone märke och modell.
    return this.storage.deposits({ q: regNo, limit: 10 }).pipe(
      catchError(() => of({ items: [] as never[] })),
      map(({ items }): AutofillResult => {
        const old = items.find((d) => d.vehicle.regNo === regNo);
        if (old && !c.make.value && !c.model.value) {
          c.make.setValue(old.vehicle.make ?? '');
          c.model.setValue(old.vehicle.model ?? '');
        }
        const why =
          r.status === 'unavailable'
            ? 'Kunde inte hämta bilinfo. Fyll i manuellt.'
            : 'Hittade ingen bil med det numret. Fyll i manuellt.';
        return {
          taken: null,
          locked: false,
          note: {
            warn: r.status === 'unavailable',
            text: old ? `${why} Märke och modell hämtades från en tidigare inlämning.` : why,
          },
        };
      }),
    );
  }
}
