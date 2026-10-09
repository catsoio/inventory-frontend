import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, finalize, map, shareReplay, tap } from 'rxjs';
import { API_URL } from '../api/inventory-api';
import { AuthTokens, AuthUser, Role } from '../models';

const KEY = 'garagestock.auth';

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
  private readonly router = inject(Router);
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
  readonly isAdmin = computed(() => this.roles().includes('admin'));

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
    this.state.set(null);
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
