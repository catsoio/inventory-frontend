/**
 * Utskrifter som byggs som eget dokument (etiketter, listor) använder samma färger som
 * arbetsbladet: ett gråsvart bläck (`INK`) för text och linjer, två ljusare grå för hårfina
 * linjer och klipplinjer, och vitt papper. Inga andra färger.
 */
export const INK = '#4b5563';
export const LINE = '#9ca3af';
export const HAIR = '#d1d5db';

export const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Skriver ut ett HTML-dokument i en dold ram, så att resten av sidan inte påverkar utskriften. */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const win = frame.contentWindow!;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.onafterprint = () => frame.remove();
  // Ge dokumentet en tick att lägga ut sig innan utskriften startar.
  setTimeout(() => {
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 60_000);
  }, 100);
}
