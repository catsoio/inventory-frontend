import { Pipe, PipeTransform } from '@angular/core';
import { STANDARD_VAT, withVat } from './vat';

/** Ett nettopris i kr -> "= 1 250 kr inkl. moms" (25 %), att visa under fältet. */
@Pipe({ name: 'inclVat', standalone: false })
export class InclVatPipe implements PipeTransform {
  transform(netKr: number | string | null | undefined, rate = STANDARD_VAT): string {
    const n = typeof netKr === 'string' ? Number(netKr) : netKr;
    if (n == null || Number.isNaN(n) || n === 0) return '';
    return `= ${(withVat(Math.round(n * 100), rate) / 100).toLocaleString('sv-SE')} kr inkl. moms`;
  }
}
