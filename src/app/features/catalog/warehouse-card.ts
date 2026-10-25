import { Component, OnInit, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth } from '../../core/auth/auth';
import { CatalogApi } from '../../core/api/catalog-api';
import { WAREHOUSE_KIND_LABELS, Warehouse, WarehouseKind } from '../../core/models';
import { Confirm } from '../../shared/confirm';
import { ensureValid } from '../../shared/form-guard';

/**
 * Kortet för ett lager: namn, om det är eget lager eller kundgods, och dess platser (hyllor,
 * rum). Artiklarna pekar på lager och plats med två rullistor. En plats med artiklar kan inte
 * tas bort; byter man namn följer artiklarna med.
 */
@Component({
  selector: 'app-warehouse-card',
  standalone: false,
  template: `
    <app-card-page
      listLink="/warehouses"
      listLabel="Lager"
      newTitle="Nytt lager"
      [title]="card()?.name ?? ''"
      [code]="card()?.code ?? null"
      [archived]="!!card() && !card()!.active"
    >
      <div actions class="flex items-center gap-2">
        @if (card(); as c) {
          @if (admin) {
            @if (c.active) {
              <button
 mat-icon-button
 class="!text-red-700"
 aria-label="Ta bort"
 matTooltip="Ta bort"
 (click)="remove()"
 >
 <mat-icon>delete_outline</mat-icon>
 </button>
            } @else {
              <button mat-stroked-button (click)="restore()">Återställ</button>
            }
          }
        }
        @if (admin) {
          <button mat-flat-button color="primary" (click)="save()" [disabled]="busy()">
            Spara
          </button>
        }
      </div>

      <form [formGroup]="form" class="flex flex-col gap-4">
        <section class="grid gap-x-4 rounded-xl bg-white p-5 shadow-sm sm:grid-cols-2">
          <mat-form-field>
            <mat-label>Namn</mat-label>
            <input
              matInput
              formControlName="name"
              autocomplete="off"
              placeholder="t.ex. Däckhotellet"
            />
            <mat-error>Ange namn</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Typ</mat-label>
            <mat-select formControlName="kind">
              @for (k of kinds; track k[0]) {
                <mat-option [value]="k[0]">{{ k[1] }}</mat-option>
              }
            </mat-select>
            <mat-hint>Kundgods kan inte innehålla artiklar att sälja</mat-hint>
          </mat-form-field>
          <mat-form-field class="sm:col-span-2">
            <mat-label>Anteckning</mat-label>
            <input matInput formControlName="notes" />
          </mat-form-field>
        </section>

        <section class="rounded-xl bg-white p-5 shadow-sm">
          <div class="mb-2 flex items-center gap-2">
            <h2 class="flex-1 text-base font-semibold">Platser</h2>
            @if (admin) {
              <button mat-stroked-button type="button" (click)="addPlace()">
                <mat-icon>add</mat-icon> Ny plats
              </button>
              <button mat-stroked-button type="button" (click)="addMany()">
                <mat-icon>playlist_add</mat-icon> Flera på en gång
              </button>
            }
          </div>
          <p class="mb-3 text-sm text-gray-600">
            Hyllor, rum eller rader i lagret, t.ex. "Hylla B3" eller "Rum 2 · Rad 4".
          </p>
          <div formArrayName="locations" class="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-3">
            @for (p of places.controls; track p; let i = $index) {
              <div [formGroupName]="i" class="flex items-start gap-1">
                <mat-form-field class="flex-1" subscriptSizing="dynamic">
                  <mat-label>Plats</mat-label>
                  <input matInput formControlName="name" autocomplete="off" />
                </mat-form-field>
                @if (admin) {
                  <button
                    mat-icon-button
                    type="button"
                    (click)="removePlace(i)"
                    aria-label="Ta bort platsen"
                  >
                    <mat-icon>close</mat-icon>
                  </button>
                }
              </div>
            } @empty {
              <p class="text-sm text-gray-500 sm:col-span-3">Inga platser än.</p>
            }
          </div>
          @if (many()) {
            <div class="mt-3">
              <mat-form-field class="w-full">
                <mat-label>En plats per rad</mat-label>
                <textarea matInput rows="5" #bulk></textarea>
              </mat-form-field>
              <button
                mat-flat-button
                color="primary"
                type="button"
                (click)="applyMany(bulk.value); bulk.value = ''"
              >
                Lägg till
              </button>
            </div>
          }
        </section>
      </form>
    </app-card-page>
  `,
})
export class WarehouseCard implements OnInit {
  private readonly auth = inject(Auth);
  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  private readonly api = inject(CatalogApi);
  private readonly confirm = inject(Confirm);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');

  readonly kinds = Object.entries(WAREHOUSE_KIND_LABELS) as [WarehouseKind, string][];
  readonly busy = signal(false);
  readonly many = signal(false);
  readonly card = signal<Warehouse | null>(null);

  readonly places = this.fb.array<FormGroup>([]);
  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    kind: ['own' as WarehouseKind],
    notes: [''],
    locations: this.places as FormArray,
  });

  ngOnInit() {
    if (!this.admin) this.form.disable();
    if (this.id) this.load();
  }

  private place(id: string | null = null, name = '') {
    return this.fb.nonNullable.group({ id: [id], name: [name, Validators.required] });
  }

  addPlace() {
    this.places.push(this.place());
    this.form.markAsDirty();
  }

  addMany() {
    this.many.update((m) => !m);
  }

  applyMany(text: string) {
    const known = new Set(this.places.controls.map((p) => String(p.value.name).toLowerCase()));
    for (const name of text
      .split(/\r?\n/)
      .map((t) => t.trim())
      .filter(Boolean)) {
      if (known.has(name.toLowerCase())) continue;
      known.add(name.toLowerCase());
      this.places.push(this.place(null, name));
    }
    this.many.set(false);
    this.form.markAsDirty();
  }

  removePlace(i: number) {
    this.places.removeAt(i);
    this.form.markAsDirty();
  }

  private load() {
    this.api.warehouses(true).subscribe((all) => {
      const w = all.find((x) => x.id === this.id);
      if (!w) {
        void this.router.navigate(['/warehouses']);
        return;
      }
      this.card.set(w);
      this.places.clear();
      for (const l of w.locations) this.places.push(this.place(l.id, l.name));
      this.form.reset({ name: w.name, kind: w.kind, notes: w.notes ?? '' });
      if (!this.admin) this.form.disable();
    });
  }

  hasUnsaved() {
    return this.form.dirty;
  }

  save() {
    if (!ensureValid(this.form, this.snack)) return;
    const v = this.form.getRawValue();
    const body = {
      name: v.name,
      kind: v.kind,
      notes: v.notes || null,
      locations: (v.locations as { id: string | null; name: string }[]).map((p) => ({
        ...(p.id ? { id: p.id } : {}),
        name: p.name,
      })),
    };
    this.busy.set(true);
    const req = this.id
      ? this.api.updateWarehouse(this.id, body as never)
      : this.api.createWarehouse(body as never);
    req.subscribe({
      next: (w) => {
        this.busy.set(false);
        this.snack.open('Sparat', undefined, { duration: 2000 });
        this.form.markAsPristine();
        if (this.id) this.load();
        else void this.router.navigate(['/warehouses', w.id]);
      },
      error: () => this.busy.set(false),
    });
  }

  remove() {
    const w = this.card()!;
    this.confirm
      .ask({
        title: `Ta bort ${w.name}?`,
        message: 'Finns artiklar i lagret arkiveras det i stället, så artiklarna ligger kvar.',
        confirmText: 'Ta bort',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.removeWarehouse(w.id).subscribe((a) => {
          if (!a.archived) {
            this.form.markAsPristine();
            void this.router.navigate(['/warehouses']);
            return;
          }
          this.snack.open('Det finns artiklar i lagret, så det arkiverades', undefined, {
            duration: 3000,
          });
          this.load();
        });
      });
  }

  restore() {
    this.api.updateWarehouse(this.id!, { active: true }).subscribe(() => this.load());
  }
}
