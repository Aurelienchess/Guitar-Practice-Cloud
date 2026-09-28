import { Component, inject, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

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
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
