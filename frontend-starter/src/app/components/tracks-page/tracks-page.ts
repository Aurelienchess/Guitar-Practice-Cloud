import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 Mo
const ALLOWED_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
]);

@Component({
  imports: [ReactiveFormsModule],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent {
  private readonly service = inject(TrackService);
  private readonly destroyRef = inject(DestroyRef);

  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly uploading = signal(false);
  readonly error = signal('');
  readonly uploadSuccess = signal('');
  readonly currentTrack = signal<Track | null>(null);
  readonly audioUrl = signal('');
  readonly title = new FormControl('', { nonNullable: true });
  file?: File;

  constructor() {
    this.load();

    // Révocation propre de l'URL Blob en mémoire à la destruction du composant
    this.destroyRef.onDestroy(() => {
      const url = this.audioUrl();
      if (url) URL.revokeObjectURL(url);
    });
  }

  choose(event: Event): void {
    this.uploadSuccess.set('');
    this.error.set('');
    const input = event.target as HTMLInputElement;
    const selectedFile = input.files?.[0];

    if (!selectedFile) {
      this.file = undefined;
      return;
    }

    // Validation préalable côté frontend : taille max 25 Mo
    if (selectedFile.size > MAX_FILE_SIZE) {
      this.error.set('Le fichier sélectionné dépasse la limite autorisée de 25 Mo.');
      input.value = '';
      this.file = undefined;
      return;
    }

    // Validation préalable côté frontend : type MIME audio
    if (selectedFile.type && !ALLOWED_MIME_TYPES.has(selectedFile.type)) {
      this.error.set(
        `Format audio non supporté (${selectedFile.type}). Formats acceptés : MP3, WAV, OGG, M4A.`,
      );
      input.value = '';
      this.file = undefined;
      return;
    }

    this.file = selectedFile;
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.service.list(this.page(), 5).subscribe({
      next: (response) => {
        this.tracks.set(response.items);
        this.pages.set(response.pages);
        this.loading.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        this.error.set(err.error?.message ?? 'Impossible de charger les pistes.');
        this.loading.set(false);
      },
    });
  }

  go(page: number): void {
    if (page < 1 || page > this.pages() || page === this.page()) return;
    this.page.set(page);
    this.load();
  }

  upload(fileInput: HTMLInputElement): void {
    if (!this.file || this.uploading()) return;

    this.uploading.set(true);
    this.uploadSuccess.set('');
    this.error.set('');

    const trackTitle = this.title.value.trim() || this.file.name;

    this.service.upload(this.file, trackTitle).subscribe({
      next: (track) => {
        this.uploading.set(false);
        this.uploadSuccess.set(`Piste « ${track.title} » importée avec succès !`);
        this.title.setValue('');
        this.file = undefined;
        fileInput.value = '';
        this.page.set(1);
        this.load();
      },
      error: (err: { error?: { message?: string } }) => {
        this.uploading.set(false);
        this.error.set(err.error?.message ?? "Erreur lors de l'envoi de la piste.");
      },
    });
  }

  play(track: Track): void {
    this.error.set('');
    this.service.audio(track.id).subscribe({
      next: (blob) => {
        const previousUrl = this.audioUrl();
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        this.currentTrack.set(track);
        this.audioUrl.set(URL.createObjectURL(blob));
      },
      error: (err: { error?: { message?: string } }) => {
        this.error.set(err.error?.message ?? `Impossible de lire le fichier audio de « ${track.title} ».`);
      },
    });
  }
}
