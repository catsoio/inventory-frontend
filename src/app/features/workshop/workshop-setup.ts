import { Component, OnInit, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { forkJoin } from 'rxjs';
import { Archived, WorkshopApi } from '../../core/api/workshop-api';
import { RESOURCE_KIND_LABELS, Resource, ServiceType } from '../../core/models';
import { WorkshopItemDialog, WorkshopItemData } from './workshop-item-dialog';

@Component({
  selector: 'app-workshop-setup',
  standalone: false,
  template: `
    <div class="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 class="text-2xl font-semibold">Mekaniker och åtgärder</h1>
      <p class="text-sm text-gray-600">
        Det du lägger in här dyker upp som val när du bokar en tid. En post som redan används i en
        bokning arkiveras i stället för att tas bort, så historiken ligger kvar.
      </p>

      <section class="rounded-xl bg-white p-4 shadow-sm">
        <div class="mb-2 flex items-center">
          <h2 class="flex-1 text-lg font-semibold">Mekaniker och platser</h2>
          <button mat-stroked-button (click)="add('resource')"><mat-icon>add</mat-icon> Ny</button>
        </div>
        @for (r of resources(); track r.id) {
          <div
            class="flex items-center gap-3 border-t border-gray-100 py-2"
            [class.opacity-50]="!r.active"
          >
            <span class="h-4 w-4 rounded-full" [style.background]="r.color"></span>
            <span class="flex-1">{{ r.name }}</span>
            <span class="text-sm text-gray-500"
              >{{ kinds[r.kind] }}{{ r.active ? '' : ' · arkiverad' }}</span
            >
            <button
              mat-icon-button
              (click)="edit({ kind: 'resource', item: r })"
              aria-label="Ändra"
            >
              <mat-icon>edit</mat-icon>
            </button>
            @if (r.active) {
              <button mat-icon-button (click)="removeResource(r)" aria-label="Ta bort">
                <mat-icon>delete_outline</mat-icon>
              </button>
            } @else {
              <button
                mat-icon-button
                (click)="restore(api.updateResource(r.id, { active: true }))"
                aria-label="Återställ"
              >
                <mat-icon>restore_from_trash</mat-icon>
              </button>
            }
          </div>
        } @empty {
          <p class="text-sm text-gray-500">Inga än. Lägg till de som jobbar hos er.</p>
        }
      </section>

      <section class="rounded-xl bg-white p-4 shadow-sm">
        <div class="mb-2 flex items-center">
          <h2 class="flex-1 text-lg font-semibold">Åtgärder</h2>
          <button mat-stroked-button (click)="add('service')"><mat-icon>add</mat-icon> Ny</button>
        </div>
        @for (t of services(); track t.id) {
          <div
            class="flex items-center gap-3 border-t border-gray-100 py-2"
            [class.opacity-50]="!t.active"
          >
            <span class="flex-1">{{ t.name }}</span>
            <span class="text-sm text-gray-500">
              {{ t.durationMinutes }} min
              @if (t.priceFrom !== null) {
                · {{ t.priceFrom | kr
                }}{{
                  t.priceTo !== null && t.priceTo !== t.priceFrom ? '–' + (t.priceTo | kr) : ''
                }}
              }
              {{ t.active ? '' : ' · arkiverad' }}
            </span>
            <button mat-icon-button (click)="edit({ kind: 'service', item: t })" aria-label="Ändra">
              <mat-icon>edit</mat-icon>
            </button>
            @if (t.active) {
              <button mat-icon-button (click)="removeService(t)" aria-label="Ta bort">
                <mat-icon>delete_outline</mat-icon>
              </button>
            } @else {
              <button
                mat-icon-button
                (click)="restore(api.updateServiceType(t.id, { active: true }))"
                aria-label="Återställ"
              >
                <mat-icon>restore_from_trash</mat-icon>
              </button>
            }
          </div>
        } @empty {
          <p class="text-sm text-gray-500">Inga än, t.ex. Däckbyte, Service, Hjulinställning.</p>
        }
      </section>
    </div>
  `,
})
export class WorkshopSetup implements OnInit {
  readonly api = inject(WorkshopApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly kinds = RESOURCE_KIND_LABELS;
  readonly resources = signal<Resource[]>([]);
  readonly services = signal<ServiceType[]>([]);

  ngOnInit() {
    this.load();
  }

  private load() {
    forkJoin([this.api.resources(true), this.api.serviceTypes(true)]).subscribe(([r, s]) => {
      this.resources.set(r);
      this.services.set(s);
    });
  }

  add(kind: 'resource' | 'service') {
    this.edit({ kind } as WorkshopItemData);
  }

  edit(data: WorkshopItemData) {
    this.dialog
      .open<WorkshopItemDialog, WorkshopItemData, boolean>(WorkshopItemDialog, {
        data,
        width: '460px',
        maxWidth: '96vw',
      })
      .afterClosed()
      .subscribe((ok) => ok && this.load());
  }

  removeResource(r: Resource) {
    this.done(this.api.removeResource(r.id));
  }

  removeService(t: ServiceType) {
    this.done(this.api.removeServiceType(t.id));
  }

  restore(req: { subscribe: (fn: () => void) => unknown }) {
    req.subscribe(() => this.load());
  }

  private done(req: { subscribe: (fn: (a: Archived) => void) => unknown }) {
    req.subscribe((a) => {
      if (a.archived)
        this.snack.open('Används i bokningar och arkiverades', undefined, { duration: 3000 });
      this.load();
    });
  }
}
