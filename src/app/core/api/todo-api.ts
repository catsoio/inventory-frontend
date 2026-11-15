import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TodoSnapshot } from '../models';

/** Det som väntar på någon (menyns siffror och "Att göra"), hämtat i ett anrop. */
@Injectable({ providedIn: 'root' })
export class TodoApi {
  private readonly http = inject(HttpClient);

  snapshot(): Observable<TodoSnapshot> {
    return this.http.get<TodoSnapshot>(`${environment.apiUrl}/inventory/todo`);
  }
}
