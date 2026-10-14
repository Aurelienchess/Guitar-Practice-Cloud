import { inject, Injectable, signal } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';

export interface ISFShaderInput {
  NAME: string;
  TYPE: 'float' | 'image' | string;
  MIN?: number;
  MAX?: number;
  DEFAULT?: number;
}

export interface ISFShaderMeta {
  DESCRIPTION?: string;
  CREDIT?: string;
  ISFVSN?: string;
  TYPE?: string;
  INPUTS?: ISFShaderInput[];
}

export interface ISFCompiledShader {
  id: string;
  name: string;
  code: string;
  meta: ISFShaderMeta;
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
  values: Record<string, number>;
  enabled: boolean;
}

export const DEFAULT_ISF_SHADERS = [
  {
    id: 'chroma',
    name: '1. Aberration Chromatique (RGB Shift)',
    enabled: true,
    code: `/*{
  "DESCRIPTION": "Décalage spectral RGB audio-réactif",
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "amount", "TYPE": "float", "MIN": 0.0, "MAX": 0.05, "DEFAULT": 0.012 },
    { "NAME": "angle", "TYPE": "float", "MIN": 0.0, "MAX": 6.28, "DEFAULT": 0.78 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  vec2 dir = vec2(cos(angle), sin(angle)) * amount;
  float r = IMG_NORM_PIXEL(inputImage, uv + dir).r;
  float g = IMG_NORM_PIXEL(inputImage, uv).g;
  float b = IMG_NORM_PIXEL(inputImage, uv - dir).b;
  gl_FragColor = vec4(r, g, b, 1.0);
}`,
  },
  {
    id: 'glitch',
    name: '2. Glitch & Scanline Wave',
    enabled: true,
    code: `/*{
  "DESCRIPTION": "Distorsion ondulatoire et découpage dynamique",
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "waveSpeed", "TYPE": "float", "MIN": 0.0, "MAX": 5.0, "DEFAULT": 2.2 },
    { "NAME": "waveFreq", "TYPE": "float", "MIN": 1.0, "MAX": 40.0, "DEFAULT": 15.0 },
    { "NAME": "waveAmp", "TYPE": "float", "MIN": 0.0, "MAX": 0.06, "DEFAULT": 0.018 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  float wave = sin(uv.y * waveFreq + TIME * waveSpeed) * waveAmp;
  uv.x += wave;
  gl_FragColor = IMG_NORM_PIXEL(inputImage, uv);
}`,
  },
  {
    id: 'colorGrading',
    name: '3. Étalonnage Couleur & Teinte',
    enabled: true,
    code: `/*{
  "DESCRIPTION": "Contraste et saturation cinématique",
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "saturation", "TYPE": "float", "MIN": 0.0, "MAX": 2.5, "DEFAULT": 1.4 },
    { "NAME": "contrast", "TYPE": "float", "MIN": 0.5, "MAX": 2.0, "DEFAULT": 1.2 },
    { "NAME": "brightness", "TYPE": "float", "MIN": 0.5, "MAX": 1.8, "DEFAULT": 1.05 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  vec4 color = IMG_NORM_PIXEL(inputImage, uv);
  vec3 rgb = color.rgb;
  float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
  rgb = mix(vec3(luma), rgb, saturation);
  rgb = (rgb - 0.5) * contrast + 0.5;
  rgb *= brightness;
  gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), 1.0);
}`,
  },
  {
    id: 'bloom',
    name: '4. Lueur Rayonnante (Bloom / Glow)',
    enabled: true,
    code: `/*{
  "DESCRIPTION": "Diffusion lumineuse sur les hautes lumières",
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "glowStrength", "TYPE": "float", "MIN": 0.0, "MAX": 1.5, "DEFAULT": 0.65 },
    { "NAME": "spread", "TYPE": "float", "MIN": 0.001, "MAX": 0.015, "DEFAULT": 0.005 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  vec4 baseColor = IMG_NORM_PIXEL(inputImage, uv);
  vec4 glow = vec4(0.0);
  glow += IMG_NORM_PIXEL(inputImage, uv + vec2( spread,  spread));
  glow += IMG_NORM_PIXEL(inputImage, uv + vec2(-spread,  spread));
  glow += IMG_NORM_PIXEL(inputImage, uv + vec2( spread, -spread));
  glow += IMG_NORM_PIXEL(inputImage, uv + vec2(-spread, -spread));
  glow *= 0.25;
  gl_FragColor = baseColor + glow * glowStrength;
}`,
  },
  {
    id: 'crt',
    name: '5. Écran Rétro CRT & Vignette',
    enabled: true,
    code: `/*{
  "DESCRIPTION": "Lignes de balayage cathodique et vignettage arcade",
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "scanlines", "TYPE": "float", "MIN": 0.0, "MAX": 0.6, "DEFAULT": 0.25 },
    { "NAME": "vignette", "TYPE": "float", "MIN": 0.0, "MAX": 1.2, "DEFAULT": 0.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  vec4 color = IMG_NORM_PIXEL(inputImage, uv);
  float sl = sin(uv.y * RENDERSIZE.y * 1.5) * 0.5 + 0.5;
  color.rgb -= sl * scanlines;
  float dist = distance(uv, vec2(0.5));
  color.rgb *= smoothstep(0.8, 0.2, dist * vignette);
  gl_FragColor = color;
}`,
  },
];

/**
 * Moteur WebGL Ping-Pong FBO pour le chaînage fluide de shaders ISF
 */
class ISFPipelineEngine {
  gl: WebGLRenderingContext;
  width: number;
  height: number;
  startTime: number;
  shaders: ISFCompiledShader[] = [];

  private quadBuffer: WebGLBuffer | null;
  private fboA: { fbo: WebGLFramebuffer; texture: WebGLTexture };
  private fboB: { fbo: WebGLFramebuffer; texture: WebGLTexture };
  private sourceTexture: WebGLTexture;

  constructor(public canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, alpha: false });
    if (!gl) {
      throw new Error('WebGL non supporté');
    }
    this.gl = gl;
    this.width = canvas.width;
    this.height = canvas.height;
    this.startTime = performance.now();

    // Quad plein écran
    this.quadBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      this.gl.STATIC_DRAW,
    );

    this.fboA = this.createFBO();
    this.fboB = this.createFBO();
    this.sourceTexture = this.createTexture();
  }

  createTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  createFBO(): { fbo: WebGLFramebuffer; texture: WebGLTexture } {
    const gl = this.gl;
    const texture = this.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.width,
      this.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );

    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { fbo, texture };
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);

    this.fboA = this.createFBO();
    this.fboB = this.createFBO();
  }

  parseISF(rawCode: string): { meta: ISFShaderMeta; glsl: string } {
    const match = rawCode.match(/\/\*\{([\s\S]*?)\}\*\//);
    if (!match) throw new Error('En-tête JSON ISF /*{ ... }*/ manquant');
    const jsonHeader = JSON.parse('{' + match[1] + '}');
    const glslBody = rawCode.replace(/\/\*\{[\s\S]*?\}\*\//, '');
    return { meta: jsonHeader, glsl: glslBody };
  }

  compileShader(rawCode: string, name: string, id: string): ISFCompiledShader {
    const gl = this.gl;
    const parsed = this.parseISF(rawCode);

    const vsSource = `
      attribute vec2 a_pos;
      varying vec2 isf_FragNormCoord;
      void main() {
        isf_FragNormCoord = (a_pos + 1.0) * 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    const inputs = parsed.meta.INPUTS || [];
    const floatInputs = inputs.filter((inp) => inp.TYPE === 'float');
    const fsSource = `
      precision mediump float;
      uniform sampler2D inputImage;
      uniform vec2 RENDERSIZE;
      uniform float TIME;
      varying vec2 isf_FragNormCoord;

      ${floatInputs.map((inp) => `uniform float ${inp.NAME};`).join('\n')}

      #define IMG_NORM_PIXEL(sampler, coord) texture2D(sampler, coord)
      #define IMG_PIXEL(sampler, coord) texture2D(sampler, coord / RENDERSIZE)

      ${parsed.glsl}
    `;

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      throw new Error('Erreur Vertex Shader: ' + gl.getShaderInfoLog(vs));
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      throw new Error(`Erreur Fragment Shader [${name}]: ` + gl.getShaderInfoLog(fs));
    }

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('Erreur Link Shader: ' + gl.getProgramInfoLog(program));
    }

    const uniforms: Record<string, WebGLUniformLocation | null> = {
      inputImage: gl.getUniformLocation(program, 'inputImage'),
      RENDERSIZE: gl.getUniformLocation(program, 'RENDERSIZE'),
      TIME: gl.getUniformLocation(program, 'TIME'),
    };

    const values: Record<string, number> = {};
    floatInputs.forEach((inp) => {
      uniforms[inp.NAME] = gl.getUniformLocation(program, inp.NAME);
      values[inp.NAME] = inp.DEFAULT !== undefined ? inp.DEFAULT : 0.0;
    });

    return {
      id,
      name,
      code: rawCode,
      meta: parsed.meta,
      program,
      uniforms,
      values,
      enabled: true,
    };
  }

  renderPipeline(sourceElement: TexImageSource): void {
    const gl = this.gl;
    const time = (performance.now() - this.startTime) / 1000.0;

    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceElement);

    let currentInputTex = this.sourceTexture;
    let currentFBO = this.fboA;
    let nextFBO = this.fboB;

    const activeShaders = this.shaders.filter((s) => s.enabled);

    if (activeShaders.length === 0 && this.shaders.length > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.width, this.height);
      this.drawPass(this.shaders[0], currentInputTex, time, true);
      return;
    }

    for (let i = 0; i < activeShaders.length; i++) {
      const shader = activeShaders[i];
      const isLastPass = i === activeShaders.length - 1;

      gl.bindFramebuffer(gl.FRAMEBUFFER, isLastPass ? null : currentFBO.fbo);
      gl.viewport(0, 0, this.width, this.height);

      this.drawPass(shader, currentInputTex, time, false);

      if (!isLastPass) {
        currentInputTex = currentFBO.texture;
        const temp = currentFBO;
        currentFBO = nextFBO;
        nextFBO = temp;
      }
    }
  }

  drawPass(
    shader: ISFCompiledShader,
    inputTexture: WebGLTexture,
    time: number,
    passThrough = false,
  ): void {
    const gl = this.gl;
    gl.useProgram(shader.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTexture);
    gl.uniform1i(shader.uniforms['inputImage'], 0);

    gl.uniform2f(shader.uniforms['RENDERSIZE'], this.width, this.height);
    gl.uniform1f(shader.uniforms['TIME'], time);

    for (const key in shader.values) {
      if (shader.uniforms[key]) {
        gl.uniform1f(shader.uniforms[key], shader.values[key]);
      }
    }

    const posAttr = gl.getAttribLocation(shader.program, 'a_pos');
    gl.enableVertexAttribArray(posAttr);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}

/**
 * Service singleton gérant le visualiseur Butterchurn en arrière-plan
 * et la cascade des shaders ISF pour toute l'application.
 */
@Injectable({
  providedIn: 'root',
})
export class VisualizerService {
  private readonly audioEngine = inject(AudioEngineService);

  private engine: ISFPipelineEngine | null = null;
  private butterchurnInstance: any = null;
  private audioConnected = false;
  private animFrameId: number | null = null;
  private webcamStream: MediaStream | null = null;

  private butterchurnCanvas: HTMLCanvasElement | null = null;
  private outputCanvas: HTMLCanvasElement | null = null;
  private webcamVideo: HTMLVideoElement | null = null;

  // Signaux réactifs pour l'UI
  readonly isInitialized = signal<boolean>(false);
  readonly isButterchurnLoaded = signal<boolean>(false);
  readonly isWebcamActive = signal<boolean>(false);
  readonly presetNames = signal<string[]>([]);
  readonly currentPreset = signal<string>('');
  readonly fps = signal<number>(60);
  readonly shaders = signal<ISFCompiledShader[]>([]);
  readonly backgroundEnabled = signal<boolean>(true);
  readonly backgroundOpacity = signal<number>(0.85);

  private presetsMap: Record<string, any> = {};

  init(
    butterchurnCanvas: HTMLCanvasElement,
    outputCanvas: HTMLCanvasElement,
    webcamVideo: HTMLVideoElement,
  ): void {
    if (this.isInitialized()) return;
    if (typeof window === 'undefined') return;

    this.butterchurnCanvas = butterchurnCanvas;
    this.outputCanvas = outputCanvas;
    this.webcamVideo = webcamVideo;

    // Dimensions adaptées à l'écran
    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 720;
    butterchurnCanvas.width = Math.min(1920, Math.max(960, w));
    butterchurnCanvas.height = Math.min(1080, Math.max(540, h));
    outputCanvas.width = butterchurnCanvas.width;
    outputCanvas.height = butterchurnCanvas.height;

    try {
      this.engine = new ISFPipelineEngine(outputCanvas);

      // Compiler les 5 shaders par défaut
      DEFAULT_ISF_SHADERS.forEach((s) => {
        try {
          const compiled = this.engine!.compileShader(s.code, s.name, s.id);
          this.engine!.shaders.push(compiled);
        } catch (err) {
          console.error('Erreur compilation shader ISF :', s.name, err);
        }
      });
      this.shaders.set([...this.engine.shaders]);

      // Initialiser Butterchurn
      this.initButterchurn(butterchurnCanvas);

      this.isInitialized.set(true);
      this.startRenderLoop();
    } catch (err) {
      console.warn('Initialisation du visualiseur en arrière-plan limitée :', err);
    }
  }

  private initButterchurn(canvas: HTMLCanvasElement): void {
    const w = window as any;
    const lib = w.butterchurn?.default || w.butterchurn;
    const presetsLib = w.butterchurnPresets?.default || w.butterchurnPresets;

    if (!lib || !presetsLib) {
      console.warn('Bibliothèques Butterchurn non trouvées sur window.');
      this.isButterchurnLoaded.set(false);
      return;
    }

    try {
      const audioCtx =
        this.audioEngine.getAudioContext() ||
        new (window.AudioContext || (window as any).webkitAudioContext)();

      this.butterchurnInstance = lib.createVisualizer(audioCtx, canvas, {
        width: canvas.width,
        height: canvas.height,
        pixelRatio: 1,
      });

      this.presetsMap = presetsLib.getPresets();
      const names = Object.keys(this.presetsMap);
      this.presetNames.set(names);

      if (names.length > 0) {
        const initial = names[Math.floor(Math.random() * names.length)];
        this.currentPreset.set(initial);
        this.butterchurnInstance.loadPreset(this.presetsMap[initial], 0.0);
      }

      this.isButterchurnLoaded.set(true);
      this.tryConnectAudio();
    } catch (err) {
      console.warn('Impossible de charger Butterchurn :', err);
    }
  }

  /**
   * Raccorde le flux audio du moteur à Butterchurn dès qu'il est disponible
   */
  tryConnectAudio(): void {
    if (this.audioConnected || !this.butterchurnInstance) return;
    const node = this.audioEngine.getMasterNode();
    if (node) {
      try {
        this.butterchurnInstance.connectAudio(node);
        this.audioConnected = true;
      } catch (err) {
        console.warn('Erreur connexion audio Butterchurn :', err);
      }
    }
  }

  loadPreset(name: string, blendTime = 1.5): void {
    if (!this.butterchurnInstance || !this.presetsMap[name]) return;
    this.currentPreset.set(name);
    this.butterchurnInstance.loadPreset(this.presetsMap[name], blendTime);
  }

  nextPreset(): void {
    const names = this.presetNames();
    if (names.length === 0) return;
    const currentIndex = names.indexOf(this.currentPreset());
    const nextIndex = (currentIndex + 1) % names.length;
    this.loadPreset(names[nextIndex], 1.5);
  }

  prevPreset(): void {
    const names = this.presetNames();
    if (names.length === 0) return;
    const currentIndex = names.indexOf(this.currentPreset());
    const prevIndex = (currentIndex - 1 + names.length) % names.length;
    this.loadPreset(names[prevIndex], 1.5);
  }

  randomPreset(): void {
    const names = this.presetNames();
    if (names.length === 0) return;
    const randIndex = Math.floor(Math.random() * names.length);
    this.loadPreset(names[randIndex], 2.0);
  }

  async toggleWebcam(): Promise<void> {
    if (this.isWebcamActive()) {
      if (this.webcamStream) {
        this.webcamStream.getTracks().forEach((track) => track.stop());
        this.webcamStream = null;
      }
      if (this.webcamVideo) {
        this.webcamVideo.srcObject = null;
      }
      this.isWebcamActive.set(false);
    } else {
      if (!navigator.mediaDevices?.getUserMedia) {
        alert('Webcam non supportée sur ce navigateur.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
        });
        this.webcamStream = stream;
        if (this.webcamVideo) {
          this.webcamVideo.srcObject = stream;
          await this.webcamVideo.play();
        }
        this.isWebcamActive.set(true);
      } catch (err) {
        console.error('Erreur accès webcam :', err);
        alert('Impossible d’accéder à la webcam.');
      }
    }
  }

  toggleShader(id: string): void {
    if (!this.engine) return;
    const target = this.engine.shaders.find((s) => s.id === id);
    if (target) {
      target.enabled = !target.enabled;
      this.shaders.set([...this.engine.shaders]);
    }
  }

  setShaderParam(shaderId: string, paramName: string, val: number): void {
    if (!this.engine) return;
    const target = this.engine.shaders.find((s) => s.id === shaderId);
    if (target && target.values[paramName] !== undefined) {
      target.values[paramName] = val;
      this.shaders.set([...this.engine.shaders]);
    }
  }

  addCustomShader(code: string): { success: boolean; error?: string } {
    if (!this.engine) return { success: false, error: 'Moteur non prêt' };
    try {
      const id = 'custom_' + Date.now();
      const name = `Shader #${this.engine.shaders.length + 1} (Custom)`;
      const compiled = this.engine.compileShader(code, name, id);
      this.engine.shaders.push(compiled);
      this.shaders.set([...this.engine.shaders]);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erreur de compilation' };
    }
  }

  setBackgroundEnabled(enabled: boolean): void {
    this.backgroundEnabled.set(enabled);
  }

  setBackgroundOpacity(opacity: number): void {
    this.backgroundOpacity.set(Math.max(0, Math.min(1, opacity)));
  }

  private startRenderLoop(): void {
    let lastTime = performance.now();
    let frameCount = 0;

    const tick = () => {
      this.animFrameId = requestAnimationFrame(tick);

      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        this.fps.set(frameCount);
        frameCount = 0;
        lastTime = now;
      }

      if (!this.backgroundEnabled() || !this.engine) return;

      this.tryConnectAudio();

      const isWebcam = this.isWebcamActive();
      const video = this.webcamVideo;

      if (!isWebcam && this.butterchurnInstance && this.butterchurnCanvas) {
        try {
          this.butterchurnInstance.render();
          this.engine.renderPipeline(this.butterchurnCanvas);
        } catch {
          // Gestion des cas de perte de contexte WebGL
        }
      } else if (isWebcam && video && video.readyState >= 2) {
        this.engine.renderPipeline(video);
      }
    };

    this.animFrameId = requestAnimationFrame(tick);
  }

  destroy(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach((track) => track.stop());
    }
  }
}

