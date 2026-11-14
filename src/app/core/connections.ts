import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Auth } from './auth/auth';

/**
 * Vägen till Inställningar → Anslutningar, för det som beror på en integration (Gummigrossen,
 * Blocket, PayPal-kassan, car.info). Regeln står i `docs/axle/design.md`: en integration som inte är
 * ansluten visar aldrig sin åtgärd utan vägen att ansluta den, och bara för den som får ansluta.
 */
@Injectable({ providedIn: 'root' })
export class Connections {
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(Auth);

  /** Ägaren (och Catso) får koppla in tjänster; personalen ser ingen uppmaning de inte kan följa. */
  readonly canConnect = () => this.auth.isAdmin() || this.auth.isSuperAdmin();

  /** Öppnar Anslutningar. `after` körs när popupen stängts, så sidan kan läsa om anslutningens status. */
  readonly open = (after?: () => void) => {
    void import('../features/settings/settings').then((m) =>
      m.openSettings(this.dialog, 'anslutningar').then((ref) => {
        if (after) ref.afterClosed().subscribe(() => after());
      }),
    );
  };
}
