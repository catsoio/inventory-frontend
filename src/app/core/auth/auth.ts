import { HttpClient } from '@angular/common/http';
import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, finalize, map, shareReplay, tap } from 'rxjs';
import { API_URL, AxleApi } from '../api/axle-api';
import { AuthTokens, AuthUser, Company, Garage, GarageListItem, Role } from '../models';

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
  private readonly api = inject(AxleApi);
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
  /** Bolagen ägaren kan växla mellan (minst två för att det ska vara aktuellt). */
  readonly companies = signal<Company[]>([]);
  /** Namnet från Fakturauppgifter för bolaget man är i; tomt tills det är ifyllt. */
  readonly sellerName = signal<string>('');
  /** Bolagets namn överst: fakturauppgiftens namn, annars garagets. */
  readonly companyName = computed(() => this.sellerName() || this.garage()?.name || '');
  readonly isSuperAdmin = computed(() => !!this.ownGarage()?.superAdmin);
  /** Garage-id som skickas som X-Garage-Id; null när man jobbar i sitt eget. */
  readonly actingGarageId = signal<string | null>(localStorage.getItem(ACTING_KEY));
  readonly viewingOther = computed(
    () => this.isSuperAdmin() && !!this.garage() && this.garage()!.id !== this.ownGarage()?.id,
  );
  /** Garage owner: may archive articles and edit shared settings. */
  readonly isAdmin = computed(() => this.garage()?.role === 'owner');
  /** Mekaniker: ser bara arbetsorder, utan priser och kunduppgifter. */
  readonly isMechanic = computed(() => this.garage()?.role === 'mechanic' && !this.isSuperAdmin());

  get accessToken(): string | null {
    return this.state()?.accessToken ?? null;
  }

  loginEmail(email: string, password: string) {
    return this.authenticate('email/login', { email, password });
  }
  loginPhone(phone: string, password: string) {
    return this.authenticate('login', { phone, password });
  }
  registerEmail(email: string, password: string, inviteCode: string) {
    return this.http.post(`${this.url}/email/register`, { email, password, inviteCode });
  }

  /** Koden man registrerade sig med; används vid nästa steg (gå med / skapa garage). */
  get pendingInviteCode(): string {
    try {
      return sessionStorage.getItem('catso.inviteCode') ?? '';
    } catch {
      return '';
    }
  }
  set pendingInviteCode(code: string) {
    try {
      if (code) sessionStorage.setItem('catso.inviteCode', code);
      else sessionStorage.removeItem('catso.inviteCode');
    } catch {
      // Utan sessionStorage skriver man bara in koden igen.
    }
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
        else if (own.role === 'owner') this.loadCompanies();
      }),
    );
  }

  /** Ägarens bolag; ett sparat val tillämpas, okänt val rensas. */
  private loadCompanies(): void {
    this.api.companies().subscribe({
      next: (list) => {
        this.companies.set(list);
        const id = this.actingGarageId();
        const target = id ? list.find((c) => c.id === id) : undefined;
        if (target && target.id !== this.ownGarage()?.id) {
          this.garage.set({ id: target.id, name: target.name, role: 'owner' });
        } else if (id) {
          this.setActing(null);
        }
      },
      error: () => this.setActing(null),
    });
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

  /** Bolagets namn följer Fakturauppgifter: byt det i menyn och listorna direkt. */
  renameGarage(name: string): void {
    const id = this.garage()?.id;
    if (!id || !name.trim()) return;
    const set = (g: Garage | null) => (g && g.id === id ? { ...g, name } : g);
    this.garage.update(set);
    this.ownGarage.update(set);
    this.garages.update((l) => l.map((g) => (g.id === id ? { ...g, name } : g)));
    this.companies.update((l) => l.map((c) => (c.id === id ? { ...c, name } : c)));
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
    this.companies.set([]);
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
