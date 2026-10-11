import { Component, Input } from '@angular/core';

export type PillTone = 'green' | 'amber' | 'red' | 'blue' | 'gray';

const TONES: Record<PillTone, string> = {
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  blue: 'bg-blue-100 text-blue-800',
  gray: 'bg-gray-200 text-gray-800',
};

@Component({
  selector: 'app-pill',
  standalone: false,
  template: `<span
    class="rounded-full px-3 py-1 text-sm font-medium whitespace-nowrap"
    [class]="cls"
    ><ng-content
  /></span>`,
})
export class Pill {
  @Input() tone: PillTone = 'gray';
  get cls() {
    return TONES[this.tone];
  }
}
