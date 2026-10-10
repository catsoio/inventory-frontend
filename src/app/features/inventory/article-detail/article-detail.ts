import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { InventoryApi } from '../../../core/api/inventory-api';
import { Auth } from '../../../core/auth/auth';
import { PageTitle } from '../../../core/page-title';
import {
  Article,
  CATEGORY_LABELS,
  RIM_MATERIAL_LABELS,
  SEASON_LABELS,
  StockAction,
  itemKind,
} from '../../../core/models';
import { KrPipe } from '../../../shared/kr-pipe';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { StockActionDialog } from '../stock-action-dialog/stock-action-dialog';

type Field = [label: string, value: string | number];

@Component({
  selector: 'app-article-detail',
  standalone: false,
  template: `
    @if (a(); as a) {
      <div class="mb-1 text-sm text-gray-500">
        <a routerLink="/inventory" class="text-brand underline">Artiklar</a> /
        {{ a.sku || a.sizeLabel || a.label }}
      </div>
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <app-item-icon [kind]="kind(a)" />
        <h1 class="text-2xl font-semibold">
          @if (a.sizeLabel) {
            {{ a.sizeLabel }} ·
          }
          {{ a.brand }} {{ a.model }}
        </h1>
        <app-stock-badge [level]="a.stockLevel" />
        @if (!a.active) {
          <span class="rounded-full bg-gray-200 px-3 py-1 text-sm">Arkiverad</span>
        }
      </div>

      <div
        class="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-white shadow-sm p-2"
      >
        @if (a.active) {
          <button mat-flat-button (click)="act('receive')">
            <mat-icon>add_box</mat-icon> Inköp
          </button>
          <button mat-flat-button (click)="act('sell')"><mat-icon>sell</mat-icon> Sälj</button>
          <button mat-stroked-button (click)="act('return')">
            <mat-icon>undo</mat-icon> Retur
          </button>
          <button mat-stroked-button color="warn" (click)="act('write-off')">
            <mat-icon>delete_sweep</mat-icon> Kassera
          </button>
          <button mat-stroked-button (click)="act('adjust')">
            <mat-icon>fact_check</mat-icon> Räkna om
          </button>
          <span class="mx-1 hidden h-6 border-l sm:block"></span>
        }
        <a mat-button routerLink="edit"><mat-icon>edit</mat-icon> Ändra</a>
        @if (admin && a.active) {
          <button mat-button color="warn" (click)="archive(a)">
            <mat-icon>archive</mat-icon> Arkivera
          </button>
        }
        @if (admin && !a.active) {
          <button mat-button (click)="restore(a)"><mat-icon>unarchive</mat-icon> Återställ</button>
        }
      </div>

      <div class="flex gap-6">
        <div class="flex min-w-0 flex-1 flex-col gap-4">
          @for (s of sections(a); track s.title) {
            <details open class="rounded-xl bg-white shadow-sm">
              <summary class="cursor-pointer px-5 py-4 font-semibold select-none">
                {{ s.title }}
              </summary>
              <dl
                class="grid grid-cols-1 gap-x-10 gap-y-1 px-5 pb-5 sm:grid-cols-2 2xl:grid-cols-3"
              >
                @for (f of s.fields; track f[0]) {
                  <div class="flex items-baseline justify-between gap-4 py-1.5">
                    <dt class="text-sm text-gray-500">{{ f[0] }}</dt>
                    <dd class="text-right font-medium">{{ f[1] }}</dd>
                  </div>
                }
              </dl>
            </details>
          }
          <details open class="rounded-xl bg-white shadow-sm">
            <summary class="cursor-pointer px-5 py-4 font-semibold select-none">
              Lagerhändelser
            </summary>
            <div class="p-4">
              <app-movement-list
                [articleId]="a.id"
                [pageSize]="25"
                scrollClass="max-h-96"
                [reloadKey]="a.quantity"
              />
            </div>
          </details>
        </div>

        <aside class="hidden w-80 shrink-0 flex-col gap-4 xl:flex">
          <mat-card class="p-4">
            <div class="text-sm text-gray-500">Lagersaldo</div>
            <div class="text-5xl font-bold">
              {{ a.quantity }} <span class="text-lg font-normal">st</span>
            </div>
            <mat-progress-bar
              class="mt-3"
              mode="determinate"
              [value]="fill(a)"
              [color]="a.stockLevel === 'in_stock' ? 'primary' : 'warn'"
            />
            <div class="mt-1 text-xs text-gray-500">Beställningspunkt: {{ a.reorderLevel }} st</div>
          </mat-card>
          <mat-card class="p-4">
            <div class="mb-2 font-semibold">Nyckeltal</div>
            <div class="flex justify-between py-1">
              <span class="text-gray-500">Lagervärde</span><b>{{ a.stockValue | kr }}</b>
            </div>
            <div class="flex justify-between py-1">
              <span class="text-gray-500">Marginal/st</span><b>{{ a.margin | kr }}</b>
            </div>
            <div class="flex justify-between py-1">
              <span class="text-gray-500">Marginal</span
              ><b>{{
                a.marginPercent == null ? '–' : (a.marginPercent | number: '1.0-1') + ' %'
              }}</b>
            </div>
          </mat-card>
          <mat-card class="p-4">
            <div class="mb-1 font-semibold">Senaste händelser</div>
            <app-movement-list
              [articleId]="a.id"
              [compact]="true"
              [pageSize]="6"
              [reloadKey]="a.quantity"
            />
          </mat-card>
        </aside>
      </div>
    } @else {
      <mat-progress-bar mode="indeterminate" />
    }
  `,
})
export class ArticleDetail {
  private readonly api = inject(InventoryApi);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly kr = new KrPipe();
  private readonly pageTitle = inject(PageTitle);

  readonly admin = inject(Auth).isAdmin();
  readonly a = signal<Article | null>(null);
  readonly kind = (a: Article) => itemKind(a.category);

  constructor() {
    this.api.article(this.id).subscribe((x) => {
      this.a.set(x);
      this.pageTitle.page.set(x.label);
    });
  }

  fill(a: Article) {
    const target = Math.max(a.reorderLevel * 2, 1);
    return Math.min(100, (a.quantity / target) * 100);
  }

  sections(a: Article): { title: string; fields: Field[] }[] {
    const kr = (o: number) => this.kr.transform(o);
    const spec: Field[] = [];
    const t = a.tyre;
    const r = a.rim;
    if (t) {
      spec.push(
        ['Storlek', t.sizeLabel ?? ''],
        ['Säsong', SEASON_LABELS[t.season] + (t.studded ? ' (dubb)' : '')],
        ['Last/hastighet', `${t.loadIndex ?? '–'}${t.speedIndex ?? ''}`],
        ['Runflat', t.runFlat ? 'Ja' : 'Nej'],
        ['DOT', t.dot || '–'],
      );
    }
    if (r) {
      spec.push(
        ['Mått', r.sizeLabel ?? ''],
        ['Diameter', `${r.diameter}"`],
        ['Bredd', `${r.width}J`],
        ['Bultmönster', `${r.boltCount}x${r.boltCircle}`],
        ['Offset', `ET${r.offset}`],
        ['Centrumhål', r.centerBore != null ? `${r.centerBore} mm` : '–'],
        ['Material', RIM_MATERIAL_LABELS[r.material]],
        ['Färg', r.color || '–'],
      );
    }
    return [
      {
        title: 'Artikel',
        fields: [
          ['Typ', CATEGORY_LABELS[a.category]],
          ['Artikelnummer', a.sku || '–'],
          ['Märke', a.brand],
          ['Modell', a.model],
          ...spec,
        ],
      },
      {
        title: 'Lagersaldo',
        fields: [
          ['Lager', `${a.quantity} st`],
          ['Hyllplats', a.location || '–'],
          ['Beställningspunkt', a.reorderLevel],
          [
            'Senaste inköp',
            a.lastPurchasedAt ? new Date(a.lastPurchasedAt).toLocaleDateString('sv-SE') : '–',
          ],
        ],
      },
      {
        title: 'Kostnader och prissättning',
        fields: [
          ['Inköpspris (snitt)', kr(a.averageCost)],
          ['Försäljningspris', kr(a.sellPrice)],
          ['Marginal', kr(a.margin)],
          [
            'Marginal %',
            a.marginPercent == null
              ? '–'
              : `${a.marginPercent.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} %`,
          ],
          ['Lagervärde', kr(a.stockValue)],
        ],
      },
      {
        title: 'Leverantör och anteckningar',
        fields: [
          ['Leverantör', a.supplier || '–'],
          ['Anteckningar', a.notes || '–'],
        ],
      },
    ];
  }

  act(action: StockAction) {
    this.dialog
      .open<StockActionDialog, unknown, Article>(StockActionDialog, {
        data: { article: this.a(), action },
        width: '420px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((u) => {
        if (u) {
          this.a.set(u);
          this.snack.open('Sparat', undefined, { duration: 2500 });
        }
      });
  }

  archive(a: Article) {
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: 'Arkivera artikel?',
          message: `${a.label} arkiveras och döljs i lagret.`,
          confirmText: 'Arkivera',
          danger: true,
        },
      })
      .afterClosed()
      .subscribe(
        (ok) =>
          ok &&
          this.api.archiveArticle(a.id).subscribe(() => this.router.navigateByUrl('/inventory')),
      );
  }

  restore(a: Article) {
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: 'Återställ artikel?',
          message: `${a.label} blir aktiv igen.`,
          confirmText: 'Återställ',
        },
      })
      .afterClosed()
      .subscribe((ok) => ok && this.api.restoreArticle(a.id).subscribe((x) => this.a.set(x)));
  }
}
