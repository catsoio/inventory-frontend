import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Page } from '../models';

export interface ActivityEntry {
  id: string;
  actorId: string;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  label: string | null;
  fields: string[];
  createdAt: string;
}

/** Aktivitetsloggen: vem som ändrat vad i verkstaden. */
@Injectable({ providedIn: 'root' })
export class ActivityApi {
  private readonly http = inject(HttpClient);

  list(opts: { entity?: string; limit?: number; offset?: number }): Observable<Page<ActivityEntry>> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(opts)) if (v) params = params.set(k, String(v));
    return this.http.get<Page<ActivityEntry>>(`${environment.apiUrl}/inventory/activity`, { params });
  }
}
