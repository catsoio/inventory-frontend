import { Component, inject } from '@angular/core';
import { Auth } from '../../core/auth/auth';

interface Entry {
  path: string;
  title: string;
  text: string;
  icon: string;
  adminOnly?: boolean;
}

/** Register: sådant som ställs in en gång och sällan ändras. Hör inte hemma i den dagliga menyn. */
@Component({
  selector: 'app-register-hub',
  standalone: false,
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-5xl">
      <p class="mb-4 max-w-2xl text-sm text-gray-600">
        Sådant som ställs in en gång och sällan ändras: vad ni utför och tar betalt för, vem som
        utför det, vilka lager och hyllor som finns och vilka ni köper av.
      </p>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        @for (e of entries; track e.path) {
          <a
            [routerLink]="e.path"
            class="group flex items-start gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition hover:shadow-md"
          >
            <span
              class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"
            >
              <mat-icon>{{ e.icon }}</mat-icon>
            </span>
            <span class="min-w-0 flex-1">
              <span class="block font-semibold">{{ e.title }}</span>
              <span class="mt-0.5 block text-sm text-gray-600">{{ e.text }}</span>
            </span>
            <mat-icon class="self-center text-gray-300 transition group-hover:text-gray-500"
              >chevron_right</mat-icon
            >
          </a>
        }
      </div>
    </div>
  `,
})
export class RegisterHub {
  private readonly auth = inject(Auth);
  private readonly admin = this.auth.isAdmin() || this.auth.isSuperAdmin();

  readonly entries: Entry[] = (
    [
      {
        path: '/service-types',
        title: 'Åtgärder',
        text: 'Prislistan: vad ett däckbyte, en service eller en reparation kostar och hur lång tid det tar.',
        icon: 'build',
      },
      {
        path: '/resources',
        title: 'Mekaniker och platser',
        text: 'Vem som utför jobben, och vilka lyft och platser som kan bokas.',
        icon: 'engineering',
      },
      {
        path: '/article-types',
        title: 'Artikeltyper',
        text: 'Vilka uppgifter en artikel ska ha: däck, fälgar, olja, batterier och så vidare.',
        icon: 'category',
      },
      {
        path: '/warehouses',
        title: 'Lager och hyllplatser',
        text: 'Lager, rum och hyllor, för både eget lager och kundernas däckhotell.',
        icon: 'warehouse',
      },
      {
        path: '/suppliers',
        title: 'Leverantörer',
        text: 'Ni köper av dem: kontaktuppgifter och inköpshistorik.',
        icon: 'local_shipping',
      },
      {
        path: '/activity',
        title: 'Aktivitetslogg',
        text: 'Vem gjorde vad, och när. Bara för ägaren.',
        icon: 'history',
        adminOnly: true,
      },
    ] as Entry[]
  ).filter((e) => !e.adminOnly || this.admin);
}
