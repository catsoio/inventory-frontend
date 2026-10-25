import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth } from '../../core/auth/auth';
import { CatalogApi } from '../../core/api/catalog-api';
import {
  ARTICLE_FIELD_LABELS,
  ArticleField,
  ArticleSpec,
  ArticleType,
  FIELD_MODE_LABELS,
  FieldMode,
  SPEC_LABELS,
} from '../../core/models';
import { Confirm } from '../../shared/confirm';
import { ensureValid } from '../../shared/form-guard';

/**
 * Kortet för en artikeltyp: namn, vilka mått artikelkortet frågar efter, och för varje fält om
 * det krävs, är valfritt eller döljs. En reservdel kräver artikelnummer; förbrukningsmaterial
 * kräver bara en benämning.
 */
@Component({
  selector: 'app-article-type-card',
  standalone: false,
  template: `
    <app-card-page
      listLink="/article-types"
      listLabel="Artikeltyper"
      newTitle="Ny artikeltyp"
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
            <input matInput formControlName="name" autocomplete="off" />
            <mat-error>Ange namn</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Mått på artikelkortet</mat-label>
            <mat-select formControlName="spec">
              @for (s of specs; track s[0]) {
                <mat-option [value]="s[0]">{{ s[1] }}</mat-option>
              }
            </mat-select>
            <mat-hint>Däck och fälgar har egna mått; övriga typer har inga</mat-hint>
          </mat-form-field>
        </section>

        <section class="rounded-xl bg-white p-5 shadow-sm" formGroupName="fields">
          <h2 class="mb-1 text-base font-semibold">Fält på artikelkortet</h2>
          <p class="mb-3 text-sm text-gray-600">
            Välj för varje fält om det måste fyllas i, är valfritt eller inte ska visas för den här
            typen. Benämning eller märke måste vara obligatoriskt, så att varje artikel går att
            känna igen.
          </p>
          <div class="grid max-w-xl grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2">
            @for (f of fieldKeys; track f) {
              <span>{{ fieldLabels[f] }}</span>
              <mat-button-toggle-group
                [formControlName]="f"
                hideSingleSelectionIndicator
                [attr.aria-label]="fieldLabels[f]"
              >
                @for (m of modes; track m[0]) {
                  <mat-button-toggle [value]="m[0]">{{ m[1] }}</mat-button-toggle>
                }
              </mat-button-toggle-group>
            }
          </div>
        </section>
      </form>
    </app-card-page>
  `,
})
export class ArticleTypeCard implements OnInit {
  private readonly auth = inject(Auth);
  readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();
  private readonly api = inject(CatalogApi);
  private readonly confirm = inject(Confirm);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');

  readonly fieldKeys = Object.keys(ARTICLE_FIELD_LABELS) as ArticleField[];
  readonly fieldLabels = ARTICLE_FIELD_LABELS;
  readonly modes = Object.entries(FIELD_MODE_LABELS) as [FieldMode, string][];
  readonly specs = Object.entries(SPEC_LABELS) as [ArticleSpec, string][];
  readonly busy = signal(false);
  readonly card = signal<ArticleType | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', Validators.required],
    spec: ['none' as ArticleSpec],
    fields: inject(FormBuilder).nonNullable.group({
      brand: ['optional' as FieldMode],
      model: ['required' as FieldMode],
      sku: ['optional' as FieldMode],
      supplier: ['optional' as FieldMode],
      warehouse: ['optional' as FieldMode],
    }),
  });

  ngOnInit() {
    if (!this.admin) this.form.disable();
    if (this.id) this.load();
  }

  private load() {
    this.api.articleTypes(true).subscribe((all) => {
      const t = all.find((x) => x.id === this.id);
      if (!t) {
        void this.router.navigate(['/article-types']);
        return;
      }
      this.card.set(t);
      this.form.reset({ name: t.name, spec: t.spec, fields: t.fields });
    });
  }

  hasUnsaved() {
    return this.form.dirty;
  }

  save() {
    if (!ensureValid(this.form, this.snack)) return;
    const v = this.form.getRawValue();
    this.busy.set(true);
    const req = this.id ? this.api.updateArticleType(this.id, v) : this.api.createArticleType(v);
    req.subscribe({
      next: (t) => {
        this.busy.set(false);
        this.snack.open('Sparat', undefined, { duration: 2000 });
        this.form.markAsPristine();
        if (this.id) this.load();
        else void this.router.navigate(['/article-types', t.id]);
      },
      error: () => this.busy.set(false),
    });
  }

  remove() {
    const t = this.card()!;
    this.confirm
      .ask({
        title: `Ta bort ${t.name}?`,
        message: 'Används typen av artiklar arkiveras den i stället, så artiklarna ligger kvar.',
        confirmText: 'Ta bort',
        danger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.removeArticleType(t.id).subscribe((a) => {
          if (!a.archived) {
            this.form.markAsPristine();
            void this.router.navigate(['/article-types']);
            return;
          }
          this.snack.open('Används av artiklar och arkiverades', undefined, { duration: 3000 });
          this.load();
        });
      });
  }

  restore() {
    this.api.updateArticleType(this.id!, { active: true }).subscribe(() => this.load());
  }
}
