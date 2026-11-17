import { Capacitor, registerPlugin } from '@capacitor/core';

/** Läsarens läge i appen: Client ID inlagt, och om någon är inloggad på sitt PayPal-konto. */
export interface PayPalReaderStatus {
  configured: boolean;
  loggedIn: boolean;
}

/** Det läsaren svarar när kortet är dragna. Allt utom `reference` kan saknas. */
export interface PayPalReaderPayment {
  reference: string;
  amount?: string;
  transactionId?: string;
  cardBrand?: string;
  maskedPan?: string;
}

/**
 * Zettles Payments SDK i appen (iOS: `PayPalReaderPlugin` i `MainViewController.swift`). Telefonen
 * pratar med PayPal Reader över Bluetooth och skickar beloppet dit, så ingen slår in något i
 * PayPal-appen. Pengarna går till kontot som är inloggat i SDK:n.
 */
interface PayPalReaderPlugin {
  status(): Promise<PayPalReaderStatus>;
  /** Inloggning med PayPal POS-kontot (Zettles egen inloggningssida). */
  login(): Promise<void>;
  /** SDK:ns egen vy för kortläsare: parkoppla, byta, logga ut. */
  settings(): Promise<void>;
  /** `amount` i kronor med punkt, t.ex. "10.00". Läsarens egen vy visas medan kunden betalar. */
  charge(options: { amount: string; reference: string }): Promise<PayPalReaderPayment>;
}

const plugin = registerPlugin<PayPalReaderPlugin>('PayPalReader');

/** Bara i appen; i webbläsaren finns ingen Bluetooth-läsare. */
export const paypalReaderAvailable = () =>
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PayPalReader');

export const paypalReader = plugin;

/** Öre till kronor med två decimaler, som SDK:n vill ha beloppet. */
export const kronorOf = (ore: number) => (ore / 100).toFixed(2);
