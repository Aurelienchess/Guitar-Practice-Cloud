import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TrackService } from './track.service';
import { Page } from '../models/page.model';
import { Track } from '../models/track.model';

describe('TrackService', () => {
  let service: TrackService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TrackService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(TrackService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('list() doit transmettre page et limit en paramètres de requête GET /api/tracks', () => {
    const mockPage: Page<Track> = {
      items: [
        {
          id: 'track-1',
          title: 'Test Song',
          originalName: 'test.mp3',
          mimeType: 'audio/mpeg',
          size: 1024,
          createdAt: '2026-09-25T08:00:00.000Z',
        },
      ],
      page: 2,
      limit: 5,
      total: 8,
      pages: 2,
    };

    service.list(2, 5).subscribe((res) => {
      expect(res.items.length).toBe(1);
      expect(res.page).toBe(2);
      expect(res.limit).toBe(5);
    });

    const req = httpMock.expectOne((r) => r.url === '/api/tracks');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('5');

    req.flush(mockPage);
  });

  it('delete() doit appeler DELETE /api/tracks/:id', () => {
    service.delete('track-123').subscribe();

    const req = httpMock.expectOne('/api/tracks/track-123');
    expect(req.request.method).toBe('DELETE');

    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
