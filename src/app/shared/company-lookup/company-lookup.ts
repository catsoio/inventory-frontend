import { Component, DestroyRef, OnInit, inject, input, model, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormGroup } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { catchError, debounceTime, filter, map, of, switchMap, tap } from 'rxjs';
import { WorkshopApi } from '../../core/api/workshop-api';
import type { CompanyInfo, CompanyLookup } from '../../core/models';
import { COMPANY_OWNED, CompanyField, fillCompany, listFields } from '../company-fill';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'found'; company: CompanyInfo; filled: CompanyField[]; differs: CompanyField[] }
  | { kind: 'problem'; text: string }
  | { kind: 'missing' }
  | { kind: 'unavailable' };

/** Hur länge man får vara tyst efter sista tecknet innan numret slås upp. */
const TYPING_PAUSE_MS = 600;

const PROBLEMS: Record<NonNullable<CompanyLookup['problem']>, string> = {
  format: 'Skriv organisationsnumret med tio siffror.',
  checksum: 'Kontrollsiffran stämmer inte. Kontrollera numret.',
};

const digitsOf = (v: unknown): string => String(v ?? '').replace(/\D/g, '');
/** Ett organisationsnummer är tio siffror; ett momsnummer (SE + nummer + 01) tolv. */
const plausible = (digits: string): boolean => digits.length === 10 || digits.length === 12;

/**
 * Fyller i ett företags uppgifter ur ett öppet företagsregister när man bara skrivit
 * organisationsnumret. Läggs på raden under organisationsnumrets fält i ett formulär som har ett
 * fält `orgNo` och några av `name`, `vatNumber`, `fTax`, `address`, `postalCode`, `city`, `phone`
 * och `email`; bara de som finns berörs.
 *
 * - När någon skriver ett komplett nummer slås det upp av sig själv och bara tomma fält fylls i:
 *   det någon skrivit lämnas, och skillnaden visas med en knapp som ersätter det med registrets.
 * - Ett nummer som redan står i formuläret slås upp med knappen "Hämta uppgifter".
 * - Ett uppslag är en extra väg. Går det inte, eller finns inget bolag, fyller man i för hand.
 *
 * Med `lock` (ett nytt kundkort) är företagets egna fält (`COMPANY_OWNED`) låsta: formuläret läser
 * `manual()` och gör dem skrivskyddade så länge det är falskt. Uppslaget ersätter dem då alltid,
 * och de töms när numret ändras så att de aldrig hör till ett annat nummer. "Fyll i för hand" sätter
 * `manual` och låser upp dem, för ett företag som registret inte känner.
 */
@Component({
  selector: 'app-company-lookup',
  imports: [MatButtonModule, MatIconModule],
  host: { '[class.block]': '!empty()', '[class.hidden]': 'empty()' },
  template: `
    @let s = state();
    @if (s.kind === 'idle') {
      @if (locking()) {
        <p class="flex flex-wrap items-center gap-x-2 text-sm text-gray-600">
          <mat-icon class="!h-5 !w-5 shrink-0 !text-xl text-gray-400">lock</mat-icon>
          Företagets uppgifter fylls i av organisationsnumret.
          @if (ready()) {
            <button mat-button type="button" (click)="fetch(false)">Hämta uppgifter</button>
          }
          <button mat-button type="button" (click)="enterManually()">Fyll i för hand</button>
        </p>
      } @else if (!empty()) {
        <button mat-button type="button" (click)="fetch(false)">
          <mat-icon>cloud_download</mat-icon> Hämta uppgifter
        </button>
      }
    } @else if (s.kind === 'loading') {
      <p class="flex items-center gap-2 text-sm text-gray-600">
        <mat-icon class="!h-5 !w-5 animate-spin !text-xl text-gray-400">progress_activity</mat-icon>
        Hämtar uppgifter…
      </p>
    } @else if (s.kind === 'found') {
      <div class="flex items-start gap-2 text-sm text-gray-600">
        <mat-icon
          class="!h-5 !w-5 shrink-0 !text-xl"
          [class]="s.company.active ? 'text-green-600' : 'text-amber-600'"
          >{{ s.company.active ? 'check_circle' : 'warning' }}</mat-icon
        >
        <div class="min-w-0 flex-1">
          <div class="font-medium text-gray-900">
            {{ s.company.name }}
            @if (s.company.form) {
              <span class="font-normal text-gray-600"> · {{ s.company.form }}</span>
            }
          </div>
          @if (!s.company.active) {
            <div class="text-amber-800">
              Bolaget är inte aktivt{{ s.company.statusNote ? ': ' + s.company.statusNote : '' }}.
            </div>
          }
          @if (s.filled.length) {
            <div>Fyllde i {{ list(s.filled) }}.</div>
          } @else if (!s.differs.length) {
            <div>Uppgifterna stämmer med registret.</div>
          }
          @if (s.differs.length) {
            <div>
              Registret har andra uppgifter för {{ list(s.differs) }}.
              <button mat-button type="button" (click)="replace()">
                Ersätt med registrets uppgifter
              </button>
            </div>
          }
          <div class="text-xs text-gray-500">Källa: Allabolag</div>
        </div>
      </div>
    } @else if (s.kind === 'problem') {
      <p class="flex flex-wrap items-center gap-x-2 text-sm text-gray-600">
        <mat-icon class="!h-5 !w-5 shrink-0 !text-xl text-amber-600">info</mat-icon>
        {{ s.text }}
        @if (locking()) {
          <button mat-button type="button" (click)="enterManually()">Fyll i för hand</button>
        }
      </p>
    } @else {
      <p class="flex flex-wrap items-center gap-x-2 text-sm text-gray-600">
        <mat-icon class="!h-5 !w-5 shrink-0 !text-xl text-gray-400">info</mat-icon>
        @if (s.kind === 'missing') {
          Hittade inget företag med det numret.
          @if (!locking()) {
            Fyll i uppgifterna för hand.
          }
        } @else {
          Kunde inte hämta uppgifter just nu.
          @if (!locking()) {
            Fyll i för hand.
          }
        }
        <button mat-button type="button" (click)="fetch(true)">Försök igen</button>
        @if (locking()) {
          <button mat-button type="button" (click)="enterManually()">Fyll i för hand</button>
        }
      </p>
    }
  `,
})
export class CompanyLookupStatus implements OnInit {
  private readonly api = inject(WorkshopApi);
  private readonly destroyRef = inject(DestroyRef);

  /** Formuläret med fältet `orgNo` och de fält som kan fyllas i. */
  readonly form = input.required<FormGroup>();
  /** Företagets egna fält är låsta tills de hämtats (ett nytt kundkort). */
  readonly lock = input(false);
  /** Användaren valde att fylla i för hand: de låsta fälten är upplåsta. */
  readonly manual = model(false);

  readonly state = signal<State>({ kind: 'idle' });
  /** Det som står i organisationsnumrets fält. */
  private readonly text = signal('');
  /** Siffrorna som senast slogs upp, så att samma nummer inte slås upp två gånger i rad. */
  private lastDigits = '';

  readonly list = listFields;

  /** De egna fälten är låsta och fylls bara av ett uppslag. */
  locking(): boolean {
    return this.lock() && !this.manual();
  }

  /** Det står ett komplett nummer i fältet. */
  ready(): boolean {
    return plausible(digitsOf(this.text()));
  }

  /** Inget att visa: inget komplett nummer att slå upp och ingen status att berätta om. */
  empty(): boolean {
    return this.state().kind === 'idle' && !this.locking() && !this.ready();
  }

  ngOnInit(): void {
    const ctrl = this.form().get('orgNo');
    if (!ctrl) return;
    this.text.set(String(ctrl.value ?? ''));
    // Det som stod i de låsta fälten har ingen källa (ett namn från en sökruta, ett förra uppslag).
    if (this.locking()) this.clearOwned();

    ctrl.valueChanges
      .pipe(
        tap((v) => {
          this.text.set(String(v ?? ''));
          if (digitsOf(v) !== this.lastDigits) {
            // Ett annat nummer än det som slogs upp: gammal status och gamla uppgifter ska inte
            // ligga kvar, och de låsta fälten ska aldrig höra till ett annat nummer.
            if (this.state().kind !== 'loading') this.state.set({ kind: 'idle' });
            if (this.locking()) this.clearOwned();
          }
        }),
        debounceTime(TYPING_PAUSE_MS),
        map((v) => digitsOf(v)),
        // Bara det någon skriver slås upp av sig själv, inte det som läses in när sidan öppnas.
        filter((d) => ctrl.dirty && plausible(d) && d !== this.lastDigits),
        tap(() => this.state.set({ kind: 'loading' })),
        switchMap(() => this.query(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((r) => this.apply(r));
  }

  fetch(refresh: boolean): void {
    this.state.set({ kind: 'loading' });
    this.query(refresh).subscribe((r) => this.apply(r));
  }

  /** Låser upp de egna fälten för ett företag som registret inte känner. */
  enterManually(): void {
    this.manual.set(true);
    this.state.set({ kind: 'idle' });
  }

  /** Ersätter det någon skrivit med registrets uppgifter. */
  replace(): void {
    const s = this.state();
    if (s.kind !== 'found') return;
    const r = fillCompany(this.form(), s.company, 'all');
    this.state.set({ ...s, filled: r.filled, differs: r.differs });
  }

  private clearOwned(): void {
    for (const f of COMPANY_OWNED) this.form().get(f)?.setValue('');
  }

  private query(refresh: boolean) {
    const value = String(this.form().get('orgNo')?.value ?? '');
    this.lastDigits = digitsOf(value);
    return this.api.lookupCompany(value, refresh).pipe(
      // Uppslaget är en extra väg: ett fel ska aldrig stoppa formuläret.
      catchError(() =>
        of<CompanyLookup>({ status: 'unavailable', company: null, problem: null }),
      ),
    );
  }

  private apply(r: CompanyLookup): void {
    if (r.status === 'found' && r.company) {
      const fill = fillCompany(this.form(), r.company, 'blank', this.locking() ? COMPANY_OWNED : []);
      this.state.set({ kind: 'found', company: r.company, ...fill });
    } else if (r.status === 'invalid') {
      this.state.set({ kind: 'problem', text: PROBLEMS[r.problem ?? 'format'] });
    } else if (r.status === 'not_found') {
      this.state.set({ kind: 'missing' });
    } else {
      this.state.set({ kind: 'unavailable' });
    }
  }
}
