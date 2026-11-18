import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';
import { AxleApi } from '../api/axle-api';
import type { Article } from '../models';
import { SharedModule } from '../../shared/shared-module';
import { isEan } from './code';

export interface ArticleLinkData {
  /** Koden som skannades: den sparas på artikeln man väljer. Utan kod väljer dialogen bara en artikel. */
  code?: string;
  title?: string;
  /** Det man söker på till en början, till exempel texten på en rad på ett papper. */
  query?: string;
  /** Troliga artiklar som visas överst, till exempel raderna på ordern varorna hör till. */
  suggestions?: Article[];
  /** Rubriken över förslagen. */
  suggestionsLabel?: string;
}

/**
 * Välj en artikel man redan har. Med en skannad kod (`code`) blir det att koppla koden till
 * artikeln: koden sparas på den och nästa skanning hittar artikeln av sig själv (en kartongs
 * streckkod, leverantörens nummer). Utan kod är det bara ett val, till exempel för en rad på ett
 * inläst papper. Svarar med artikeln.
 */
@Component({
  selector: 'app-article-link-dialog',
  standalone: true,
  imports: [SharedModule],
  template: `
    <h2 mat-dialog-title>
      {{ data.title ?? (data.code ? 'Koppla koden till en artikel' : 'Välj artikel') }}
    </h2>
    <mat-dialog-content class="flex flex-col gap-3">
      @if (data.code) {
        <p class="text-sm text-gray-600">
          Sök artikeln som <b class="font-mono">{{ data.code }}</b> sitter på. Nästa skanning hittar
          den av sig själv.
        </p>
      }
      @if (data.suggestions?.length) {
        <div>
          <div class="mb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase">
            {{ data.suggestionsLabel ?? 'Troliga' }}
          </div>
          <ul class="divide-y divide-gray-100 rounded-xl ring-1 ring-gray-200">
            @for (a of data.suggestions; track a.id) {
              <li>
                <button
                  type="button"
                  class="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left active:bg-gray-50"
                  [disabled]="saving()"
                  (click)="pick(a)"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-[15px] font-medium">{{ a.label }}</span>
                    <span class="block truncate text-xs text-gray-500">{{ detail(a) }}</span>
                  </span>
                  <mat-icon class="text-gray-400">chevron_right</mat-icon>
                </button>
              </li>
            }
          </ul>
        </div>
      }
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Sök artikel</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput [formControl]="query" autocomplete="off" />
      </mat-form-field>
      @if (searching()) {
        <p class="text-sm text-gray-500">Söker…</p>
      }
      <ul class="divide-y divide-gray-100">
        @for (a of results(); track a.id) {
          <li>
            <button
              type="button"
              class="flex min-h-14 w-full items-center gap-3 py-2 text-left active:bg-gray-50"
              [disabled]="saving()"
              (click)="pick(a)"
            >
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[15px] font-medium">{{ a.label }}</span>
                <span class="block truncate text-xs text-gray-500">{{ detail(a) }}</span>
              </span>
              <mat-icon class="text-gray-400">chevron_right</mat-icon>
            </button>
          </li>
        } @empty {
          @if (searched() && !searching()) {
            <li class="py-4 text-sm text-gray-500">Ingen artikel hittades.</li>
          }
        }
      </ul>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Avbryt</button>
    </mat-dialog-actions>
  `,
})
export class ArticleLinkDialog {
  readonly ref = inject<MatDialogRef<ArticleLinkDialog, Article>>(MatDialogRef);
  readonly data = inject<ArticleLinkData>(MAT_DIALOG_DATA);
  private readonly api = inject(AxleApi);

  readonly query = new FormControl('', { nonNullable: true });
  readonly results = signal<Article[]>([]);
  readonly searching = signal(false);
  readonly searched = signal(false);
  readonly saving = signal(false);

  constructor() {
    this.query.valueChanges
      .pipe(
        map((q) => q.trim()),
        distinctUntilChanged(),
        debounceTime(250),
        tap((q) => {
          this.searching.set(q.length >= 2);
          if (q.length < 2) {
            this.results.set([]);
            this.searched.set(false);
          }
        }),
        switchMap((q) =>
          q.length < 2
            ? of(null)
            : this.api.articles({ q, limit: 8 }).pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((page) => {
        this.searching.set(false);
        if (!page) return;
        this.results.set(page.items);
        this.searched.set(true);
      });
    if (this.data.query) this.query.setValue(this.data.query);
  }

  /** Nummer och lager under namnet, så rätt artikel går att skilja från lika namn. */
  detail(a: Article) {
    return [a.code, a.sku, a.quantity === 1 ? '1 i lager' : `${a.quantity} i lager`, a.location]
      .filter(Boolean)
      .join(' · ');
  }

  pick(a: Article) {
    if (!this.data.code) {
      this.ref.close(a);
      return;
    }
    this.saving.set(true);
    this.api
      .addArticleCode(a.id, this.data.code, isEan(this.data.code) ? 'barcode' : 'supplier')
      .subscribe({
        next: (saved) => this.ref.close(saved),
        error: () => this.saving.set(false),
      });
  }
}
