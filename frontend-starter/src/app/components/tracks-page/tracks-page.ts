import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { HttpEventType } from '@angular/common/http';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
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
  imports: [ReactiveFormsModule, MatPaginatorModule, MatSnackBarModule],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent {
  private readonly service = inject(TrackService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly snackBar = inject(MatSnackBar);

  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly limit = signal(5);
  readonly total = signal(0);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly uploading = signal(false);
  readonly uploadProgress = signal(0);
  readonly deletingId = signal<string | null>(null);
  readonly error = signal('');
  readonly uploadSuccess = signal('');
  readonly deleteSuccess = signal('');
  readonly currentTrack = signal<Track | null>(null);
  readonly audioUrl = signal('');

  readonly title = new FormControl('', { nonNullable: true });
  readonly searchFilter = new FormControl('', { nonNullable: true });
  readonly search = signal('');
  file?: File;

  // Filtrage réactif par titre
  readonly filteredTracks = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.tracks();
    return this.tracks().filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.artist && t.artist.toLowerCase().includes(q)) ||
        (t.album && t.album.toLowerCase().includes(q)),
    );
  });

  constructor() {
    this.searchFilter.valueChanges.subscribe((val) => this.search.set(val));
    this.load();

    // Révocation propre de l'URL Blob en mémoire à la destruction du composant
    this.destroyRef.onDestroy(() => {
      const url = this.audioUrl();
      if (url) URL.revokeObjectURL(url);
    });
  }

  formatSize(bytes: number): string {
    if (!bytes || bytes === 0) return '0 octet';
    const k = 1024;
    const sizes = ['octets', 'Ko', 'Mo', 'Go'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  choose(event: Event): void {
    this.uploadSuccess.set('');
    this.deleteSuccess.set('');
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
    this.service.list(this.page(), this.limit()).subscribe({
      next: (response) => {
        this.tracks.set(response.items);
        this.total.set(response.total);
        this.pages.set(response.pages);
        this.loading.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        this.error.set(err.error?.message ?? 'Impossible de charger les pistes.');
        this.loading.set(false);
      },
    });
  }

  onMatPageChange(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.limit.set(event.pageSize);
    this.load();
  }

  upload(fileInput: HTMLInputElement): void {
    if (!this.file || this.uploading()) return;

    this.uploading.set(true);
    this.uploadProgress.set(0);
    this.uploadSuccess.set('');
    this.deleteSuccess.set('');
    this.error.set('');

    const trackTitle = this.title.value.trim() || this.file.name;

    this.service.uploadWithProgress(this.file, trackTitle).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          const percent = Math.round((100 * event.loaded) / event.total);
          this.uploadProgress.set(percent);
        } else if (event.type === HttpEventType.Response && event.body) {
          const track = event.body;
          this.uploading.set(false);
          this.uploadProgress.set(100);
          this.uploadSuccess.set(`Piste « ${track.title} » importée avec succès !`);
          this.title.setValue('');
          this.file = undefined;
          fileInput.value = '';
          this.page.set(1);
          this.load();
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.uploading.set(false);
        this.uploadProgress.set(0);
        this.error.set(err.error?.message ?? "Erreur lors de l'envoi de la piste.");
      },
    });
  }

  deleteTrack(track: Track): void {
    if (this.deletingId()) return; // Empêcher les doubles clics

    const ok = window.confirm(`Voulez-vous vraiment supprimer le morceau « ${track.title} » ?`);
    if (!ok) return;

    this.deletingId.set(track.id);
    this.error.set('');
    this.deleteSuccess.set('');

    this.service.delete(track.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        const msg = `Piste « ${track.title} » supprimée avec succès.`;
        this.deleteSuccess.set(msg);
        this.snackBar.open(msg, 'Fermer', { duration: 4000, horizontalPosition: 'end' });

        if (this.currentTrack()?.id === track.id) {
          this.currentTrack.set(null);
          const previousUrl = this.audioUrl();
          if (previousUrl) URL.revokeObjectURL(previousUrl);
          this.audioUrl.set('');
        }
        // Si on était sur la dernière page et qu'elle devient vide, reculer d'une page
        if (this.tracks().length === 1 && this.page() > 1) {
          this.page.set(this.page() - 1);
        }
        this.load();
      },
      error: (err: { status?: number; error?: { message?: string } }) => {
        this.deletingId.set(null);
        let errorMsg = err.error?.message ?? 'Échec de la suppression de la piste.';

        // Gestion du cas où la piste n'existe plus ou n'appartient pas à l'utilisateur (404/403)
        if (err.status === 404) {
          errorMsg = `La piste « ${track.title} » n'existe plus ou a déjà été supprimée.`;
          // Rafraîchir quand même pour synchroniser la liste locale avec le serveur
          this.load();
        } else if (err.status === 403) {
          errorMsg = `Action refusée : vous n'êtes pas autorisé à supprimer « ${track.title} ».`;
        }

        this.error.set(errorMsg);
        this.snackBar.open(errorMsg, 'Fermer', {
          duration: 5000,
          horizontalPosition: 'end',
          panelClass: ['error-snackbar'],
        });
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
