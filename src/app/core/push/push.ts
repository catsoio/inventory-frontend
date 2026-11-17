import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import type { PushNotificationsPlugin } from '@capacitor/push-notifications';
import { API_URL } from '../api/axle-api';
import { deviceId, setRegisteredPushDevice } from './device';

/** En adress i appen som ett meddelande bär, om den är en egen sida (aldrig en annan sajt). */
export function pageOf(data: unknown): string | null {
  const url = (data as { url?: unknown } | null | undefined)?.url;
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : null;
}

/**
 * Push-notiser i appen (iOS via APNs, Android via FCM; servern väljer själv väg efter plattformen).
 * Enheten registreras hos servern med sitt token efter inloggning, och ett tryck på ett meddelande
 * öppnar sidan det pekar på. I en vanlig webbläsare gör tjänsten ingenting.
 */
@Injectable({ providedIn: 'root' })
export class Push {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private listening = false;

  /** Ber om tillstånd första gången och registrerar enheten. Går bra att anropa igen. */
  async start(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      await this.listen(PushNotifications);
      let permission = await PushNotifications.checkPermissions();
      if (permission.receive.startsWith('prompt')) {
        permission = await PushNotifications.requestPermissions();
      }
      if (permission.receive !== 'granted') return;
      // Tokenet kan ha bytts sedan sist, så enheten anmäls om vid varje start.
      await PushNotifications.register();
    } catch (e) {
      console.warn('Push kunde inte startas', e);
    }
  }

  private async listen(plugin: PushNotificationsPlugin): Promise<void> {
    if (this.listening) return;
    this.listening = true;
    await plugin.addListener('registration', (token) => this.send(token.value));
    await plugin.addListener('registrationError', (e) =>
      console.warn('Push kunde inte registreras', e),
    );
    // Appen är öppen: inget system-meddelande visas, så det visas här.
    await plugin.addListener('pushNotificationReceived', (n) => {
      const text = [n.title, n.body].filter(Boolean).join(': ');
      const page = pageOf(n.data);
      const ref = this.snack.open(text, page ? 'Öppna' : undefined, { duration: 7000 });
      if (page) ref.onAction().subscribe(() => void this.router.navigateByUrl(page));
    });
    // Ett tryck på meddelandet i systemet.
    await plugin.addListener('pushNotificationActionPerformed', (a) => {
      const page = pageOf(a.notification.data);
      if (page) void this.router.navigateByUrl(page);
    });
  }

  private send(pushToken: string): void {
    const id = deviceId();
    this.http
      .post(`${API_URL}/users/me/devices`, {
        deviceId: id,
        platform: Capacitor.getPlatform(),
        pushToken,
      })
      .subscribe({
        next: () => setRegisteredPushDevice(id),
        error: () => {},
      });
  }
}
