import { Injectable, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
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

  /** Öppnar skannarrutan (skriv eller skanna en kod, eller använd kameran). */
  async openDialog(): Promise<void> {
    if (this.auth.isMechanic()) return;
    const { ScanDialog } = await import('./scan-dialog');
    if (this.dialog.openDialogs.some((d) => d.componentInstance instanceof ScanDialog)) return;
    this.dialog.open(ScanDialog, { width: '460px', maxWidth: '96vw', ariaLabel: 'Skanna' });
  }

  /** Skalet matar in varje tangent. Fält tar hand om sin egen text. */
  onKey(e: KeyboardEvent): void {
    if (this.auth.isMechanic()) return;
    const t = e.target as HTMLElement | null;
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
    const hit = await this.resolve(code);
    if (hit) this.open(hit);
    return hit;
  }

  /** Slår upp koden och öppnar det den står för, även när en sida annars vill ha skanningarna. */
  async openCode(code: string): Promise<void> {
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
