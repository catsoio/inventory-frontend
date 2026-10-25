import { Component, ViewChild, inject } from '@angular/core';
import { MatMenu } from '@angular/material/menu';
import { Auth } from '../../auth/auth';

/**
 * Menyn för att byta garage (bara plattformsoperatören). Används av både topbaren på dator och
 * "Mer" på mobil: `<app-garage-menu #gm="garageMenu" />` och `[matMenuTriggerFor]="gm.menu"`.
 */
@Component({
  selector: 'app-garage-menu',
  standalone: false,
  exportAs: 'garageMenu',
  template: `
    <mat-menu #menu="matMenu">
      <div class="px-4 py-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
        Alla garage ({{ auth.garages().length }})
      </div>
      @for (g of auth.garages(); track g.id) {
        <button mat-menu-item (click)="auth.switchGarage(g.id)">
          <mat-icon>{{ g.id === auth.garage()?.id ? 'check' : '' }}</mat-icon>
          <span>{{ g.name }}</span>
          <span class="ml-2 text-xs text-gray-500">
            {{ g.id === auth.ownGarage()?.id ? 'ditt garage · ' : '' }}{{ g.memberCount }} anv.
          </span>
        </button>
      }
    </mat-menu>
  `,
})
export class GarageMenu {
  readonly auth = inject(Auth);
  @ViewChild('menu', { static: true }) menu!: MatMenu;
}
