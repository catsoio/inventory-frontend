import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SharedModule } from '../../shared/shared-module';
import { PlateTracker, plateOf, platesIn } from './plate';
import { plateReaderAvailable, readLines } from './plate-reader';
import { Scanner } from './scanner';

/** `plateOnly`: läser bara skyltar och lämnar numret tillbaka till den som öppnade dialogen. */
export interface ScanDialogData {
  plateOnly?: boolean;
  /** Rubrik när dialogen ska säga vad som skannas, t.ex. "Skanna hyllan". */
  title?: string;
}

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

/**
 * Kameraskannern: öppnas från skanna-ikonen, startar kameran direkt och slår upp första koden den
 * ser. I appen läser den också registreringsskyltar, hela tiden medan kameran är öppen: så fort
 * samma nummer setts i två bildrutor i rad slås bilen upp, utan att man tar någon bild.
 */
@Component({
  selector: 'app-scan-dialog',
  standalone: true,
  imports: [SharedModule],
  template: `
    <h2 mat-dialog-title>{{ data?.title ?? (plateOnly ? 'Skanna skylt' : 'Skanna') }}</h2>
    <mat-dialog-content class="flex flex-col gap-3">
      @if (error()) {
        <p class="rounded-xl bg-gray-50 p-3 text-sm text-gray-700">{{ error() }}</p>
      } @else {
        <p class="text-sm text-gray-600">
          {{
            plateOnly
              ? 'Rikta kameran mot registreringsskylten.'
              : plates
                ? 'Rikta kameran mot registreringsskylten, streckkoden eller etiketten.'
                : 'Rikta kameran mot streckkoden eller etiketten.'
          }}
        </p>
      }
      <video
        #video
        class="aspect-video w-full rounded-xl bg-black object-cover"
        [class.hidden]="!camera()"
        playsinline
        muted
      ></video>
      @if (busy()) {
        <p class="text-sm text-gray-600">Slår upp koden…</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button type="button" mat-dialog-close>Stäng</button>
    </mat-dialog-actions>
  `,
})
export class ScanDialog implements AfterViewInit, OnDestroy {
  private readonly scanner = inject(Scanner);
  private readonly ref = inject(MatDialogRef<ScanDialog>);
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  readonly data = inject<ScanDialogData | null>(MAT_DIALOG_DATA, { optional: true });
  readonly plateOnly = !!this.data?.plateOnly;

  /** Appen kan läsa skyltar (personalen skannar bilar och mekanikern sina egna order på dem). */
  readonly plates = plateReaderAvailable();

  readonly busy = signal(false);
  readonly error = signal('');
  readonly camera = signal(false);
  /**
   * Kameran startar direkt. Den kräver en säker anslutning (https eller localhost). Webbläsarens egen
   * BarcodeDetector används där den finns (Chrome, Edge); annars, som i Safari och iPhone-appen,
   * läser biblioteket barcode-detector (ZXing) bildrutorna. En streckkodsläsare med tangentbordsläge
   * behöver ingen dialog: Scanner.onKey fångar den var som helst i appen.
   */
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private plateTimer: ReturnType<typeof setInterval> | null = null;
  private lastCode = '';
  private lastAt = 0;

  ngAfterViewInit() {
    void this.startCamera();
  }

  async submit(value: string) {
    const code = value.trim();
    if (!code || this.busy()) return;
    // Kameran ser samma kod i varje bildruta; en miss ska inte slås upp och pipa om och om igen.
    if (code === this.lastCode && Date.now() - this.lastAt < 3000) return;
    this.lastCode = code;
    this.lastAt = Date.now();
    // En sida som väntar på en skanning (hyllan på ett hjulset, inventeringen) får koden i stället.
    if (this.scanner.capturing) {
      this.scanner.beep(true);
      this.stopCamera();
      this.ref.close();
      void this.scanner.handle(code);
      return;
    }
    this.busy.set(true);
    this.error.set('');
    const hit = await this.scanner.resolve(code);
    this.busy.set(false);
    if (!hit) {
      this.error.set('Det gick inte att slå upp koden just nu. Försök igen.');
      return;
    }
    if (hit.kind === 'none' && this.plates && plateOf(code) === code) {
      // Ett regnummer som ingen känner till: en ny bil har kommit in, fråga vad som ska göras.
      this.scanner.beep(true);
      this.stopCamera();
      this.ref.close();
      void this.scanner.startForNewCar(code);
      return;
    }
    if (hit.kind === 'none') {
      // Ingen artikel eller etikett med koden: bladet låter en välja vad den är eller skanna om.
      this.stopCamera();
      this.ref.close();
      void this.scanner.unknownCode(code);
      return;
    }
    this.stopCamera();
    this.ref.close();
    this.scanner.open(hit);
  }

  private async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.set(
        window.isSecureContext
          ? 'Kameran är inte tillgänglig här. Skanna med en streckkodsläsare, den fungerar var du än är i appen.'
          : 'Kameran kräver en säker anslutning (https) och fungerar inte när appen laddas över http, som med live reload på mobilen. Kör appen med ios:prod för att testa kameran.',
      );
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      this.camera.set(true);
      await this.attach();
    } catch {
      this.error.set('Kameran gick inte att öppna. Tillåt kameran i inställningarna.');
    }
  }

  private async attach() {
    const el = this.video()?.nativeElement;
    if (!el || !this.stream) return;
    el.srcObject = this.stream;
    void el.play();
    if (this.plateOnly) {
      this.readPlates(el);
      return;
    }
    const native = (window as unknown as { BarcodeDetector?: new (o?: object) => Detector })
      .BarcodeDetector;
    const Ctor =
      native ??
      ((await import('barcode-detector/ponyfill')).BarcodeDetector as unknown as new (
        o?: object,
      ) => Detector);
    // Kameran kan ha stängts medan biblioteket laddades.
    if (!this.stream) return;
    const detector = new Ctor();
    let busy = false;
    this.timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const found = await detector.detect(el);
        if (found[0]?.rawValue) void this.submit(found[0].rawValue);
      } catch {
        // En bildruta utan kod är normalt.
      } finally {
        busy = false;
      }
    }, 350);
    if (this.plates) this.readPlates(el);
  }

  /**
   * Skyltläsningen går bredvid streckkodsläsningen på samma kamerabild. En sida som väntar på en
   * skanning (hylla, inventering) vill ha koder och inga bilar, så då läses inga skyltar.
   */
  private readPlates(el: HTMLVideoElement) {
    const canvas = document.createElement('canvas');
    const tracker = new PlateTracker();
    let busy = false;
    this.plateTimer = setInterval(async () => {
      if (busy || this.busy() || (this.scanner.capturing && !this.plateOnly) || el.readyState < 2)
        return;
      busy = true;
      try {
        const plate = tracker.push(platesIn(await readLines(el, canvas)));
        if (plate && this.plateOnly) {
          this.scanner.beep(true);
          this.stopCamera();
          this.ref.close(plate);
        } else if (plate) {
          void this.submit(plate);
        }
      } catch {
        // En bildruta som inte gick att läsa är normalt.
      } finally {
        busy = false;
      }
    }, 400);
  }

  stopCamera() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.plateTimer) clearInterval(this.plateTimer);
    this.plateTimer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.camera.set(false);
  }

  ngOnDestroy() {
    this.stopCamera();
  }
}
