import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { WorkshopApi } from '../../../core/api/workshop-api';
import { RESOURCE_KIND_LABELS, Resource, ResourceKind } from '../../../core/models';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';

/** Kortet för en mekaniker eller plats som kan bokas. */
@Component({
  selector: 'app-resource-card',
  standalone: false,
  template: `
    <app-card-page
      listLink="/resources"
      listLabel="Mekaniker och platser"
      newTitle="Ny mekaniker eller plats"
      [title]="card()?.name ?? ''"
      [code]="card()?.code ?? null"
      [archived]="!!card() && !card()!.active"
    >
      <div actions class="flex items-center gap-2">
        @if (card(); as c) {
          @if (c.active) {
            <button mat-button class="!text-red-700" (click)="remove()">Ta bort</button>
          } @else {
            <button mat-stroked-button (click)="restore()">Återställ</button>
          }
        }
        <button
          mat-flat-button
          color="primary"
          (click)="save()"
          [disabled]="form.invalid || busy()"
        >
          Spara
        </button>
      </div>

      <form
        [formGroup]="form"
        class="grid gap-x-4 rounded-xl bg-white p-5 shadow-sm sm:grid-cols-2"
      >
        <mat-form-field>
          <mat-label>Namn</mat-label>
          <input matInput formControlName="name" autocomplete="off" />
          <mat-error>Ange namn</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Typ</mat-label>
          <mat-select formControlName="kind">
            @for (k of kinds; track k[0]) {
              <mat-option [value]="k[0]">{{ k[1] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <label class="flex items-center gap-3 text-sm sm:col-span-2">
          Färg i kalendern
          <input type="color" formControlName="color" class="h-9 w-14 cursor-pointer rounded-lg" />
        </label>
      </form>
    </app-card-page>
  `,
})
export class ResourceCard implements OnInit {
  private readonly api = inject(WorkshopApi);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');

  readonly kinds = Object.entries(RESOURCE_KIND_LABELS);
  readonly busy = signal(false);
  readonly card = signal<Resource | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', Validators.required],
    kind: ['mechanic' as ResourceKind],
    color: ['#1976d2'],
  });

  ngOnInit() {
    if (this.id) this.load();
  }

  private load() {
    this.api.resources(true).subscribe((all) => {
      const r = all.find((x) => x.id === this.id);
      if (!r) return void this.router.navigate(['/resources']);
      this.card.set(r);
      this.form.reset({ name: r.name, kind: r.kind, color: r.color });
    });
  }

  save() {
    const body = this.form.getRawValue();
    this.busy.set(true);
    const req = this.id ? this.api.updateResource(this.id, body) : this.api.createResource(body);
    req.subscribe({
      next: (r) => {
        this.busy.set(false);
        this.snack.open('Sparat', undefined, { duration: 2000 });
        if (this.id) this.load();
        else this.router.navigate(['/resources', r.id]);
      },
      error: () => this.busy.set(false),
    });
  }

  remove() {
    const r = this.card()!;
    this.dialog
      .open(ConfirmDialog, {
        data: {
          title: `Ta bort ${r.name}?`,
          message: 'Används den i bokningar arkiveras den i stället, så historiken ligger kvar.',
          confirmText: 'Ta bort',
          danger: true,
        },
      })
      .afterClosed()
      .subscribe(
        (ok) =>
          ok &&
          this.api.removeResource(r.id).subscribe((a) => {
            if (!a.archived) return void this.router.navigate(['/resources']);
            this.snack.open('Används i bokningar och arkiverades', undefined, { duration: 3000 });
            this.load();
          }),
      );
  }

  restore() {
    this.api.updateResource(this.id!, { active: true }).subscribe(() => this.load());
  }
}
