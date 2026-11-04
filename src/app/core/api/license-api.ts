import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Delarna av Axle som kan slås på och av per garage. Nycklarna är samma som på servern. */
export const MODULE_INFO: { id: string; label: string; text: string }[] = [
  { id: 'artiklar', label: 'Artiklar och lager', text: 'Lagersaldo, inköp och artiklar.' },
  { id: 'dackhotell', label: 'Däckhotell', text: 'Inlämningar, hyllor och inkallning.' },
  { id: 'kunder', label: 'Kunder och bilar', text: 'Kund- och bilregister.' },
  { id: 'tidsbokning', label: 'Tidsbokning', text: 'Kalendern med bokningar.' },
  {
    id: 'arbetsorder',
    label: 'Arbetsorder och offert',
    text: 'Arbetsblad, offerter och kundens svar.',
  },
  { id: 'bokforing', label: 'Ekonomi', text: 'Bokföring, moms, kassaregister och betalningar.' },
  { id: 'onlinebokning', label: 'Onlinebokning', text: 'Kundens egen bokningssida.' },
  { id: 'bilhandel', label: 'Bilhandel', text: 'Bilar till salu och webbplats på egen domän.' },
  { id: 'sms', label: 'SMS till kunder', text: 'Texter om offerter, inkallning och bokningar.' },
];

/** Garagets licens som Catso ser den (superadmin). */
export interface GarageLicense {
  state: string;
  plan: 'dack' | 'verkstad';
  status: string;
  /** Det garaget får använda nu. */
  modules: string[];
  /** Vad planen ensam ger. */
  planModules: string[];
  /** Falskt: planen blockerar inget än, bara det som är avstängt. */
  enforced: boolean;
  addModules: string[];
  removeModules: string[];
  trialEndsAt: string;
}

interface OverviewRow {
  id: string;
  subscription: GarageLicense | null;
}

@Injectable({ providedIn: 'root' })
export class LicenseApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventory/garage`;

  overview(): Observable<OverviewRow[]> {
    return this.http.get<OverviewRow[]>(`${this.base}/admin/overview`);
  }

  /** Ändrar plan och/eller vilka delar som är på eller av. Listorna ersätter de gamla. */
  save(
    garageId: string,
    body: { plan?: 'dack' | 'verkstad'; addModules?: string[]; removeModules?: string[] },
  ): Observable<unknown> {
    return this.http.put(`${this.base}/${garageId}/license`, body);
  }
}
