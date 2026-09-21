import { Component, inject, signal, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  imports: [ReactiveFormsModule],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePageComponent implements OnInit {
  readonly auth = inject(AuthService);

  readonly saved = signal(false);
  readonly error = signal('');
  readonly loading = signal(false);

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
  });

  ngOnInit(): void {
    this.auth.profile().subscribe({
      next: (user) => this.form.setValue({ name: user.name }),
      error: () => this.error.set('Impossible de charger le profil.'),
    });
  }

  save(): void {
    if (this.form.invalid) return;
    this.saved.set(false);
    this.error.set('');
    this.loading.set(true);
    this.auth.update(this.form.getRawValue().name).subscribe({
      next: () => {
        this.loading.set(false);
        this.saved.set(true);
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? "Erreur lors de l'enregistrement.");
      },
    });
  }
}
