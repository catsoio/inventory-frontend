import { Pipe, PipeTransform } from '@angular/core';
import { STANDARD_VAT, vatIn } from './vat';

/** Ett pris inkl. moms i kr -> "varav moms 199 kr" (25 %), att visa under fältet. */
@Pipe({ name: 'vatPart', standalone: false })
export class VatPartPipe implements PipeTransform {
  transform(grossKr: number | string | null | undefined, rate = STANDARD_VAT): string {
    const n = typeof grossKr === 'string' ? Number(grossKr) : grossKr;
    if (n == null || Number.isNaN(n) || n === 0) return '';
    return `varav moms ${(vatIn(Math.round(n * 100), rate) / 100).toLocaleString('sv-SE')} kr`;
  }
}
