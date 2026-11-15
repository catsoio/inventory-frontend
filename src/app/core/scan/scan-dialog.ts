import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { SharedModule } from '../../shared/shared-module';
import { Scanner } from './scanner';

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

/** Skanna med läsaren (skriv eller skanna i fältet) eller med telefonens kamera. */
@Component({
  selector: 'app-scan-dialog',
  standalone: true,
  imports: [SharedModule],
  template: `
    <h2 mat-dialog-title>Skanna</h2>
    <mat-dialog-content class="flex flex-col gap-3">
      <p class="order-1 text-sm text-gray-600">
        Skanna en etikett med läsaren, eller skriv koden: DH-nummer, artikelnummer, streckkod,
        AO-/SK-/KF-nummer eller regnr.
      </p>
      <input
        #field
        class="order-3 h-12 w-full rounded-xl border border-gray-300 px-3 text-lg md:order-2"
        placeholder="Skanna eller skriv…"
        autocomplete="off"
        autocapitalize="characters"
        (keydown.enter)="submit(field.value)"
      />
      <!-- På mobil är kameran det vanliga sättet, så den ligger över fältet och syns utan att rulla. -->
      <div class="order-2 flex flex-col gap-3 md:order-3">
        @if (!canCamera) {
          <p class="rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
            Kameran kan inte läsa koder i den här webbläsaren. Använd en streckkodsläsare, skriv
            koden, eller öppna Axle i Chrome.
          </p>
        } @else if (camera()) {
          <video
            #video
            class="aspect-video w-full rounded-xl bg-black object-cover"
            playsinline
            muted
          ></video>
          <button mat-stroked-button type="button" (click)="stopCamera()">
            <mat-icon>videocam_off</mat-icon> Stäng kameran
          </button>
        } @else {
          <button mat-stroked-button type="button" (click)="startCamera()">
            <mat-icon>photo_camera</mat-icon> Använd kameran
          </button>
        }
      </div>
      @if (error()) {
        <p class="order-4 text-sm text-red-700">{{ error() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Stäng</button>
      <button mat-flat-button type="button" (click)="submit(field.value)" [disabled]="busy()">
        Öppna
      </button>
    </mat-dialog-actions>
  `,
})
export class ScanDialog implements AfterViewInit, OnDestroy {
  private readonly scanner = inject(Scanner);
  private readonly ref = inject(MatDialogRef<ScanDialog>);
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  readonly busy = signal(false);
  readonly error = signal('');
  readonly camera = signal(false);
  /**
   * Kameraläsning kräver webbläsarens BarcodeDetector (Chrome och Edge; inte Safari på iPhone eller
   * Firefox) och en säker anslutning (https). Saknas den visar dialogen en förklaring i stället för knappen.
   */
  readonly canCamera =
    typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices;

  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Fältet får fokus på dator, där en läsare skriver in koden. På mobil öppnar fokus bara tangentbordet. */
  ngAfterViewInit() {
    if (window.matchMedia('(pointer: fine)').matches) this.field()?.nativeElement.focus();
  }

  async submit(value: string) {
    const code = value.trim();
    if (!code || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const hit = await this.scanner.resolve(code);
    this.busy.set(false);
    if (!hit) return;
    if (hit.kind === 'none') {
      this.error.set(`Hittar ingen träff på ${code}.`);
      this.scanner.beep(false);
      return;
    }
    this.stopCamera();
    this.ref.close();
    this.scanner.open(hit);
  }

  async startCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      this.camera.set(true);
      // Videoelementet finns först efter nästa rendering.
      setTimeout(() => this.attach(), 0);
    } catch {
      this.error.set('Kameran gick inte att öppna. Tillåt kameran i webbläsaren.');
    }
  }

  private attach() {
    const el = this.video()?.nativeElement;
    if (!el || !this.stream) return;
    el.srcObject = this.stream;
    void el.play();
    const Ctor = (window as unknown as { BarcodeDetector: new (o?: object) => Detector })
      .BarcodeDetector;
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
  }

  stopCamera() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.camera.set(false);
  }

  ngOnDestroy() {
    this.stopCamera();
  }
}
