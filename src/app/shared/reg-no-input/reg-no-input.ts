import { Directive, ElementRef, HostListener, inject } from '@angular/core';

/** Svenska regnr är 6 tecken: stora bokstäver och siffror, inga mellanslag eller bindestreck. */
export const REG_NO_LENGTH = 6;

/** Gör ett regnr-fält till ett: skriver man eller klistrar in rensas det direkt. */
@Directive({
  selector: 'input[appRegNo]',
  standalone: false,
  host: {
    '[attr.maxlength]': 'length',
    autocapitalize: 'characters',
    autocomplete: 'off',
    spellcheck: 'false',
  },
})
export class RegNoInput {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);
  readonly length = REG_NO_LENGTH;

  @HostListener('input')
  clean() {
    const input = this.el.nativeElement;
    const value = input.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, REG_NO_LENGTH);
    if (value === input.value) return;
    input.value = value;
    // Formuläret läser värdet från input-händelsen, så skicka den igen med det rensade.
    input.dispatchEvent(new Event('input'));
  }
}
