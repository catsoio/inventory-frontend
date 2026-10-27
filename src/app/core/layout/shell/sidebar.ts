import { Component, inject } from '@angular/core';
import { Nav } from '../nav';

/** Sidomenyn på dator: ett val per avsnitt, hopfällbar till bara ikoner. */
@Component({
  selector: 'app-sidebar',
  standalone: false,
  host: {
    class:
      'hidden shrink-0 flex-col border-r border-gray-200 bg-white transition-[width] duration-200 md:flex',
    '[style.width.px]': 'nav.collapsed() ? 72 : 256',
  },
  styles: `
    .nav-link {
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 40px;
      padding: 0 12px;
      border-radius: 10px;
      font-size: 14.5px;
      font-weight: 500;
      white-space: nowrap;
      color: #374151;
      transition:
        background-color 0.15s,
        color 0.15s;
    }
    .nav-link:hover {
      background: #f3f4f6;
    }
    .nav-link mat-icon {
      flex: none;
      color: #6b7280;
    }
    .nav-link.is-active {
      color: var(--mat-sys-primary);
      font-weight: 600;
      background: var(--color-brand-soft);
    }
    .nav-link.is-active mat-icon {
      color: var(--mat-sys-primary);
    }
    .nav-link.is-active::before {
      content: '';
      position: absolute;
      left: -12px;
      top: 8px;
      bottom: 8px;
      width: 3px;
      border-radius: 0 3px 3px 0;
      background: var(--mat-sys-primary);
    }
    /* Gruppens rad (t.ex. Ekonomi): öppnar och stänger, och markeras när en av dess sidor är öppen. */
    .nav-group.has-active {
      color: var(--mat-sys-primary);
      font-weight: 600;
    }
    .nav-group.has-active > mat-icon:first-child {
      color: var(--mat-sys-primary);
    }
    .nav-group.has-active::before {
      content: '';
      position: absolute;
      left: -12px;
      top: 8px;
      bottom: 8px;
      width: 3px;
      border-radius: 0 3px 3px 0;
      background: var(--mat-sys-primary);
    }
    .nav-chevron {
      flex: none;
      margin-right: -4px;
      color: #9ca3af;
      transition: transform 0.15s;
    }
    .nav-sub {
      min-height: 36px;
      padding: 0 12px;
      font-size: 14px;
      font-weight: 500;
      color: #4b5563;
    }
    .nav-sub.is-active {
      color: var(--mat-sys-primary);
      font-weight: 600;
      background: var(--color-brand-soft);
    }
    .nav-title {
      margin: 18px 0 4px;
      padding: 0 12px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #9ca3af;
    }
  `,
  template: `
    <ng-template #link let-l>
      @let c = nav.collapsed();
      @let b = nav.badges()[l.badge ?? l.path];
      <a
        [routerLink]="l.path"
        class="nav-link"
        [class.is-active]="nav.matches(l)"
        [class.justify-center]="c"
        [class.!px-0]="c"
        [matTooltip]="c ? l.label + (b ? ' – ' + b.hint : '') : ''"
        matTooltipPosition="right"
        [attr.aria-label]="l.label"
        [attr.aria-current]="nav.matches(l) ? 'page' : null"
      >
        <span class="relative inline-flex">
          <mat-icon>{{ l.icon }}</mat-icon>
          @if (c && b) {
            <span
              class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white"
              [class]="b.dot"
            ></span>
          }
        </span>
        @if (!c) {
          <span class="flex-1">{{ l.label }}</span>
          @if (b) {
            <span
              class="rounded-full px-2 py-0.5 text-xs font-medium"
              [class]="b.tone"
              [attr.title]="b.hint"
              >{{ b.text }}</span
            >
          }
        }
      </a>
    </ng-template>

    <!-- Ett val med undermeny (Ekonomi): rubrik som fäller ut sina sidor. Hopfälld meny visar sidorna som ikoner. -->
    <ng-template #group let-g>
      @let open = nav.isOpen(g);
      @if (nav.collapsed()) {
        @for (ch of g.children; track ch.path) {
          <ng-container *ngTemplateOutlet="link; context: { $implicit: ch }" />
        }
      } @else {
        @let gb = nav.badges()[g.path];
        <button
          type="button"
          class="nav-link nav-group w-full"
          [class.has-active]="nav.matches(g)"
          [attr.aria-expanded]="open"
          [attr.aria-controls]="'sub-' + g.path"
          (click)="nav.toggleGroup(g)"
        >
          <span class="relative inline-flex">
            <mat-icon>{{ g.icon }}</mat-icon>
            @if (!open && gb) {
              <span
                class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white"
                [class]="gb.dot"
              ></span>
            }
          </span>
          <span class="flex-1 text-left">{{ g.label }}</span>
          <mat-icon class="nav-chevron" [style.transform]="open ? 'rotate(180deg)' : null"
            >expand_more</mat-icon
          >
        </button>
        @if (open) {
          <div [id]="'sub-' + g.path" class="mt-0.5 mb-1 ml-[22px] border-l border-gray-200 pl-2">
            @for (ch of g.children; track ch.path) {
              @let b = nav.badges()[ch.badge ?? ch.path];
              <a
                [routerLink]="ch.path"
                class="nav-link nav-sub"
                [class.is-active]="nav.matches(ch)"
                [attr.aria-current]="nav.matches(ch) ? 'page' : null"
              >
                <span class="flex-1">{{ ch.label }}</span>
                @if (b) {
                  <span
                    class="rounded-full px-2 py-0.5 text-xs font-medium"
                    [class]="b.tone"
                    [attr.title]="b.hint"
                    >{{ b.text }}</span
                  >
                }
              </a>
            }
          </div>
        }
      }
    </ng-template>

    <nav class="flex-1 overflow-x-hidden overflow-y-auto p-3" aria-label="Huvudmeny">
      @for (sec of nav.sections(); track sec.title) {
        @if (sec.title) {
          @if (nav.collapsed()) {
            <div class="mx-3 my-3 h-px bg-gray-100"></div>
          } @else {
            <div class="nav-title">{{ sec.title }}</div>
          }
        }
        @for (l of sec.items; track l.path) {
          @if (l.children) {
            <ng-container *ngTemplateOutlet="group; context: { $implicit: l }" />
          } @else {
            <ng-container *ngTemplateOutlet="link; context: { $implicit: l }" />
          }
        }
      }
    </nav>

    <div class="border-t border-gray-100 p-3">
      @for (l of nav.footer(); track l.path) {
        <ng-container *ngTemplateOutlet="link; context: { $implicit: l }" />
      }
      <button
        type="button"
        class="nav-link w-full"
        [class.justify-center]="nav.collapsed()"
        [class.!px-0]="nav.collapsed()"
        (click)="nav.toggle()"
        [matTooltip]="nav.collapsed() ? 'Visa menyn' : ''"
        matTooltipPosition="right"
        [attr.aria-label]="nav.collapsed() ? 'Visa menyn' : 'Dölj menyn'"
        [attr.aria-expanded]="!nav.collapsed()"
      >
        <mat-icon>{{
          nav.collapsed() ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left'
        }}</mat-icon>
        @if (!nav.collapsed()) {
          <span>Dölj menyn</span>
        }
      </button>
    </div>
  `,
})
export class Sidebar {
  readonly nav = inject(Nav);
}
