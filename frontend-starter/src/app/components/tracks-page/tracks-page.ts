import { AfterViewInit, Component, computed, ElementRef, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { HttpEventType } from '@angular/common/http';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { MatPaginatorIntl, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';
import { AudioPlayerService } from '../../shared/services/audio-player.service';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 Mo
const ALLOWED_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
]);

/** Labels français pour le paginator Angular Material */
function frenchPaginatorIntl(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.itemsPerPageLabel = 'Éléments par page :';
  intl.nextPageLabel = 'Page suivante';
  intl.previousPageLabel = 'Page précédente';
  intl.firstPageLabel = 'Première page';
  intl.lastPageLabel = 'Dernière page';
  intl.getRangeLabel = (page, pageSize, length) => {
    if (length === 0) return '0 sur 0';
    const start = page * pageSize + 1;
    const end = Math.min(start + pageSize - 1, length);
    return `${start} – ${end} sur ${length}`;
  };
  return intl;
}

@Component({
  imports: [ReactiveFormsModule, MatPaginatorModule, MatSnackBarModule],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
  providers: [{ provide: MatPaginatorIntl, useFactory: frenchPaginatorIntl }],
})
export class TracksPageComponent implements AfterViewInit {
  private readonly service = inject(TrackService);
  private readonly audioPlayer = inject(AudioPlayerService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly hostRef = inject(ElementRef);

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
  readonly currentTrack = this.audioPlayer.currentTrack;
  readonly audioUrl = this.audioPlayer.audioUrl;
  readonly isPlaying = this.audioPlayer.isPlaying;
  readonly trackToDelete = signal<Track | null>(null);
  readonly coverPreview = signal<string>('');
  readonly processingCover = signal(false);
  readonly updatingCoverId = signal<string | null>(null);

  readonly title = new FormControl('', { nonNullable: true });
  readonly searchFilter = new FormControl('', { nonNullable: true });
  readonly search = signal('');
  file?: File;

  // Les pistes de la page courante renvoyées par le serveur selon le filtre
  readonly filteredTracks = computed(() => this.tracks());

  constructor() {
    // Filtrage dynamique avec pagination serveur : réinitialise à la page 1
    this.searchFilter.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((val) => {
        this.search.set(val);
        this.page.set(1);
        this.load();
      });

    this.load();
  }

  ngAfterViewInit(): void {
    // Assure la cohérence des tooltips sur les boutons de navigation du paginator
    setTimeout(() => {
      const el = this.hostRef.nativeElement as HTMLElement;
      el.querySelectorAll<HTMLButtonElement>('mat-paginator button[aria-label]')
        .forEach((btn) => {
          // Le bouton « Dernière page » a un tooltip CSS animé dédié (styles.css)
          // → on retire son title natif pour éviter les doublons
          if (btn.classList.contains('mat-mdc-paginator-navigation-last')) {
            btn.removeAttribute('title');
          } else if (!btn.title && btn.getAttribute('aria-label')) {
            btn.title = btn.getAttribute('aria-label')!;
          }
        });
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

  /** Redimensionne et compresse l'image (max 800x800 JPEG 85%) pour un transfert ultra-rapide et fiable. */
  private optimizeImage(file: File, maxWidth = 800, maxHeight = 800, quality = 0.85): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Erreur de lecture du fichier image'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Format d'image non lisible"));
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(reader.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const optimized = canvas.toDataURL('image/jpeg', quality);
          resolve(optimized);
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  async chooseCover(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      this.coverPreview.set('');
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.snackBar.open('Veuillez sélectionner un fichier image valide (JPG, PNG, WebP).', 'Fermer', {
        duration: 3500,
        panelClass: ['error-snackbar'],
      });
      input.value = '';
      this.coverPreview.set('');
      return;
    }

    this.processingCover.set(true);
    try {
      const optimized = await this.optimizeImage(file);
      this.coverPreview.set(optimized);
    } catch {
      this.snackBar.open("Impossible de traiter cette image.", 'Fermer', {
        duration: 3500,
        panelClass: ['error-snackbar'],
      });
      input.value = '';
      this.coverPreview.set('');
    } finally {
      this.processingCover.set(false);
    }
  }

  clearCover(coverInput?: HTMLInputElement): void {
    this.coverPreview.set('');
    if (coverInput) {
      coverInput.value = '';
    }
  }

  async changeTrackCover(track: Track, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.snackBar.open('Format image non valide (JPG, PNG, WebP acceptés).', 'Fermer', {
        duration: 3500,
        panelClass: ['error-snackbar'],
      });
      input.value = '';
      return;
    }

    this.updatingCoverId.set(track.id);
    try {
      const optimized = await this.optimizeImage(file);
      this.service.updateCover(track.id, optimized).subscribe({
        next: (updatedTrack) => {
          this.updatingCoverId.set(null);
          this.tracks.update((items) =>
            items.map((t) => (t.id === track.id ? { ...t, coverImage: updatedTrack.coverImage } : t)),
          );
          this.snackBar.open(`Photo de couverture mise à jour pour « ${track.title} » !`, 'Fermer', {
            duration: 3500,
            panelClass: ['success-snackbar'],
          });
          input.value = '';
        },
        error: (err: { error?: { message?: string } }) => {
          this.updatingCoverId.set(null);
          this.snackBar.open(err.error?.message ?? 'Échec de la mise à jour de la photo.', 'Fermer', {
            duration: 4000,
            panelClass: ['error-snackbar'],
          });
          input.value = '';
        },
      });
    } catch {
      this.updatingCoverId.set(null);
      this.snackBar.open("Erreur lors de la lecture de l'image.", 'Fermer', {
        duration: 3500,
        panelClass: ['error-snackbar'],
      });
      input.value = '';
    }
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.service.list(this.page(), this.limit(), this.search()).subscribe({
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

  upload(fileInput: HTMLInputElement, coverInput?: HTMLInputElement): void {
    if (!this.file || this.uploading()) return;

    this.uploading.set(true);
    this.uploadProgress.set(0);
    this.uploadSuccess.set('');
    this.deleteSuccess.set('');
    this.error.set('');

    const trackTitle = this.title.value.trim() || this.file.name;
    const customCover = this.coverPreview() || undefined;

    this.service.uploadWithProgress(this.file, trackTitle, customCover).subscribe({
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
          this.coverPreview.set('');
          fileInput.value = '';
          if (coverInput) {
            coverInput.value = '';
          }
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

  openDeleteModal(track: Track): void {
    this.trackToDelete.set(track);
  }

  cancelDeleteModal(): void {
    this.trackToDelete.set(null);
  }

  executeDelete(): void {
    const track = this.trackToDelete();
    if (!track || this.deletingId()) return;

    this.deletingId.set(track.id);
    this.error.set('');
    this.deleteSuccess.set('');

    this.service.delete(track.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.trackToDelete.set(null);
        const msg = `Piste « ${track.title} » supprimée avec succès.`;
        this.deleteSuccess.set(msg);
        this.snackBar.open(msg, 'Fermer', {
          duration: 4000,
          horizontalPosition: 'end',
          panelClass: ['success-snackbar'],
        });

        if (this.currentTrack()?.id === track.id) {
          this.audioPlayer.stop();
        }
        // Si on était sur la dernière page et qu'elle devient vide, reculer d'une page
        if (this.tracks().length === 1 && this.page() > 1) {
          this.page.set(this.page() - 1);
        }
        this.load();
      },
      error: (err: { status?: number; error?: { message?: string } }) => {
        this.deletingId.set(null);
        this.trackToDelete.set(null);
        let errorMsg = err.error?.message ?? 'Échec de la suppression de la piste.';

        // Gestion du cas où la piste n'existe plus ou n'appartient pas à l'utilisateur (404/403)
        if (err.status === 404) {
          errorMsg = `La piste « ${track.title} » n'existe plus ou a déjà été supprimée.`;
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

  togglePlay(track: Track): void {
    this.audioPlayer.togglePlay(track);
  }
}
