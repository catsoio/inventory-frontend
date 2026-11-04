import { Component, OnInit, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GarageLicense, LicenseApi, MODULE_INFO } from '../../../core/api/license-api';

type Mode = 'plan' | 'on' | 'off';

/**
 * Catso (superadmin) styr vad ett garage får använda: plan och, för varje del, "enligt plan", på
 * eller av. Av gäller alltid; på lägger till en del planen saknar. Så säljs en verkstad utan
 * bilhandel, eller en däckhotellskund med bara SMS som tillägg.
 */
@Component({
  selector: 'app-features-dialog',
  standalone: false,
  template: `
    <h2 mat-dialog-title>Funktioner: {{ data.name }}</h2>
    <mat-dialog-content class="!pt-2">
      @if (license(); as l) {
        @if (!l.enforced) {
          <p class="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Betalning är inte påslagen än, så planen blockerar inget: allt är på utom det du stänger
            av här. Valet "På" gör skillnad först när planen börjar gälla.
          </p>
        }
        <label class="mb-4 flex flex-col gap-0.5 text-xs text-gray-500"
          >Plan
          <select
            [value]="plan()"
            (change)="plan.set($any($event.target).value)"
            class="h-10 w-48 px-2 text-sm text-gray-900 field"
          >
            <option value="dack">Däck</option>
            <option value="verkstad">Verkstad</option>
          </select>
        </label>
        <div class="flex flex-col divide-y divide-gray-100">
          @for (m of modules; track m.id) {
            <div class="flex flex-wrap items-center gap-3 py-2.5">
              <div class="min-w-48 flex-1">
                <div class="text-sm font-medium">{{ m.label }}</div>
                <div class="text-xs text-gray-500">{{ m.text }}</div>
              </div>
              <div class="flex gap-1.5" role="radiogroup" [attr.aria-label]="m.label">
                @for (o of options; track o.value) {
                  <button
                    type="button"
                    role="radio"
                    [attr.aria-checked]="modes()[m.id] === o.value"
                    class="h-9 rounded-lg border px-3 text-sm"
                    [class]="
                      modes()[m.id] === o.value
                        ? o.value === 'off'
                          ? 'border-red-600 bg-red-50 text-red-800'
                          : 'border-[var(--color-brand)] bg-[var(--color-brand-soft)]'
                        : 'border-gray-300 bg-white text-gray-600'
                    "
                    (click)="set(m.id, o.value)"
                  >
                    {{ o.value === 'plan' ? (planGives(m.id) ? 'Plan: på' : 'Plan: av') : o.label }}
                  </button>
                }
              </div>
            </div>
          }
        </div>
      } @else {
        <p class="py-6 text-center text-gray-500">Laddar…</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Avbryt</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="!license() || busy()">
        Spara
      </button>
    </mat-dialog-actions>
  `,
})
export class FeaturesDialog implements OnInit {
  readonly data = inject<{ id: string; name: string }>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<FeaturesDialog>);
  private readonly api = inject(LicenseApi);
  private readonly snack = inject(MatSnackBar);

  readonly modules = MODULE_INFO;
  readonly options: { value: Mode; label: string }[] = [
    { value: 'plan', label: 'Enligt plan' },
    { value: 'on', label: 'På' },
    { value: 'off', label: 'Av' },
  ];
  readonly license = signal<GarageLicense | null>(null);
  readonly plan = signal<'dack' | 'verkstad'>('verkstad');
  readonly modes = signal<Record<string, Mode>>({});
  readonly busy = signal(false);

  ngOnInit() {
    this.api.overview().subscribe((rows) => {
      const l = rows.find((r) => r.id === this.data.id)?.subscription ?? null;
      if (!l) {
        // Garaget har ingen licens än (den skapas när någon använder det): börja från planen.
        this.snack.open(
          'Garaget har ingen licens än. Den skapas första gången det används.',
          undefined,
          {
            duration: 4000,
          },
        );
        this.ref.close();
        return;
      }
      this.license.set(l);
      this.plan.set(l.plan);
      this.modes.set(
        Object.fromEntries(
          MODULE_INFO.map((m) => [
            m.id,
            l.removeModules.includes(m.id) ? 'off' : l.addModules.includes(m.id) ? 'on' : 'plan',
          ]),
        ),
      );
    });
  }

  /** Planen som är vald nu (inte bara den sparade) ger delen. */
  planGives(id: string): boolean {
    const l = this.license();
    if (!l) return false;
    // Planernas innehåll kommer från servern för den sparade planen; ett planbyte räknas efter spara.
    return l.planModules.includes(id);
  }

  set(id: string, mode: Mode) {
    this.modes.update((m) => ({ ...m, [id]: mode }));
  }

  save() {
    const m = this.modes();
    const ids = Object.keys(m);
    this.busy.set(true);
    this.api
      .save(this.data.id, {
        plan: this.plan(),
        addModules: ids.filter((i) => m[i] === 'on'),
        removeModules: ids.filter((i) => m[i] === 'off'),
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.snack.open('Sparat', undefined, { duration: 2000 });
          this.ref.close(true);
        },
        error: () => this.busy.set(false),
      });
  }
}
