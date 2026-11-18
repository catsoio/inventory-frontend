import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import type { Article } from '../models';
import { SharedModule } from '../../shared/shared-module';
import { isEan, isOwnLabel } from './code';
import { ScanTile } from './scan-tile';

export interface UnknownCodeData {
  code: string;
}

/** Vad man valde: skanna igen, gå till en sida, eller koden blev kopplad till en artikel. */
export type UnknownCodeResult =
  | { kind: 'again' }
  | { kind: 'go'; commands: string[]; queryParams?: Record<string, string> }
  | { kind: 'linked'; article: Article };

/**
 * En kod ingen känner igen. I stället för "Hittar ingen träff" får man välja vad den är: en
 * artikel man redan har (då sparas koden på artikeln och nästa skanning hittar den), en ny artikel
 * med koden ifylld, eller skanna om. Våra egna etiketter (AO-…, DH-…) som saknar träff kan inte bli
 * en artikels kod, så där finns bara Skanna igen.
 */
@Component({
  selector: 'app-unknown-code-sheet',
  standalone: true,
  imports: [SharedModule, ScanTile],
  template: `
    <h2 mat-dialog-title>Okänd kod</h2>
    <mat-dialog-content class="flex flex-col gap-4">
      <div class="rounded-xl bg-gray-50 p-3">
        <div class="text-xs text-gray-500">Skannat</div>
        <div class="font-mono text-lg font-semibold break-all">{{ data.code }}</div>
        <p class="mt-1 text-sm text-gray-600">
          @if (own) {
            Det här ser ut som en av våra egna etiketter, men ingen med det numret finns.
          } @else {
            Ingen artikel har den här koden än.
          }
        </p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        @if (!own) {
          <button
            type="button"
            app-scan-tile
            icon="link"
            label="Koppla till artikel"
            sub="Då hittas den nästa gång"
            [primary]="true"
            (click)="link()"
          ></button>
          <button
            type="button"
            app-scan-tile
            icon="add_box"
            label="Ny artikel"
            sub="Med den här koden"
            (click)="newArticle()"
          ></button>
        }
        <button
          type="button"
          app-scan-tile
          icon="qr_code_scanner"
          label="Skanna igen"
          [primary]="own"
          (click)="ref.close({ kind: 'again' })"
        ></button>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Stäng</button>
    </mat-dialog-actions>
  `,
})
export class UnknownCodeSheet {
  readonly ref = inject<MatDialogRef<UnknownCodeSheet, UnknownCodeResult>>(MatDialogRef);
  readonly data = inject<UnknownCodeData>(MAT_DIALOG_DATA);
  private readonly dialog = inject(MatDialog);

  readonly own = isOwnLabel(this.data.code);

  async link() {
    const { ArticleLinkDialog } = await import('./article-link-dialog');
    const article = await firstValueFrom(
      this.dialog
        .open(ArticleLinkDialog, {
          width: '460px',
          maxWidth: '96vw',
          autoFocus: 'first-tabbable',
          data: { code: this.data.code },
        })
        .afterClosed(),
    );
    if (article) this.ref.close({ kind: 'linked', article });
  }

  /** En streckkod blir artikelns EAN; ett leverantörsnummer blir artikelnumret. */
  newArticle() {
    const key = isEan(this.data.code) ? 'ean' : 'sku';
    this.ref.close({
      kind: 'go',
      commands: ['/inventory/new'],
      queryParams: { [key]: this.data.code },
    });
  }
}
