import { AfterViewInit, Component, ElementRef, inject, OnInit, ViewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { AudioPlayerService } from '../../shared/services/audio-player.service';
import { VisualizerService } from '../../shared/services/visualizer.service';
import { ThemeService } from '../../shared/services/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent implements OnInit, AfterViewInit {
  readonly auth = inject(AuthService);
  readonly audio = inject(AudioPlayerService);
  readonly visualizer = inject(VisualizerService);
  readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  @ViewChild('butterchurnCanvas') butterchurnCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('outputCanvas') outputCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('webcamVideo') webcamVideoRef?: ElementRef<HTMLVideoElement>;

  ngAfterViewInit(): void {
    if (this.butterchurnCanvasRef && this.outputCanvasRef && this.webcamVideoRef) {
      this.visualizer.init(
        this.butterchurnCanvasRef.nativeElement,
        this.outputCanvasRef.nativeElement,
        this.webcamVideoRef.nativeElement,
      );
    }
  }


  ngOnInit(): void {
    // Si le token n'est pas en mémoire (ex: après un F5 ou réouverture de page),
    // tente de restaurer la session de manière sécurisée via le cookie HTTP-Only
    if (!this.auth.token()) {
      this.auth.refresh().subscribe({
        error: () => {
          // Aucune session active, l'utilisateur reste visiteur
        },
      });
    } else if (!this.auth.currentUser()) {
      this.auth.profile().subscribe({
        error: () => this.auth.logout(),
      });
    }
  }

  logout(): void {
    this.audio.stop();
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }

  formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  onSeek(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.audio.seek(Number(input.value));
  }
}

