import { Component, ElementRef, input, output, viewChild } from '@angular/core';
import { FormControl } from '@angular/forms';

/**
 * Sökrutan i verktygsraden: den enda sökrutan för listor. Samma ram som fälten (`.field`), 40 px
 * hög, ikonen till vänster. Ägaren av sidan hämtar värdet ur `control` och väntar själv in
 * skrivandet (`debounceTime`); rutan gör inget mer än att visa det.
 */
@Component({
  selector: 'app-search-field',
  standalone: false,
  host: { class: 'relative block min-w-0' },
  template: `
    <mat-icon class="pointer-events-none absolute top-2 left-2.5 text-gray-400">search</mat-icon>
    <input
      #box
      type="search"
      class="field h-10 w-full pr-3 pl-10"
      [formControl]="control()"
      [placeholder]="placeholder()"
      [attr.aria-label]="placeholder()"
      (keydown.enter)="enter.emit()"
    />
  `,
})
export class SearchField {
  readonly control = input.required<FormControl<string>>();
  readonly placeholder = input('Sök…');
  /** Enter i rutan, t.ex. för att öppna posten när sökningen gav exakt en träff. */
  readonly enter = output<void>();
  private readonly box = viewChild.required<ElementRef<HTMLInputElement>>('box');

  focus() {
    this.box().nativeElement.focus();
  }
}
