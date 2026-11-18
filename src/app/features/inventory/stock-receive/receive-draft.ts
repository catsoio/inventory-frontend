import { Injectable, computed, signal } from '@angular/core';

/** En rad i inköpet som tas emot: en artikel, hur många och vad den kostade. */
export interface ReceiveLine {
  articleId: string;
  label: string;
  code: string | null;
  quantity: number;
  /** Pris per styck i kronor inkl. moms som text i fältet; tomt = saknas. */
  unitCost: string;
  /** Hämtas i bakgrunden; förfyller leverantör och pris. */
  loaded: boolean;
}

/**
 * Utkastet till ett inköp. Det bor här och inte i sidan, så att det finns kvar när man lämnar
 * sidan för att skapa en artikel som saknas, och när man kommer tillbaka. Ingenting är sparat på
 * servern förrän man bekräftar.
 */
@Injectable({ providedIn: 'root' })
export class ReceiveDraft {
  readonly lines = signal<ReceiveLine[]>([]);
  readonly supplier = signal('');
  readonly reference = signal('');

  readonly units = computed(() => this.lines().reduce((n, l) => n + l.quantity, 0));
  /** Summan i öre inkl. moms, för de rader som har pris. */
  readonly totalOre = computed(() =>
    this.lines().reduce((s, l) => s + Math.round(Number(l.unitCost || 0) * 100) * l.quantity, 0),
  );
  readonly missingPrice = computed(
    () => this.lines().filter((l) => l.unitCost.trim() === '' || Number(l.unitCost) < 0).length,
  );

  /** Skannad artikel: finns raden blir det en till, annars läggs en ny först. Returnerar raden. */
  add(line: Omit<ReceiveLine, 'quantity'>): ReceiveLine {
    const existing = this.lines().find((l) => l.articleId === line.articleId);
    if (existing) {
      this.patch(existing.articleId, { quantity: existing.quantity + 1 });
      return { ...existing, quantity: existing.quantity + 1 };
    }
    const created = { ...line, quantity: 1 };
    this.lines.update((ls) => [created, ...ls]);
    return created;
  }

  patch(articleId: string, change: Partial<ReceiveLine>) {
    this.lines.update((ls) => ls.map((l) => (l.articleId === articleId ? { ...l, ...change } : l)));
  }

  remove(articleId: string) {
    this.lines.update((ls) => ls.filter((l) => l.articleId !== articleId));
  }

  clear() {
    this.lines.set([]);
    this.supplier.set('');
    this.reference.set('');
  }
}
