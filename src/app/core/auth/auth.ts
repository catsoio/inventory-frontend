import { HttpClient } from '@angular/common/http';
import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, finalize, map, shareReplay, tap } from 'rxjs';
import { API_URL, InventoryApi } from '../api/inventory-api';
import { AuthTokens, AuthUser, Garage, GarageListItem, Role } from '../models';

const KEY = 'garagestock.auth';
const ACTING_KEY = 'garagestock.actingGarage';

// Backend svarar { tokens: { accessToken, refreshToken }, user }.
type AuthResponse = Partial<AuthTokens> & { tokens?: AuthTokens; user?: AuthUser };

const normalize = (r: AuthResponse, prevUser?: AuthUser): AuthTokens => ({
  accessToken: (r.tokens ?? r).accessToken!,
  refreshToken: (r.tokens ?? r).refreshToken!,
  user: r.user ?? prevUser,
});

function jwtPayload(token: string): Record<string, any> {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return {};
  }
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly http = inject(HttpClient);
  // Hämtas först vid behov: Router -> TitleStrategy -> PageTitle -> Auth får inte bli en cirkel.
  private readonly injector = inject(Injector);
  private get router(): Router {
    return this.injector.get(Router);
  }
  private readonly api = inject(InventoryApi);
  private readonly url = `${API_URL}/auth`;
  private refreshing$?: Observable<AuthTokens>;

  private readonly state = signal<AuthTokens | null>(
    JSON.parse(localStorage.getItem(KEY) ?? 'null'),
  );

  readonly isLoggedIn = computed(() => !!this.state()?.accessToken);
  readonly user = computed<AuthUser | undefined>(() => this.state()?.user);
  readonly roles = computed<Role[]>(() => {
    const s = this.state();
    if (!s) return [];
    return s.user?.roles ?? jwtPayload(s.accessToken)['roles'] ?? [];
  });
  /** The garage (tenant) the user works in; null until loaded or if none. */
  readonly garage = signal<Garage | null>(null);
  /** Användarens eget garage (skiljer sig från `garage` när superadmin tittar i ett annat). */
  readonly ownGarage = signal<Garage | null>(null);
  /** Alla garage, för superadmin. */
  readonly garages = signal<GarageListItem[]>([]);
  readonly isSuperAdmin = computed(() => !!this.ownGarage()?.superAdmin);
  /** Garage-id som skickas som X-Garage-Id; null när man jobbar i sitt eget. */
  readonly actingGarageId = signal<string | null>(localStorage.getItem(ACTING_KEY));
  readonly viewingOther = computed(
    () => this.isSuperAdmin() && !!this.garage() && this.garage()!.id !== this.ownGarage()?.id,
  );
  /** Garage owner: may archive articles and edit shared settings. */
  readonly isAdmin = computed(() => this.garage()?.role === 'owner');

  get accessToken(): string | null {
    return this.state()?.accessToken ?? null;
  }

  loginEmail(email: string, password: string) {
    return this.authenticate('email/login', { email, password });
  }
  loginPhone(phone: string, password: string) {
    return this.authenticate('login', { phone, password });
  }
  registerEmail(email: string, password: string) {
    return this.http.post(`${this.url}/email/register`, { email, password });
  }
  requestEmailOtp(email: string) {
    return this.http.post(`${this.url}/email/otp/request`, { email });
  }
  verifyEmailOtp(email: string, code: string) {
    return this.authenticate('email/otp/verify', { email, code });
  }

  /** Byter eget lösenord. Övriga sessioner loggas ut; den här får nya tokens. */
  changePassword(currentPassword: string, newPassword: string) {
    // /auth/-anrop får ingen token automatiskt, så den skickas explicit.
    return this.http
      .post<{ tokens: AuthTokens }>(
        `${this.url}/password/change`,
        { currentPassword, newPassword },
        { headers: { Authorization: `Bearer ${this.accessToken}` } },
      )
      .pipe(
        tap((r) =>
          this.store({
            accessToken: r.tokens.accessToken,
            refreshToken: r.tokens.refreshToken,
            user: this.state()?.user,
          }),
        ),
      );
  }

  loadGarage(): Observable<Garage> {
    return this.api.garage().pipe(
      tap((own) => {
        this.ownGarage.set(own);
        this.garage.set(own);
        if (own.superAdmin) this.loadGarages();
      }),
    );
  }

  /** Hämtar alla garage och tillämpar ett sparat val; okänt val rensas. */
  private loadGarages(): void {
    this.api.allGarages().subscribe({
      next: (list) => {
        this.garages.set(list);
        const id = this.actingGarageId();
        const target = id ? list.find((g) => g.id === id) : undefined;
        if (target && target.id !== this.ownGarage()?.id) {
          this.garage.set({ id: target.id, name: target.name, role: 'owner', superAdmin: true });
        } else if (id) {
          this.setActing(null);
        }
      },
    });
  }

  private setActing(id: string | null): void {
    if (id) localStorage.setItem(ACTING_KEY, id);
    else localStorage.removeItem(ACTING_KEY);
    this.actingGarageId.set(id);
  }

  /** Byter garage (superadmin) och laddar om appen så att all data hämtas på nytt. */
  switchGarage(id: string): void {
    this.setActing(id === this.ownGarage()?.id ? null : id);
    this.router.navigateByUrl('/dashboard').then(() => location.reload());
  }

  setGarage(g: Garage): void {
    this.ownGarage.set(g);
    this.garage.set(g);
  }

  refresh(): Observable<AuthTokens> {
    this.refreshing$ ??= this.http
      .post<AuthResponse>(`${this.url}/refresh`, { refreshToken: this.state()?.refreshToken })
      .pipe(
        map((r) => normalize(r, this.state()?.user)),
        tap((t) => this.store(t)),
        finalize(() => (this.refreshing$ = undefined)),
        shareReplay(1),
      );
    return this.refreshing$;
  }

  logout(): void {
    const refreshToken = this.state()?.refreshToken;
    if (refreshToken)
      this.http.post(`${this.url}/logout`, { refreshToken }).subscribe({ error: () => {} });
    this.clear();
  }

  clear(): void {
    localStorage.removeItem(KEY);
    this.setActing(null);
    this.state.set(null);
    this.garage.set(null);
    this.ownGarage.set(null);
    this.garages.set([]);
    this.router.navigate(['/login']);
  }

  private authenticate(path: string, body: object) {
    return this.http.post<AuthResponse>(`${this.url}/${path}`, body).pipe(
      map((r) => normalize(r)),
      tap((t) => this.store(t)),
    );
  }

  private store(t: AuthTokens): void {
    localStorage.setItem(KEY, JSON.stringify(t));
    this.state.set(t);
  }
}
