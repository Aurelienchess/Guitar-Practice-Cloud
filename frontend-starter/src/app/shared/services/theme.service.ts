import { effect, Injectable, signal, computed } from '@angular/core';

export type AppTheme = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'gpc_theme';

  readonly theme = signal<AppTheme>(this.getInitialTheme());
  readonly isLight = computed(() => this.theme() === 'light');

  constructor() {
    // Synchronise la classe CSS sur le document à chaque changement de thème
    effect(() => {
      const current = this.theme();
      if (typeof document !== 'undefined') {
        if (current === 'light') {
          document.documentElement.classList.add('light-theme');
          document.body.classList.add('light-theme');
        } else {
          document.documentElement.classList.remove('light-theme');
          document.body.classList.remove('light-theme');
        }
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKey, current);
      }
    });
  }

  toggleTheme(): void {
    this.theme.update((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }

  setTheme(theme: AppTheme): void {
    this.theme.set(theme);
  }

  private getInitialTheme(): AppTheme {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(this.storageKey);
      if (saved === 'light' || saved === 'dark') {
        return saved;
      }
    }
    return 'dark'; // Dark mode par défaut
  }
}

