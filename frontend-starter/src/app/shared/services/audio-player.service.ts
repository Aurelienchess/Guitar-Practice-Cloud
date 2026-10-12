import { inject, Injectable, signal } from '@angular/core';
import { Track } from '../models/track.model';
import { TrackService } from './track.service';

/**
 * Service centralisé gérant la lecture audio de manière persistante.
 * L'instance HTMLAudioElement reste en mémoire vive dans ce singleton,
 * garantissant que la musique continue sans coupure lors des changements de page.
 */
@Injectable({
  providedIn: 'root',
})
export class AudioPlayerService {
  private readonly trackService = inject(TrackService);

  /** Élément audio HTML5 unique et persistant en mémoire vive pour toute l'application */
  private readonly audioEl = new Audio();

  /** Morceau en cours de lecture */
  readonly currentTrack = signal<Track | null>(null);

  /** État de lecture réactif (true = en cours de lecture) */
  readonly isPlaying = signal<boolean>(false);

  /** Position de lecture courante en secondes */
  readonly currentTime = signal<number>(0);

  /** Durée totale du morceau en secondes */
  readonly duration = signal<number>(0);

  /** URL Blob active */
  readonly audioUrl = signal<string>('');

  /** Message d'erreur éventuel */
  readonly error = signal<string>('');

  /** État de chargement du flux audio */
  readonly loading = signal<boolean>(false);

  constructor() {
    this.audioEl.preload = 'metadata';

    this.audioEl.addEventListener('play', () => {
      this.isPlaying.set(true);
    });

    this.audioEl.addEventListener('pause', () => {
      this.isPlaying.set(false);
    });

    this.audioEl.addEventListener('ended', () => {
      this.isPlaying.set(false);
      this.currentTime.set(0);
    });

    this.audioEl.addEventListener('timeupdate', () => {
      this.currentTime.set(this.audioEl.currentTime);
    });

    this.audioEl.addEventListener('loadedmetadata', () => {
      this.duration.set(this.audioEl.duration || 0);
    });

    this.audioEl.addEventListener('error', () => {
      this.isPlaying.set(false);
      this.loading.set(false);
      this.error.set('Erreur lors de la lecture du flux audio.');
    });
  }

  /**
   * Lance la lecture d'un morceau
   */
  playTrack(track: Track): void {
    // Si c'est déjà le morceau actif et qu'il est chargé
    if (this.currentTrack()?.id === track.id && this.audioUrl()) {
      if (this.isPlaying()) {
        this.pause();
      } else {
        this.resume();
      }
      return;
    }

    this.error.set('');
    this.loading.set(true);

    this.trackService.audio(track.id).subscribe({
      next: (blob) => {
        const previousUrl = this.audioUrl();
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl);
        }

        const newUrl = URL.createObjectURL(blob);
        this.audioUrl.set(newUrl);
        this.currentTrack.set(track);
        this.audioEl.src = newUrl;
        this.loading.set(false);

        this.audioEl
          .play()
          .then(() => {
            this.isPlaying.set(true);
          })
          .catch((err) => {
            console.warn('Lecture automatique restreinte par le navigateur :', err);
            this.isPlaying.set(false);
          });
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading.set(false);
        this.error.set(
          err.error?.message ?? `Impossible de charger l'audio de « ${track.title} ».`,
        );
      },
    });
  }

  /**
   * Bascule entre Lecture et Pause
   */
  togglePlay(track?: Track): void {
    if (track && (!this.currentTrack() || this.currentTrack()?.id !== track.id)) {
      this.playTrack(track);
    } else if (this.isPlaying()) {
      this.pause();
    } else {
      this.resume();
    }
  }

  pause(): void {
    this.audioEl.pause();
    this.isPlaying.set(false);
  }

  resume(): void {
    if (this.audioEl.src) {
      this.audioEl
        .play()
        .then(() => this.isPlaying.set(true))
        .catch((err) => console.warn('Reprise audio bloquée :', err));
    }
  }

  seek(seconds: number): void {
    if (this.audioEl.duration) {
      this.audioEl.currentTime = Math.max(0, Math.min(seconds, this.audioEl.duration));
    }
  }

  setVolume(vol: number): void {
    this.audioEl.volume = Math.max(0, Math.min(1, vol));
  }

  stop(): void {
    this.audioEl.pause();
    this.audioEl.currentTime = 0;
    const url = this.audioUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.audioUrl.set('');
    this.currentTrack.set(null);
    this.isPlaying.set(false);
    this.currentTime.set(0);
  }

  /**
   * Fournit l'instance HTMLAudioElement pour les liaisons Web Audio API et Butterchurn
   */
  getAudioElement(): HTMLAudioElement {
    return this.audioEl;
  }
}

