import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Page } from '../models/page.model';
import { Track } from '../models/track.model';

/** Encapsulates all HTTP operations for backing tracks. */
@Injectable({ providedIn: 'root' })
export class TrackService {
  private readonly http = inject(HttpClient);

  list(page = 1, limit = 5, search = '') {
    const params: Record<string, string | number> = { page, limit };
    if (search && search.trim()) {
      params['search'] = search.trim();
    }
    return this.http.get<Page<Track>>('/api/tracks', { params });
  }

  upload(file: File, title: string) {
    const body = new FormData();
    body.append('audio', file);
    body.append('title', title);
    return this.http.post<Track>('/api/tracks', body);
  }

  /** Upload avec suivi précis de la progression HTTP. */
  uploadWithProgress(file: File, title: string): Observable<HttpEvent<Track>> {
    const body = new FormData();
    body.append('audio', file);
    body.append('title', title);
    return this.http.post<Track>('/api/tracks', body, {
      reportProgress: true,
      observe: 'events',
    });
  }

  delete(id: string) {
    return this.http.delete<void>(`/api/tracks/${id}`);
  }

  audio(id: string) {
    return this.http.get(`/api/tracks/${id}/audio`, {
      responseType: 'blob',
    });
  }
}
