import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { openSettings } from '../features/settings/settings';
import { BlocketImportApi } from './api/car-api';
import { ApiError, BlocketImportRow } from './models';

/**
 * Läser in bilarna verkstaden redan har på Blocket och Bytbil, direkt och utan dialog. Nyckel,
 * grupp och handlarkod sätts en gång under Inställningar → Anslutningar → Blocket. Nya bilar blir
 * utkast; bilar vi redan har ändras aldrig, så det går att trycka flera gånger.
 */
@Injectable({ providedIn: 'root' })
export class BlocketImporter {
  private readonly api = inject(BlocketImportApi);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  /** Läser in allt nytt och berättar hur det gick. Ger sant när något kom in. */
  async run(): Promise<boolean> {
    try {
      const status = await firstValueFrom(this.api.connection());
      if (!status.connected) {
        this.needsSetup(
          'Läsning från Blocket är inte inställd. Lägg in läsnyckeln under Anslutningar.',
        );
        return false;
      }
      const created: BlocketImportRow[] = [];
      const failed: BlocketImportRow[] = [];
      // Servern tar högst 25 bilar per anrop; fråga tills inget nytt kommer in.
      for (;;) {
        const r = await firstValueFrom(this.api.run({}));
        created.push(...r.created);
        failed.push(...r.failed);
        if (!(r.remaining > 0 && r.created.length > 0)) break;
      }
      this.report(created, failed);
      return created.length > 0;
    } catch (e) {
      // Övriga fel har redan fått sin ruta av felhanteraren.
      if ((e as ApiError)?.code === 'BLOCKET_READ_REFUSED') {
        this.needsSetup(
          'Blocket låter inte nyckeln läsa annonser. Kontrollera läsnyckeln under Anslutningar.',
        );
      }
      return false;
    }
  }

  private report(created: BlocketImportRow[], failed: BlocketImportRow[]) {
    const warned = created.filter((r) => r.warnings.length).length;
    let text = created.length
      ? `${created.length} ${created.length === 1 ? 'bil' : 'bilar'} lästes in som utkast`
      : 'Inga nya bilar att läsa in. Bilar ni redan har ändras inte';
    if (warned) text += `, ${warned} behöver en kontroll av pris eller bilder`;
    if (failed.length) {
      text += `. ${failed.length} gick inte: ${failed[0].regNo ?? failed[0].label} (${failed[0].reason})`;
    }
    this.snack.open(text, 'OK', { duration: 12000 });
  }

  private needsSetup(text: string) {
    this.snack
      .open(text, 'Öppna', { duration: 10000 })
      .onAction()
      .subscribe(() => void openSettings(this.dialog, 'anslutningar'));
  }
}
