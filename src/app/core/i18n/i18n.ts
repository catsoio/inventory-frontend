import { Injectable, effect, signal } from '@angular/core';

export type Lang = 'sv' | 'en';

const KEY = 'garagestock.lang';
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];

const norm = (s: string): string => s.replace(/[\s ]+/g, ' ').trim();

interface Rec {
  orig: string;
  written: string;
}

/**
 * Språkval (svenska/engelska). Texten i mallarna är svenska; på engelska byter
 * `apply` ut synlig text och attribut mot ordlistan i `en.ts`. Det som saknas i
 * ordlistan visas oförändrat på svenska. Ordlistan hämtas först när engelska är valt, så att den
 * inte väger i det första paketet.
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  readonly lang = signal<Lang>(this.load());
  private dict = new Map<string, string>();
  private dictLoaded?: Promise<void>;
  private readonly texts = new WeakMap<Text, Rec>();
  private readonly attrs = new WeakMap<Element, Map<string, Rec>>();
  private observer?: MutationObserver;

  constructor() {
    effect(() => {
      const lang = this.lang();
      document.documentElement.lang = lang;
      if (lang === 'en') {
        void this.ensureDict().then(() => {
          // Hann man byta tillbaka till svenska innan ordlistan kom lämnas sidan som den är.
          if (this.lang() !== 'en') return;
          this.walk(document.body, true);
          this.observe();
        });
      } else {
        this.observer?.disconnect();
        this.walk(document.body, false);
      }
    });
  }

  set(lang: Lang): void {
    const changed = lang !== this.lang();
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* ignoreras */
    }
    this.lang.set(lang);
    // Datum, månads- och dagnamn och kalendern läses vid start, så appen laddas om på det nya språket.
    if (changed) location.reload();
  }

  private ensureDict(): Promise<void> {
    this.dictLoaded ??= import('./en').then(({ EN }) => {
      this.dict = new Map(Object.entries(EN).map(([k, v]) => [norm(k), v]));
    });
    return this.dictLoaded;
  }

  /** För text som byggs i kod (snackbars m.m.). Svenska tills ordlistan har hämtats. */
  t(sv: string): string {
    return this.lang() === 'en' ? (this.dict.get(norm(sv)) ?? sv) : sv;
  }

  private load(): Lang {
    try {
      return localStorage.getItem(KEY) === 'en' ? 'en' : 'sv';
    } catch {
      return 'sv';
    }
  }

  private translate(s: string): string | undefined {
    const hit = this.dict.get(norm(s));
    if (hit === undefined) return undefined;
    const lead = /^\s*/.exec(s)![0];
    const trail = /\s*$/.exec(s)![0];
    return lead + hit + trail;
  }

  private observe(): void {
    this.observer ??= new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'characterData') this.text(m.target as Text, true);
        else if (m.type === 'attributes') this.attr(m.target as Element, m.attributeName!, true);
        else m.addedNodes.forEach((n) => this.walk(n, true));
      }
    });
    this.observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });
  }

  private walk(root: Node, en: boolean): void {
    if (root.nodeType === Node.TEXT_NODE) return this.text(root as Text, en);
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n: Node | null = tw.currentNode;
    while (n) {
      if (n.nodeType === Node.TEXT_NODE) this.text(n as Text, en);
      else for (const a of ATTRS) this.attr(n as Element, a, en);
      n = tw.nextNode();
    }
  }

  private text(node: Text, en: boolean): void {
    const p = node.parentElement;
    if (!p || p.closest('mat-icon, script, style')) return;
    const rec = this.texts.get(node);
    if (rec && node.nodeValue === rec.written) {
      if (!en) {
        node.nodeValue = rec.orig;
        this.texts.delete(node);
      }
      return;
    }
    if (!en) return;
    const orig = node.nodeValue ?? '';
    const out = this.translate(orig);
    if (out !== undefined && out !== orig) {
      this.texts.set(node, { orig, written: out });
      node.nodeValue = out;
    }
  }

  private attr(el: Element, name: string, en: boolean): void {
    const recs = this.attrs.get(el);
    const rec = recs?.get(name);
    const cur = el.getAttribute(name);
    if (cur === null) return;
    if (rec && cur === rec.written) {
      if (!en) {
        el.setAttribute(name, rec.orig);
        recs!.delete(name);
      }
      return;
    }
    if (!en) return;
    const out = this.translate(cur);
    if (out !== undefined && out !== cur) {
      const m = recs ?? new Map<string, Rec>();
      m.set(name, { orig: cur, written: out });
      this.attrs.set(el, m);
      el.setAttribute(name, out);
    }
  }
}
