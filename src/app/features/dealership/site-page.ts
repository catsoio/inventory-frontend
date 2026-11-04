import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Auth } from '../../core/auth/auth';
import { SiteApi } from '../../core/api/car-api';
import { SiteDomain, SiteSettings } from '../../core/models';
import { HasUnsaved } from '../../core/unsaved-guard';

type ApiError = { status?: number; error?: { error?: { message?: string } } };

const STATUS_TEXT: Record<SiteDomain['status'], string> = {
  pending: 'Väntar på DNS',
  active: 'Igång',
  error: 'Fel',
};

/**
 * Verkstadens webbplats (bilarna till salu): ägaren skriver rubrik och välkomsttext. Adress,
 * på/av och domäner sätter Catso åt verkstaden (superadmin): vi köper eller tar emot domänen,
 * kopplar den och talar om vilka DNS-poster som ska skapas. Ägaren ser bara hur det går.
 */
@Component({
  selector: 'app-site-page',
  standalone: false,
  template: `
    <app-card-page
      listLink="/dealership"
      listLabel="Bilhandel"
      newTitle="Webbplats"
      title="Webbplats"
    >
      <div actions>
        <button
          mat-flat-button
          color="primary"
          (click)="save()"
          [disabled]="busy() || form.pristine"
        >
          Spara
        </button>
      </div>

      @if (site(); as s) {
        <section class="rounded-xl bg-white p-5 shadow-sm">
          <div class="mb-2 flex flex-wrap items-center gap-3">
            <h2 class="flex-1 text-base font-semibold">Så når kunderna er webbplats</h2>
            <span
              class="rounded-full px-2.5 py-0.5 text-xs font-medium"
              [class]="s.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'"
            >
              {{ s.enabled ? 'Påslagen' : 'Inte påslagen' }}
            </span>
          </div>
          @if (!s.enabled) {
            <p class="text-sm text-gray-600">
              Sidan är inte påslagen än. Hör av dig till Catso, så kopplar vi er domän och slår på
              den åt er.
            </p>
          }
          <ul class="mt-2 flex flex-col gap-1.5 text-sm">
            @for (d of s.domains; track d.hostname) {
              <li class="flex flex-wrap items-center gap-2">
                <mat-icon class="!h-5 !w-5 !text-xl text-gray-500">language</mat-icon>
                @if (d.status === 'active') {
                  <a
                    class="underline"
                    [href]="'https://' + d.hostname"
                    target="_blank"
                    rel="noopener"
                    >{{ d.hostname }}</a
                  >
                } @else {
                  <span>{{ d.hostname }}</span>
                }
                <app-pill
                  [tone]="d.status === 'active' ? 'green' : d.status === 'error' ? 'red' : 'amber'"
                  >{{ statusText[d.status] }}</app-pill
                >
              </li>
            }
            @if (s.path) {
              <li class="flex flex-wrap items-center gap-2">
                <mat-icon class="!h-5 !w-5 !text-xl text-gray-500">link</mat-icon>
                <a class="underline" [href]="s.path" target="_blank" rel="noopener"
                  >{{ origin }}{{ s.path }}</a
                >
              </li>
            }
          </ul>
        </section>

        @for (d of s.domains; track d.hostname) {
          @if (d.status !== 'active') {
            <section class="rounded-xl bg-amber-50 p-5 text-sm text-amber-950 shadow-sm">
              <h2 class="mb-1 text-base font-semibold">{{ d.hostname }}: det här återstår</h2>
              @if (d.error) {
                <p class="mb-2 text-red-800">{{ d.error }}</p>
              }
              <p class="mb-2">
                Skapa de här posterna hos den som har domänens DNS. Det kan ta en stund innan de
                gäller; tryck sedan på Kontrollera.
              </p>
              <div class="overflow-x-auto">
                <table class="w-full text-left">
                  <thead class="text-xs text-amber-800 uppercase">
                    <tr>
                      <th class="pr-4">Typ</th>
                      <th class="pr-4">Namn</th>
                      <th>Värde</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of d.records; track r.type + r.name) {
                      <tr>
                        <td class="pr-4 font-mono">{{ r.type }}</td>
                        <td class="pr-4 font-mono break-all">{{ r.name }}</td>
                        <td class="font-mono break-all">{{ r.value }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="mt-3 flex gap-2">
                <button
                  mat-stroked-button
                  type="button"
                  (click)="check(d.hostname)"
                  [disabled]="busy()"
                >
                  <mat-icon>refresh</mat-icon> Kontrollera
                </button>
              </div>
            </section>
          }
        }

        <form [formGroup]="form" class="rounded-xl bg-white p-5 shadow-sm">
          <h2 class="mb-3 text-base font-semibold">Texten på sidan</h2>
          <mat-form-field class="w-full">
            <mat-label>Rubrik (tom = företagets namn)</mat-label>
            <input matInput formControlName="title" maxlength="80" />
          </mat-form-field>
          <mat-form-field class="w-full">
            <mat-label>Välkomsttext (valfri)</mat-label>
            <textarea matInput rows="3" maxlength="600" formControlName="intro"></textarea>
          </mat-form-field>
          @if (error(); as e) {
            <p class="text-sm text-red-700">{{ e }}</p>
          }
        </form>

        @if (operator) {
          <section class="rounded-xl border border-dashed border-gray-300 bg-white p-5">
            <h2 class="mb-1 text-base font-semibold">Catso: adress och domäner</h2>
            <p class="mb-3 text-sm text-gray-600">
              Syns bara för plattformens operatörer och gäller bolaget du är i.
            </p>
            <form [formGroup]="admin" class="flex flex-col gap-3">
              <mat-slide-toggle formControlName="enabled">Påslagen</mat-slide-toggle>
              <label class="flex flex-col gap-0.5 text-xs text-gray-500"
                >Adress på catso.io
                <span class="flex items-center gap-2">
                  <span class="text-sm text-gray-500">{{ origin }}/bilhandel/</span>
                  <input
                    formControlName="slug"
                    maxlength="60"
                    placeholder="dackmaster"
                    class="h-10 min-w-0 flex-1 px-2 text-sm text-gray-900 field"
                  />
                </span>
              </label>
              <div>
                <button
                  mat-stroked-button
                  type="button"
                  (click)="saveAdmin()"
                  [disabled]="busy() || admin.pristine"
                >
                  Spara adress
                </button>
              </div>
            </form>
            <h3 class="sec mt-5">Domäner</h3>
            <div class="flex items-center gap-2">
              <input
                [formControl]="newDomain"
                placeholder="dackmaster.se"
                autocomplete="off"
                (keydown.enter)="addDomain()"
                class="h-10 min-w-0 flex-1 px-2 text-sm text-gray-900 field"
              />
              <button
                mat-flat-button
                color="primary"
                type="button"
                (click)="addDomain()"
                [disabled]="busy() || newDomain.value.trim().length < 4"
              >
                Koppla domän
              </button>
            </div>
            @for (d of s.domains; track d.hostname) {
              <div class="mt-2 flex items-center gap-2 text-sm">
                <span class="flex-1">{{ d.hostname }}</span>
                <button
                  mat-button
                  type="button"
                  class="!text-red-700"
                  (click)="removeDomain(d.hostname)"
                >
                  Ta bort
                </button>
              </div>
            }
            @if (adminError(); as e) {
              <p class="mt-2 text-sm text-red-700">{{ e }}</p>
            }
          </section>
        }
      }
    </app-card-page>
  `,
})
export class SitePage implements OnInit, HasUnsaved {
  private readonly api = inject(SiteApi);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  readonly operator = inject(Auth).isSuperAdmin();

  readonly origin = globalThis.location?.origin ?? '';
  readonly statusText = STATUS_TEXT;
  readonly site = signal<SiteSettings | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly adminError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({ title: '', intro: '' });
  readonly admin = this.fb.nonNullable.group({ enabled: false, slug: '' });
  readonly newDomain = this.fb.nonNullable.control('');

  ngOnInit() {
    this.api.get().subscribe((s) => this.load(s));
  }

  hasUnsaved() {
    return this.form.dirty;
  }

  private load(s: SiteSettings, keepText = false) {
    this.site.set(s);
    if (!keepText) this.form.reset({ title: s.title ?? '', intro: s.intro ?? '' });
    this.admin.reset({ enabled: s.enabled, slug: s.slug ?? '' });
  }

  save() {
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.api.save({ title: v.title.trim() || null, intro: v.intro.trim() || null }).subscribe({
      next: (s) => {
        this.busy.set(false);
        this.load(s);
        this.snack.open('Sparat', undefined, { duration: 2000 });
      },
      error: (e: ApiError) => {
        this.busy.set(false);
        this.error.set(e.error?.error?.message ?? 'Det gick inte att spara.');
      },
    });
  }

  /** Körs av operatören: adress och på/av. */
  saveAdmin() {
    const v = this.admin.getRawValue();
    this.run(this.api.save({ enabled: v.enabled, slug: v.slug.trim() || null }), (e) =>
      e.status === 409 ? 'Den adressen används redan. Välj en annan.' : null,
    );
  }

  addDomain() {
    const host = this.newDomain.value.trim();
    if (host.length < 4) return;
    this.run(
      this.api.addDomain(host),
      (e) => (e.status === 409 ? 'Den domänen är redan kopplad till en annan webbplats.' : null),
      () => this.newDomain.reset(''),
    );
  }

  check(hostname: string) {
    this.run(this.api.checkDomain(hostname));
  }

  removeDomain(hostname: string) {
    this.run(this.api.removeDomain(hostname));
  }

  private run(
    call: ReturnType<SiteApi['get']>,
    explain: (e: ApiError) => string | null = () => null,
    done?: () => void,
  ) {
    this.busy.set(true);
    this.adminError.set(null);
    call.subscribe({
      next: (s) => {
        this.busy.set(false);
        // Texten ägaren skriver (och inte sparat) ska inte skrivas över av en domänkoll.
        this.load(s, this.form.dirty);
        done?.();
      },
      error: (e: ApiError) => {
        this.busy.set(false);
        this.adminError.set(explain(e) ?? e.error?.error?.message ?? 'Det gick inte.');
      },
    });
  }
}
