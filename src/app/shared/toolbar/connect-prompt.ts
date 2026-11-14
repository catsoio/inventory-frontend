import { Component, inject, input, output } from '@angular/core';
import { Connections } from '../../core/connections';

/**
 * Rutan som ersätter en vy som bara fungerar med en integration som inte är ansluten ("Ingen kassa
 * är kopplad"). Ikon, en mening om vad man får, en knapp som öppnar Anslutningar. Personal som inte
 * får ansluta ser vem som kan. Åtgärder på en sida som beror på en integration har ingen egen ruta:
 * de ligger i `⋯` och visar "Anslut …" i stället för åtgärden (se design.md).
 */
@Component({
  selector: 'app-connect-prompt',
  standalone: false,
  host: { class: 'block' },
  template: `
    <div class="flex items-start gap-4 rounded-xl border border-dashed border-gray-300 bg-white p-5">
      <span class="bg-brand-soft text-brand grid h-12 w-12 shrink-0 place-items-center rounded-xl">
        <mat-icon>{{ icon() }}</mat-icon>
      </span>
      <div class="min-w-0 flex-1">
        <h2 class="text-base font-semibold">{{ title() }}</h2>
        <p class="mt-1 max-w-2xl text-sm text-gray-600"><ng-content /></p>
        @if (connections.canConnect()) {
          <button
            mat-flat-button
            color="primary"
            type="button"
            class="mt-3"
            (click)="connect()"
          >
            <mat-icon>link</mat-icon> {{ action() }}
          </button>
        } @else {
          <p class="mt-3 text-sm text-gray-500">
            Be ägaren ansluta den under Inställningar → Anslutningar.
          </p>
        }
      </div>
    </div>
  `,
})
export class ConnectPrompt {
  readonly connections = inject(Connections);
  readonly icon = input('link');
  readonly title = input.required<string>();
  /** Knappens text, "Anslut PayPal-kassan". */
  readonly action = input('Anslut');
  /** Anslutningspopupen har stängts: sidan kan läsa om om det nu finns en anslutning. */
  readonly connected = output<void>();

  connect() {
    this.connections.open(() => this.connected.emit());
  }
}
