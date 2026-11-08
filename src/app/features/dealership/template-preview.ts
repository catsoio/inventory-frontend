import { Component, computed, input } from '@angular/core';
import { SiteTemplate } from '../../core/models';

/** Färgerna per mall och läge: samma som mallarnas paletter i catso-sites (`templates.ts`). */
const PALETTES: Record<
  SiteTemplate,
  Record<'dark' | 'light', { bg: string; surface: string; surface2: string; text: string; muted: string; line: string }>
> = {
  editorial: {
    dark: { bg: '#0a0a0c', surface: '#131317', surface2: '#1b1b21', text: '#f3f0ea', muted: '#9b9ba5', line: '#26262d' },
    light: { bg: '#faf9f6', surface: '#ffffff', surface2: '#f1efea', text: '#16161a', muted: '#6a6a73', line: '#e3e0d8' },
  },
  showroom: {
    dark: { bg: '#08080a', surface: '#101014', surface2: '#18181d', text: '#f5f5f3', muted: '#a0a0aa', line: '#24242b' },
    light: { bg: '#f3f3f1', surface: '#ffffff', surface2: '#e9e9e6', text: '#0d0d10', muted: '#62626b', line: '#dcdcd8' },
  },
  market: {
    dark: { bg: '#0e1116', surface: '#161b22', surface2: '#1d242d', text: '#eef1f5', muted: '#8b97a6', line: '#262e38' },
    light: { bg: '#f2f4f7', surface: '#ffffff', surface2: '#e8ecf1', text: '#14171c', muted: '#5d6978', line: '#dbe1e8' },
  },
  local: {
    dark: { bg: '#17120e', surface: '#211a14', surface2: '#2b2219', text: '#f6eee3', muted: '#b6a48f', line: '#3a2e22' },
    light: { bg: '#fbf6ee', surface: '#fffdf9', surface2: '#f3eadb', text: '#2a211a', muted: '#7a6a5a', line: '#eadfcc' },
  },
};

/**
 * En liten bild av hur en mall ser ut (startsidan, ritad som former). Följer ägarens mörk/ljus och
 * accentfärg, så man ser sin egen sida och inte en exempelbild.
 */
@Component({
  selector: 'app-template-preview',
  standalone: false,
  template: `
    <svg
      viewBox="0 0 320 200"
      class="block w-full rounded-lg"
      [style.border]="'1px solid ' + c().line"
      role="img"
      [attr.aria-label]="'Förhandsvisning av mallen ' + template()"
    >
      <defs>
        <linearGradient [attr.id]="'fade-' + template()" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" [attr.stop-color]="c().surface2" />
          <stop offset="0.55" [attr.stop-color]="c().surface2" stop-opacity="0.8" />
          <stop offset="1" [attr.stop-color]="c().bg" />
        </linearGradient>
        <linearGradient [attr.id]="'warm-' + template()" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" [attr.stop-color]="accent()" stop-opacity="0.55" />
          <stop offset="1" [attr.stop-color]="c().surface2" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" [attr.fill]="c().bg" />

      @switch (template()) {
        @case ('editorial') {
          <rect x="16" y="10" width="52" height="7" rx="2" [attr.fill]="c().text" />
          <rect x="118" y="11" width="28" height="5" rx="2" [attr.fill]="c().muted" />
          <rect x="154" y="11" width="28" height="5" rx="2" [attr.fill]="c().muted" />
          <rect x="190" y="11" width="28" height="5" rx="2" [attr.fill]="c().muted" />
          <rect x="258" y="6" width="46" height="14" rx="7" [attr.fill]="accent()" />
          <rect x="0" y="26" width="320" height="1" [attr.fill]="c().line" />
          <rect x="16" y="48" width="12" height="2" [attr.fill]="accent()" />
          <rect x="33" y="47" width="40" height="3" rx="1" [attr.fill]="c().muted" />
          <rect x="16" y="60" width="176" height="17" rx="2" [attr.fill]="c().text" />
          <rect x="16" y="82" width="120" height="17" rx="2" [attr.fill]="c().text" />
          <rect x="16" y="110" width="288" height="36" rx="8" [attr.fill]="c().surface" [attr.stroke]="c().line" />
          <rect x="24" y="118" width="160" height="12" rx="6" [attr.fill]="c().bg" [attr.stroke]="c().line" />
          @for (x of [16, 115, 214]; track x) {
            <rect [attr.x]="x" y="156" width="90" height="60" rx="6" [attr.fill]="c().surface" [attr.stroke]="c().line" />
            <rect [attr.x]="x" y="156" width="90" height="32" rx="6" [attr.fill]="c().surface2" />
            <rect [attr.x]="x + 8" y="195" width="50" height="4" rx="1" [attr.fill]="c().text" />
          }
        }
        @case ('showroom') {
          <rect width="320" height="150" [attr.fill]="'url(#fade-' + template() + ')'" />
          <path
            d="M168 78 q8 -20 34 -23 h50 q26 2 38 21 l10 5 v9 h-146 z"
            [attr.fill]="c().muted"
            opacity="0.35"
          />
          <circle cx="196" cy="90" r="8" [attr.fill]="c().muted" opacity="0.5" />
          <circle cx="282" cy="90" r="8" [attr.fill]="c().muted" opacity="0.5" />
          <rect width="320" height="24" [attr.fill]="c().bg" opacity="0.7" />
          <rect x="16" y="9" width="46" height="6" [attr.fill]="c().text" />
          <rect x="130" y="10" width="26" height="4" [attr.fill]="c().muted" />
          <rect x="164" y="10" width="26" height="4" [attr.fill]="c().muted" />
          <rect x="262" y="6" width="42" height="13" rx="1" [attr.fill]="accent()" />
          <rect x="16" y="68" width="10" height="2" [attr.fill]="accent()" />
          <rect x="16" y="76" width="200" height="22" [attr.fill]="c().text" />
          <rect x="16" y="102" width="130" height="22" [attr.fill]="c().text" />
          <rect x="16" y="132" width="288" height="22" rx="2" [attr.fill]="c().surface" opacity="0.92" [attr.stroke]="c().line" />
          <rect x="22" y="138" width="110" height="10" rx="1" [attr.fill]="c().bg" />
          @for (x of [16, 166]; track x) {
            <rect [attr.x]="x" y="164" width="138" height="40" [attr.fill]="c().surface2" />
          }
        }
        @case ('market') {
          <rect width="320" height="22" [attr.fill]="c().surface" />
          <rect y="22" width="320" height="1" [attr.fill]="c().line" />
          <rect x="16" y="8" width="46" height="6" rx="2" [attr.fill]="c().text" />
          <rect x="110" y="9" width="24" height="4" rx="2" [attr.fill]="c().muted" />
          <rect x="142" y="9" width="24" height="4" rx="2" [attr.fill]="c().muted" />
          <rect x="262" y="5" width="42" height="12" rx="4" [attr.fill]="accent()" />
          <rect x="16" y="32" width="150" height="9" rx="2" [attr.fill]="c().text" />
          <rect x="16" y="50" width="80" height="150" rx="5" [attr.fill]="c().surface" [attr.stroke]="c().line" />
          @for (y of [58, 84, 110, 136, 162]; track y) {
            <rect x="23" [attr.y]="y" width="66" height="4" rx="1" [attr.fill]="c().muted" />
            <rect x="23" [attr.y]="y + 8" width="66" height="12" rx="3" [attr.fill]="c().surface2" />
          }
          @for (row of [50, 108, 166]; track row) {
            @for (x of [104, 176, 248]; track x) {
              <rect [attr.x]="x" [attr.y]="row" width="64" height="52" rx="5" [attr.fill]="c().surface" [attr.stroke]="c().line" />
              <rect [attr.x]="x" [attr.y]="row" width="64" height="28" rx="5" [attr.fill]="c().surface2" />
              <rect [attr.x]="x + 6" [attr.y]="row + 33" width="42" height="3" rx="1" [attr.fill]="c().muted" />
              <rect [attr.x]="x + 6" [attr.y]="row + 40" width="30" height="6" rx="1" [attr.fill]="c().text" />
            }
          }
        }
        @case ('local') {
          <rect x="16" y="9" width="54" height="8" rx="3" [attr.fill]="c().text" />
          <rect x="120" y="11" width="28" height="5" rx="2" [attr.fill]="c().muted" />
          <rect x="156" y="11" width="28" height="5" rx="2" [attr.fill]="c().muted" />
          <rect x="258" y="6" width="46" height="15" rx="7.5" [attr.fill]="accent()" />
          <rect x="0" y="27" width="320" height="1" [attr.fill]="c().line" />
          <rect x="16" y="50" width="12" height="2" [attr.fill]="accent()" />
          <rect x="33" y="49" width="40" height="3" rx="1" [attr.fill]="c().muted" />
          <rect x="16" y="62" width="130" height="16" rx="3" [attr.fill]="c().text" />
          <rect x="16" y="83" width="96" height="16" rx="3" [attr.fill]="c().text" />
          <rect x="172" y="36" width="132" height="82" rx="18" [attr.fill]="'url(#warm-' + template() + ')'" />
          <circle cx="278" cy="56" r="8" [attr.fill]="c().bg" opacity="0.7" />
          <path d="M172 104 q40 -28 80 -8 t52 -2 v14 h-132 z" [attr.fill]="c().surface2" opacity="0.8" />
          <rect x="16" y="126" width="288" height="24" rx="12" [attr.fill]="c().surface" [attr.stroke]="c().line" />
          <rect x="26" y="132" width="150" height="12" rx="6" [attr.fill]="c().bg" />
          @for (x of [16, 118, 220]; track x) {
            <rect [attr.x]="x" y="156" width="84" height="14" rx="7" [attr.fill]="c().surface" [attr.stroke]="c().line" />
            <rect [attr.x]="x + 10" y="161" width="40" height="4" rx="1" [attr.fill]="c().muted" />
          }
          @for (x of [16, 115, 214]; track x) {
            <rect [attr.x]="x" y="178" width="90" height="40" rx="12" [attr.fill]="c().surface" [attr.stroke]="c().line" />
            <rect [attr.x]="x" y="178" width="90" height="20" rx="12" [attr.fill]="c().surface2" />
          }
        }
      }
    </svg>
  `,
})
export class TemplatePreview {
  readonly template = input.required<SiteTemplate>();
  readonly theme = input<'dark' | 'light'>('light');
  readonly accent = input('#e63b2e');

  readonly c = computed(() => PALETTES[this.template()][this.theme()]);
}
