import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VisualizerService } from '../../shared/services/visualizer.service';
import { AudioPlayerService } from '../../shared/services/audio-player.service';

const INITIAL_CUSTOM_SHADER = `/*{
  "DESCRIPTION": "Inversion de couleurs et Stroboscope",
  "CREDIT": "GPC",
  "ISFVSN": "2",
  "TYPE": "IMAGE",
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "invert", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 1.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  vec4 color = IMG_NORM_PIXEL(inputImage, uv);
  vec3 inverted = vec3(1.0) - color.rgb;
  gl_FragColor = vec4(mix(color.rgb, inverted, invert), color.a);
}`;

@Component({
  selector: 'app-shaders-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './shaders-page.html',
  styleUrl: './shaders-page.css',
})
export class ShadersPageComponent {
  readonly visualizer = inject(VisualizerService);
  readonly audioPlayer = inject(AudioPlayerService);

  customShaderCode = signal<string>(INITIAL_CUSTOM_SHADER);
  compileError = signal<string>('');
  compileSuccess = signal<string>('');

  onPresetChange(event: Event): void {
    const sel = event.target as HTMLSelectElement;
    if (sel.value) {
      this.visualizer.loadPreset(sel.value, 2.0);
    }
  }

  onOpacityChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.visualizer.setBackgroundOpacity(parseFloat(input.value));
  }

  toggleBackground(): void {
    this.visualizer.setBackgroundEnabled(!this.visualizer.backgroundEnabled());
  }

  toggleShader(id: string): void {
    this.visualizer.toggleShader(id);
  }

  onParamChange(shaderId: string, paramName: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    this.visualizer.setShaderParam(shaderId, paramName, parseFloat(input.value));
  }

  toggleWebcam(): void {
    void this.visualizer.toggleWebcam();
  }

  addCustomShader(): void {
    this.compileError.set('');
    this.compileSuccess.set('');
    const code = this.customShaderCode().trim();
    if (!code) {
      this.compileError.set('Veuillez renseigner un code de shader ISF.');
      return;
    }

    const res = this.visualizer.addCustomShader(code);
    if (res.success) {
      this.compileSuccess.set('Shader ISF compilé et ajouté avec succès à la chaîne !');
    } else {
      this.compileError.set(res.error || 'Erreur lors de la compilation du shader.');
    }
  }
}

