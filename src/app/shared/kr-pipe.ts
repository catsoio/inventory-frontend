import { CurrencyPipe } from '@angular/common';
import { Pipe, PipeTransform } from '@angular/core';

// Öre (heltal) -> kr.
@Pipe({ name: 'kr', standalone: false })
export class KrPipe implements PipeTransform {
  private readonly currency = new CurrencyPipe('sv-SE', 'SEK');

  transform(ore: number | null | undefined): string {
    return ore == null
      ? '–'
      : (this.currency.transform(ore / 100, 'SEK', 'symbol-narrow', '1.0-2') ?? '–');
  }
}
