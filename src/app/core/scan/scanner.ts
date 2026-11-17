import { Injectable, inject, signal } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Auth } from '../auth/auth';
import { ScanHit, StockCountApi } from '../api/stock-count-api';

/** Tecken närmare varandra än så här kommer från en läsare, inte från en person. */
const MAX_GAP_MS = 60;
/** Kortare än så här är inte en streckkod. */
const MIN_LENGTH = 4;

type Capture = (code: string) => void;

/**
 * Streckkodsläsaren. En vanlig läsare beter sig som ett tangentbord: den skriver koden snabbt och
 * trycker Enter. Här känns det igen (snabba tecken + Enter utanför fält), koden slås upp på servern
 * och appen öppnar det koden står för. En sida som själv vill ha skanningarna (inventeringen,
 * hyllplaceringen) anmäler sig med `capture` och får då råa koder i stället.
 */
@Injectable({ providedIn: 'root' })
export class Scanner {
  private readonly api = inject(StockCountApi);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(Auth);
  private readonly dialog = inject(MatDialog);

  private readonly captures: Capture[] = [];
  private buffer = '';
  private lastAt = 0;
  private audio: AudioContext | null = null;

  /** Det senaste som slogs upp, för den som vill visa det. */
  readonly last = signal<ScanHit | null>(null);

  /** Sidan vill ha skanningarna själv tills den släpper dem. */
  capture(fn: Capture): () => void {
    this.captures.push(fn);
    return () => {
      const i = this.captures.lastIndexOf(fn);
      if (i >= 0) this.captures.splice(i, 1);
    };
  }

  /** En sida (inventering, hyllplacering) vill ha skanningarna själv. */
  get capturing(): boolean {
    return this.captures.length > 0;
  }

  /** Öppnar kameraskannern. */
  async openDialog(): Promise<MatDialogRef<unknown> | undefined> {
    const { ScanDialog } = await import('./scan-dialog');
    if (this.dialog.openDialogs.some((d) => d.componentInstance instanceof ScanDialog)) return;
    return this.dialog.open(ScanDialog, {
      width: '460px',
      maxWidth: '96vw',
      ariaLabel: 'Skanna',
      autoFocus: false,
    });
  }

  /**
   * Öppnar kameran som bara läser en registreringsskylt och ger tillbaka numret, eller null när
   * man stängde utan att något lästes. Bara i appen (`plateReaderAvailable`).
   */
  async pickPlate(): Promise<string | null> {
    const { ScanDialog } = await import('./scan-dialog');
    const ref = this.dialog.open(ScanDialog, {
      width: '460px',
      maxWidth: '96vw',
      ariaLabel: 'Skanna skylt',
      autoFocus: false,
      data: { plateOnly: true },
    });
    return (await firstValueFrom(ref.afterClosed())) ?? null;
  }

  /** Skalet matar in varje tangent. Fält tar hand om sin egen text. */
  onKey(e: KeyboardEvent): void {
    // Mekanikern skannar bara delar till en order: utan en sida som väntar på koden händer inget.
    if (this.auth.isMechanic() && !this.capturing) return;
    const t =e.target as HTMLElement | null;
    if (t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const now = performance.now();
    if (now - this.lastAt > MAX_GAP_MS) this.buffer = '';
    this.lastAt = now;
    if (e.key === 'Enter') {
      const code = this.buffer;
      this.buffer = '';
      if (code.length >= MIN_LENGTH) {
        e.preventDefault();
        void this.handle(code);
      }
      return;
    }
    if (e.key.length === 1) this.buffer += e.key;
  }

  /** En läst kod: till sidan som lyssnar, annars slås den upp och öppnas. */
  async handle(raw: string): Promise<ScanHit | null> {
    const code = raw.trim();
    if (!code) return null;
    const capture = this.captures[this.captures.length - 1];
    if (capture) {
      capture(code);
      return null;
    }
    // Servern svarar mekanikern bara med artiklar, och det finns ingen artikelsida för rollen.
    if (this.auth.isMechanic()) return null;
    const hit = await this.resolve(code);
    if (hit) this.open(hit);
    return hit;
  }

  /** Slår upp koden och öppnar det den står för, även när en sida annars vill ha skanningarna. */
  async openCode(code: string): Promise<void> {
    if (this.auth.isMechanic()) return;
    const hit = await this.resolve(code);
    if (hit) this.open(hit);
  }

  /** Slår upp koden på servern. Ett fel ger null (felrutan visar orsaken). */
  async resolve(code: string): Promise<ScanHit | null> {
    try {
      const hit = await firstValueFrom(this.api.scan(code));
      this.last.set(hit);
      return hit;
    } catch {
      this.beep(false);
      return null;
    }
  }

  /**
   * En skyltläsning som inte hör till någon bil hos oss: en ny bil har kommit in. Man väljer vad som
   * ska göras (arbetsorder, däckhotell, offert) i stället för att få en miss.
   */
  async startForNewCar(regNo: string): Promise<void> {
    const { NewCarDialog } = await import('./new-car-dialog');
    const choice = await firstValueFrom(
      this.dialog
        .open(NewCarDialog, { width: '420px', maxWidth: '96vw', autoFocus: false, data: { regNo } })
        .afterClosed(),
    );
    if (choice === 'storage') return this.go(['/storage/new'], { regNo });
    if (choice === 'quote') return this.go(['/quotes/new'], { regNo });
    if (choice === 'order') return this.startOrderFor(regNo);
  }

  /** Inlämningen (Ny order) med skylten ifylld. */
  async startOrderFor(regNo: string): Promise<void> {
    const { QuickIntake } = await import('../../features/work-orders/quick-intake/quick-intake');
    const r = await firstValueFrom(
      this.dialog
        .open(QuickIntake, {
          width: '520px',
          maxWidth: '100vw',
          autoFocus: false,
          data: { regNo },
        })
        .afterClosed(),
    );
    if (!r) return;
    if (r.open) {
      this.go(['/workorders', r.id]);
      return;
    }
    this.snack
      .open(`${r.code} skapad`, 'Öppna', { duration: 6000 })
      .onAction()
      .subscribe(() => this.go(['/workorders', r.id]));
  }

  /** Öppnar det koden stod för. */
  open(hit: ScanHit): void {
    switch (hit.kind) {
      case 'deposit':
        this.go(['/storage', hit.id]);
        break;
      case 'article':
        this.go(['/inventory', hit.id]);
        break;
      case 'work_order':
        this.go(['/workorders', hit.id]);
        break;
      case 'sales_card':
        this.go(['/sales', hit.id]);
        break;
      case 'quote':
        this.go(['/quotes', hit.id]);
        break;
      case 'vehicle':
        this.go(['/vehicles', hit.id]);
        break;
      case 'location': {
        // Hyllan visar vad som står på den: sök på hyllans namn.
        const spot = hit.label.split(' · ').slice(-1)[0];
        this.go([hit.warehouseKind === 'customer' ? '/storage' : '/inventory'], { q: spot });
        break;
      }
      case 'none':
        this.beep(false);
        this.snack.open(`Hittar ingen träff på ${hit.code}`, undefined, { duration: 3500 });
        break;
    }
  }

  private go(commands: string[], queryParams?: Record<string, string>) {
    this.beep(true);
    void this.router.navigate(commands, { queryParams });
  }

  /** Kort pip, högt för träff och lågt för miss, så man hör det utan att titta på skärmen. */
  beep(ok: boolean): void {
    try {
      this.audio ??= new AudioContext();
      const ctx = this.audio;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = ok ? 1200 : 300;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (ok ? 0.08 : 0.25));
    } catch {
      // Ljud är en bonus.
    }
  }
}
