const ID_KEY = 'garagestock.deviceId';
const PUSH_KEY = 'garagestock.pushDevice';

/** Den här installationens id: samma varje gång, nytt först om webbläsarens lagring töms. */
export function deviceId(): string {
  try {
    const saved = localStorage.getItem(ID_KEY);
    if (saved) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem(ID_KEY, id);
    return id;
  } catch {
    // Utan lagring får enheten ett nytt id varje gång; då dubbleras bara raden hos servern.
    return crypto.randomUUID();
  }
}

/** Enheten som servern känner för push, så att utloggningen kan ta bort den. */
export function registeredPushDevice(): string | null {
  try {
    return localStorage.getItem(PUSH_KEY);
  } catch {
    return null;
  }
}

export function setRegisteredPushDevice(id: string | null): void {
  try {
    if (id) localStorage.setItem(PUSH_KEY, id);
    else localStorage.removeItem(PUSH_KEY);
  } catch {
    // Lagringen är en bonus.
  }
}
