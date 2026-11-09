import { Component, Input } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';

const pad = (n: number) => String(n).padStart(2, '0');
/** "2026-11-09" i lokal tid. */
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** "08:30" i lokal tid. */
export const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** Dag + klockslag som lokal tid. */
export const at = (day: string, time: string) => new Date(`${day}T${time}:00`);

/** Nästa hela timme: förslag på starttid för något nytt. */
export const nextHour = () => {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
};

/** Fältnamnen som `app-when-fields` och `linkWhen` förutsätter i formuläret. */
export interface WhenControls {
  day: string;
  startTime: string;
  endDay: string;
  endTime: string;
}

/** Startvärden för fälten ur en start och ett slut. */
export const whenValue = (start: Date, end: Date): WhenControls => ({
  day: ymd(start),
  startTime: hm(start),
  endDay: ymd(end),
  endTime: hm(end),
});

/** Start och slut som tidpunkter, eller null om något fält är tomt. */
export const whenRange = (v: Partial<WhenControls>): { start: Date; end: Date } | null =>
  v.day && v.startTime && v.endDay && v.endTime
    ? { start: at(v.day, v.startTime), end: at(v.endDay, v.endTime) }
    : null;

/** Gruppvalidering: slutet måste vara efter starten (felet heter `order`). */
export const whenOrder = (g: { getRawValue(): unknown }): Record<string, boolean> | null => {
  const r = whenRange(g.getRawValue() as Partial<WhenControls>);
  return r && r.end <= r.start ? { order: true } : null;
};

/**
 * Flyttar man starten följer slutet med (dag och tid), så att längden på jobbet är kvar. Ändrar
 * man slutet är det den nya längden som gäller. Samma beteende i bokningen och arbetsordern.
 */
export function linkWhen(group: FormGroup, initial: { start: Date; end: Date }) {
  const f = group.controls as Record<keyof WhenControls, AbstractControl>;
  let duration = initial.end.getTime() - initial.start.getTime();
  const keepDuration = () => {
    const r = whenRange(group.getRawValue());
    if (r && r.end > r.start) duration = r.end.getTime() - r.start.getTime();
  };
  f.endTime.valueChanges.subscribe(keepDuration);
  f.endDay.valueChanges.subscribe(keepDuration);
  const followStart = () => {
    if (!f.day.value || !f.startTime.value) return;
    const next = new Date(at(f.day.value, f.startTime.value).getTime() + duration);
    f.endDay.setValue(ymd(next), { emitEvent: false });
    f.endTime.setValue(hm(next), { emitEvent: false });
  };
  f.startTime.valueChanges.subscribe(followStart);
  f.day.valueChanges.subscribe(followStart);
}

/**
 * Start och slut: datum och klockslag var för sig, så att ett jobb kan gå över flera dagar.
 * Samma fyra fält på bokningen och på arbetsordern; formuläret ska ha kontrollerna
 * `day`, `startTime`, `endDay` och `endTime` (se `linkWhen` och `whenOrder`).
 */
@Component({
  selector: 'app-when-fields',
  standalone: false,
  template: `
    <div class="grid grid-cols-2 gap-x-3 gap-y-3" [formGroup]="group">
      <app-date-field label="Startdatum" icon="event" error="Ange datum" formControlName="day" />
      <app-time-field label="Starttid" formControlName="startTime" />
      <app-date-field
        label="Slutdatum"
        icon="event_available"
        error="Ange datum"
        formControlName="endDay"
      />
      <app-time-field
        label="Sluttid"
        formControlName="endTime"
        [error]="group.errors?.['order'] ? 'Efter starten' : ''"
      />
    </div>
  `,
})
export class WhenFields {
  @Input({ required: true }) group!: FormGroup;
}
