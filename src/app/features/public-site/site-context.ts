import { Injectable, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { environment } from '../../../environments/environment';
import { PublicSiteApi } from '../../core/api/car-api';
import { PublicSiteProfile } from '../../core/models';
import { signal } from '@angular/core';

/** Hostnames that are the app itself; anything else is a customer's own domain. */
const OWN_HOSTS = ['localhost', 'catso.io'];

/** Whether the page was opened on a customer's own domain (not our app, not an IP address). */
export function onCustomDomain(host = globalThis.location?.hostname ?? ''): boolean {
  if (!host || /^[\d.]+$/.test(host) || host.includes(':')) return false;
  return !OWN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * Which site the visitor is on: `/bilhandel/<slug>` on the platform, or the domain's hostname on a
 * customer's own domain. Both go to the API as the same key.
 */
@Injectable()
export class SiteContext {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(PublicSiteApi);
  private readonly title = inject(Title);

  /** The key the public API wants. */
  readonly key: string =
    this.route.snapshot.pathFromRoot.map((r) => r.paramMap.get('slug')).find(Boolean) ??
    globalThis.location?.hostname ??
    '';
  /** Links stay inside the site: under /bilhandel/<slug> on the platform, from / on a domain. */
  readonly base: string[] = this.route.snapshot.pathFromRoot.some((r) => r.paramMap.has('slug'))
    ? ['/bilhandel', this.key]
    : ['/'];
  readonly profile = signal<PublicSiteProfile | null>(null);
  readonly notFound = signal(false);
  readonly media = (path: string | null) => (path ? environment.apiUrl + path : '');

  load() {
    this.api.profile(this.key).subscribe({
      next: (p) => {
        this.profile.set(p);
        this.title.setTitle(p.title);
      },
      error: () => this.notFound.set(true),
    });
  }

  setTitle(page: string) {
    const site = this.profile()?.title;
    this.title.setTitle(site ? `${page} – ${site}` : page);
  }
}
