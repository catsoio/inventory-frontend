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
  async openDialog(data?: { title?: string }): Promise<MatDialogRef<unknown> | undefined> {
    const { ScanDialog } = await import('./scan-dialog');
    if (this.dialog.openDialogs.some((d) => d.componentInstance instanceof ScanDialog)) return;
    return this.dialog.open(ScanDialog, {
      width: '460px',
      maxWidth: '96vw',
      ariaLabel: 'Skanna',
      autoFocus: false,
      data,
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

  /**
   * Kameran läser en hylletikett och ger hyllan, eller null när man stängde utan att något lästes
   * eller läste något som inte är en hylla. Skanningen går bara hit, inte till sidan under.
   */
  async pickShelf(): Promise<Extract<ScanHit, { kind: 'location' }> | null> {
    let release = () => {};
    const done = new Promise<string>((resolve) => {
      release = this.capture(resolve);
    });
    const ref = await this.openDialog({ title: 'Skanna hyllan' });
    if (!ref) {
      release();
      return null;
    }
    // Dialogen stängs med eller utan skanning; utan skanning avslutas väntan här.
    const code = await Promise.race([
      done,
      new Promise<null>((r) => ref.afterClosed().subscribe(() => setTimeout(() => r(null), 50))),
    ]);
    release();
    if (!code) return null;
    const hit = await this.resolve(code);
    if (!hit) return null;
    if (hit.kind !== 'location') {
      this.beep(false);
      this.snack.open('Det där är inte en hylla.', undefined, { duration: 3500 });
      return null;
    }
    return hit;
  }

  /** Skalet matar in varje tangent. Fält tar hand om sin egen text. */
  onKey(e: KeyboardEvent): void {
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

  /**
   * Kameran läser en skylt och bladet för bilen öppnas. Det här är mekanikerns väg (de skannar bil,
   * inte vad som helst) och fungerar även på en sida som annars vill ha råa koder, eftersom skylten
   * läses för sig. En skylt som ingen känner till är en ny bil.
   */
  async scanCar(): Promise<void> {
    const plate = await this.pickPlate();
    if (!plate) return;
    const hit = await this.resolve(plate);
    if (!hit) return;
    if (hit.kind === 'vehicle') this.open(hit);
    else void this.startForNewCar(plate);
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
    // Mekanikern lägger inte in bilar och kunder: kontoret gör det.
    if (this.auth.isMechanic()) {
      this.beep(false);
      this.snack.open(`${regNo} finns inte hos er än. Be kontoret lägga in bilen.`, undefined, {
        duration: 4000,
      });
      return;
    }
    const picked = await this.sheet(async () => {
      const { NewCarDialog } = await import('./new-car-dialog');
      return firstValueFrom(
        this.dialog
          .open(NewCarDialog, {
            width: '460px',
            maxWidth: '96vw',
            autoFocus: false,
            data: { regNo },
          })
          .afterClosed(),
      );
    });
    if (!picked) return;
    if (picked.choice === 'storage') return this.go(['/storage/new'], { regNo });
    if (picked.choice === 'quote') return this.go(['/quotes/new'], { regNo });
    return this.startOrderFor(regNo, picked.job);
  }

  /**
   * Bladet för en bil garaget känner: personalen väljer vad som ska hända med den (en order som
   * redan pågår ligger överst), mekanikern ser sina order på den.
   */
  async openCar(vehicleId: string, regNo: string): Promise<void> {
    const r = await this.sheet(async () => {
      const { CarSheet } = await import('./car-sheet');
      return firstValueFrom(
        this.dialog
          .open(CarSheet, {
            width: '460px',
            maxWidth: '96vw',
            autoFocus: false,
            ariaLabel: 'Bil',
            data: { vehicleId, regNo },
          })
          .afterClosed(),
      );
    });
    if (!r) return;
    if (r.kind === 'go') return this.go(r.commands, r.queryParams);
    // Man valde Ny order i bladet, så frågan om en dubblett ställs inte en gång till.
    return this.startOrderFor(regNo, r.job, true);
  }

  /**
   * En kod som ingen känner till: personalen får välja vad den är (koppla till en artikel man har,
   * en ny artikel, skanna om) i stället för ett tomt "hittar ingen träff". Mekanikern, som inte
   * lägger upp artiklar, får veta det och skriver delen på ordern.
   */
  async unknownCode(code: string): Promise<void> {
    this.beep(false);
    if (this.auth.isMechanic()) {
      this.snack.open(
        `Koden ${code} finns inte i lagret. Skriv delen på ordern i stället.`,
        undefined,
        { duration: 4000 },
      );
      return;
    }
    const r = await this.sheet(async () => {
      const { UnknownCodeSheet } = await import('./unknown-code-sheet');
      return firstValueFrom(
        this.dialog
          .open(UnknownCodeSheet, {
            width: '460px',
            maxWidth: '96vw',
            autoFocus: false,
            ariaLabel: 'Okänd kod',
            data: { code },
          })
          .afterClosed(),
      );
    });
    if (!r) return;
    if (r.kind === 'again') {
      void this.openDialog();
    } else if (r.kind === 'go') {
      this.go(r.commands, r.queryParams);
    } else {
      this.snack.open(`Koden sparades på ${r.article.label}`, undefined, { duration: 3500 });
      this.go(['/inventory', r.article.id]);
    }
  }

  /**
   * Bladet för ett däckset (etikettens QR): vem och var, och att lämna ut eller flytta det. En
   * utlämning sker i bladet; resten är rutor som leder vidare.
   */
  async openDeposit(id: string): Promise<void> {
    const r = await this.sheet(async () => {
      const { DepositSheet } = await import('./deposit-sheet');
      return firstValueFrom(
        this.dialog
          .open(DepositSheet, {
            width: '460px',
            maxWidth: '96vw',
            autoFocus: false,
            ariaLabel: 'Däckset',
            data: { id },
          })
          .afterClosed(),
      );
    });
    if (r?.kind === 'go') this.go(r.commands, r.queryParams);
  }

  /** Bladet för en hylla (etikettens QR): vad som står där, och att lägga in, räkna eller ta emot här. */
  async openShelf(shelf: Extract<ScanHit, { kind: 'location' }>): Promise<void> {
    const r = await this.sheet(async () => {
      const { ShelfSheet } = await import('./shelf-sheet');
      return firstValueFrom(
        this.dialog
          .open(ShelfSheet, {
            width: '460px',
            maxWidth: '96vw',
            autoFocus: false,
            ariaLabel: 'Hylla',
            data: shelf,
          })
          .afterClosed(),
      );
    });
    if (r?.kind === 'go') this.go(r.commands, r.queryParams);
  }

  /** Ett blad är öppet: en skanning till under tiden ska inte lägga ett till ovanpå. */
  private sheetOpen = false;

  private async sheet<T>(open: () => Promise<T | undefined>): Promise<T | undefined> {
    if (this.sheetOpen) return undefined;
    this.sheetOpen = true;
    try {
      return await open();
    } finally {
      this.sheetOpen = false;
    }
  }

  /** Inlämningen (Ny order) med skylten ifylld. `forceNew`: hoppa över frågan om en order som redan pågår. */
  async startOrderFor(regNo: string, job?: string, forceNew = false): Promise<void> {
    const { QuickIntake } = await import('../../features/work-orders/quick-intake/quick-intake');
    const r = await firstValueFrom(
      this.dialog
        .open(QuickIntake, {
          width: '520px',
          maxWidth: '100vw',
          autoFocus: false,
          data: { regNo, job, forceNew },
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
        this.beep(true);
        void this.openDeposit(hit.id);
        break;
      case 'article':
        if (this.auth.isMechanic()) {
          // Mekanikern har ingen artikelsida: en del läggs på en order, och det görs där.
          this.beep(false);
          this.snack.open('Öppna en av dina order och skanna delen där.', undefined, {
            duration: 3500,
          });
          break;
        }
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
        this.beep(true);
        void this.openCar(hit.id, hit.code);
        break;
      case 'location':
        this.beep(true);
        void this.openShelf(hit);
        break;
      case 'none':
        void this.unknownCode(hit.code);
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
