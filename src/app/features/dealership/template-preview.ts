import { Component, computed, input } from '@angular/core';
import { SiteTemplate } from '../../core/models';

/** Färgerna per mall och läge: samma som mallarnas paletter i catso-sites (`templates.ts`). */
const PALETTES: Record<
  SiteTemplate,
  Record<'dark' | 'light', { bg: string; surface: string; surface2: string; text: string; muted: string; line: string }>
> = {
  editorial: {
    dark: { bg: '#0d0c0b', surface: '#161412', surface2: '#201d1a', text: '#f3eee6', muted: '#a39b8f', line: '#2e2a25' },
    light: { bg: '#f6f1e7', surface: '#fffdf8', surface2: '#ece5d6', text: '#17140f', muted: '#6c6457', line: '#dcd3c0' },
  },
  showroom: {
    dark: { bg: '#07070a', surface: '#0f0f13', surface2: '#17171c', text: '#f5f5f3', muted: '#a0a0aa', line: '#23232a' },
    light: { bg: '#f1f1ee', surface: '#ffffff', surface2: '#e6e6e2', text: '#0d0d10', muted: '#62626b', line: '#d8d8d3' },
  },
  market: {
    dark: { bg: '#0e1116', surface: '#161b22', surface2: '#1d242d', text: '#eef1f5', muted: '#8b97a6', line: '#262e38' },
    light: { bg: '#f1f3f6', surface: '#ffffff', surface2: '#e7ebf0', text: '#14171c', muted: '#5d6978', line: '#dbe1e8' },
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
          <rect x="100" y="8" width="120" height="14" [attr.fill]="c().text" />
          <rect x="16" y="28" width="288" height="2" [attr.fill]="c().text" />
          @for (x of [80, 124, 168, 212]; track x) {
            <rect [attr.x]="x" y="35" width="32" height="3" [attr.fill]="c().muted" />
          }
          <rect x="16" y="42" width="288" height="1" [attr.fill]="c().text" />
          <rect x="56" y="54" width="208" height="16" [attr.fill]="c().text" />
          <rect x="86" y="74" width="148" height="16" [attr.fill]="c().text" />
          <rect x="16" y="100" width="170" height="52" [attr.fill]="c().surface2" />
          <rect x="198" y="106" width="30" height="3" [attr.fill]="accent()" />
          <rect x="198" y="114" width="94" height="9" [attr.fill]="c().text" />
          <rect x="198" y="128" width="70" height="3" [attr.fill]="c().muted" />
          <rect x="198" y="140" width="40" height="5" [attr.fill]="c().text" />
          @for (y of [160, 172, 184]; track y) {
            <rect x="16" [attr.y]="y" width="8" height="3" [attr.fill]="c().muted" />
            <rect x="36" [attr.y]="y - 1" width="90" height="6" [attr.fill]="c().text" />
            <rect x="170" [attr.y]="y" width="60" height="3" [attr.fill]="c().muted" />
            <rect x="272" [attr.y]="y" width="32" height="4" [attr.fill]="c().text" />
            <rect x="16" [attr.y]="y + 8" width="288" height="1" [attr.fill]="c().line" />
          }
        }
        @case ('showroom') {
          <rect width="320" height="118" [attr.fill]="'url(#fade-' + template() + ')'" />
          <path
            d="M150 66 q8 -20 34 -23 h60 q26 2 38 21 l10 5 v9 h-146 z"
            [attr.fill]="c().muted"
            opacity="0.35"
          />
          <rect x="16" y="9" width="40" height="5" [attr.fill]="c().text" />
          <rect x="146" y="10" width="22" height="3" [attr.fill]="c().muted" />
          <rect x="176" y="10" width="22" height="3" [attr.fill]="c().muted" />
          <rect x="268" y="6" width="36" height="12" [attr.fill]="accent()" />
          <rect x="16" y="64" width="190" height="20" [attr.fill]="c().text" />
          <rect x="16" y="88" width="120" height="20" [attr.fill]="c().text" />
          <rect y="118" width="320" height="14" [attr.fill]="c().surface" />
          @for (x of [16, 46, 76, 106]; track x) {
            <rect [attr.x]="x" y="122" width="24" height="6" [attr.fill]="c().line" />
          }
          <rect y="134" width="320" height="34" [attr.fill]="c().surface2" />
          <rect x="14" y="156" width="70" height="7" [attr.fill]="c().text" />
          <rect x="270" y="156" width="36" height="7" [attr.fill]="c().text" />
          <rect y="172" width="320" height="34" [attr.fill]="c().surface2" />
        }
        @case ('market') {
          <rect width="320" height="20" [attr.fill]="c().surface" />
          <rect x="16" y="7" width="40" height="6" rx="2" [attr.fill]="c().text" />
          <rect x="262" y="4" width="42" height="12" rx="4" [attr.fill]="accent()" />
          <rect y="20" width="320" height="58" [attr.fill]="accent()" />
          <rect x="16" y="29" width="130" height="9" rx="2" fill="#fff" />
          <rect x="16" y="48" width="108" height="16" rx="4" fill="#fff" />
          @for (x of [130, 186, 242]; track x) {
            <rect [attr.x]="x" y="48" width="50" height="16" rx="4" fill="#fff" />
          }
          <rect x="298" y="48" width="8" height="16" rx="3" [attr.fill]="c().text" />
          @for (y of [86, 124, 162]; track y) {
            <rect x="16" [attr.y]="y" width="288" height="32" rx="5" [attr.fill]="c().surface" [attr.stroke]="c().line" />
            <rect x="16" [attr.y]="y" width="56" height="32" rx="5" [attr.fill]="c().surface2" />
            <rect x="82" [attr.y]="y + 6" width="80" height="5" rx="1" [attr.fill]="c().text" />
            @for (x of [82, 106, 130]; track x) {
              <rect [attr.x]="x" [attr.y]="y + 16" width="20" height="7" rx="2" [attr.fill]="c().surface2" />
            }
            <rect x="262" [attr.y]="y + 9" width="34" height="8" rx="1" [attr.fill]="c().text" />
            <rect x="268" [attr.y]="y + 21" width="28" height="3" rx="1" [attr.fill]="accent()" />
          }
        }
        @case ('local') {
          <rect x="16" y="8" width="50" height="8" rx="3" [attr.fill]="c().text" />
          <rect x="120" y="10" width="26" height="4" rx="2" [attr.fill]="c().muted" />
          <rect x="154" y="10" width="26" height="4" rx="2" [attr.fill]="c().muted" />
          <rect x="258" y="5" width="46" height="14" rx="7" [attr.fill]="accent()" />
          <rect x="16" y="38" width="120" height="14" rx="3" [attr.fill]="c().text" />
          <rect x="16" y="56" width="86" height="14" rx="3" [attr.fill]="c().text" />
          <rect x="16" y="78" width="54" height="14" rx="7" [attr.fill]="accent()" />
          <rect x="76" y="78" width="40" height="14" rx="7" [attr.fill]="c().surface" [attr.stroke]="c().line" />
          <rect x="172" y="30" width="132" height="70" rx="16" [attr.fill]="'url(#warm-' + template() + ')'" />
          @for (x of [16, 115, 214]; track x) {
            <rect [attr.x]="x" y="108" width="90" height="22" rx="8" [attr.fill]="c().surface" [attr.stroke]="c().line" />
            <rect [attr.x]="x + 8" y="114" width="36" height="3" rx="1" [attr.fill]="c().muted" />
            <rect [attr.x]="x + 8" y="121" width="52" height="4" rx="1" [attr.fill]="c().text" />
          }
          <rect x="16" y="140" width="80" height="7" rx="2" [attr.fill]="c().text" />
          @for (x of [16, 120, 224]; track x) {
            <rect [attr.x]="x" y="152" width="98" height="52" rx="12" [attr.fill]="c().surface" [attr.stroke]="c().line" />
            <rect [attr.x]="x" y="152" width="98" height="28" rx="12" [attr.fill]="c().surface2" />
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
