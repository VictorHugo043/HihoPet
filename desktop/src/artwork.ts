import type { MotionPose } from './shared/motion.js';

const vertexShader = `#version 300 es
in vec2 position;
out vec2 uv;
uniform float headAngle;
uniform float yaw;
uniform vec2 arms;
uniform vec2 legs;
uniform vec2 lifts;
uniform mat3 world;
uniform vec2 viewport;
vec2 turn(vec2 p, vec2 pivot, float angle) {
  vec2 q = p - pivot;
  return pivot + mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * q;
}
void main() {
  uv = position / vec2(384.0, 416.0);
  vec2 p = position;
  float neck = 1.0 - smoothstep(250.0, 318.0, position.y);
  p = mix(p, turn(p, vec2(192.0, 286.0), headAngle), neck);
  float armY = smoothstep(282.0, 312.0, position.y) * (1.0 - smoothstep(337.0, 360.0, position.y));
  float leftArm = armY * (1.0 - smoothstep(132.0, 153.0, position.x));
  float rightArm = armY * smoothstep(218.0, 240.0, position.x);
  p = mix(p, turn(p, vec2(142.0, 298.0), arms.x), leftArm);
  p = mix(p, turn(p, vec2(224.0, 300.0), arms.y), rightArm);
  float legY = smoothstep(337.0, 370.0, position.y);
  float leftLeg = legY * (1.0 - smoothstep(178.0, 190.0, position.x));
  float rightLeg = legY * smoothstep(188.0, 200.0, position.x);
  p = mix(p, turn(p, vec2(155.0, 340.0), legs.x) + vec2(0.0, lifts.x * 2.0), leftLeg);
  p = mix(p, turn(p, vec2(204.0, 340.0), legs.y) + vec2(0.0, lifts.y * 2.0), rightLeg);
  float seatedBase = 1.0 - smoothstep(330.0, 395.0, position.y);
  float turnAngle = yaw * seatedBase;
  vec2 q = p - vec2(192.0, 404.0);
  float depth = 30.0 * sqrt(max(0.0, 1.0 - pow(q.x / 192.0, 2.0))) * abs(sin(turnAngle));
  float z = -sin(turnAngle) * q.x + cos(turnAngle) * depth;
  float perspective = 650.0 / (650.0 - z);
  p = vec2((cos(turnAngle) * q.x + sin(turnAngle) * depth) * perspective, q.y * perspective) + vec2(192.0, 404.0);
  vec2 pixel = (world * vec3(p / 2.0 - vec2(96.0, 208.0), 1.0)).xy;
  gl_Position = vec4(pixel.x / viewport.x * 2.0 - 1.0, 1.0 - pixel.y / viewport.y * 2.0, 0.0, 1.0);
}`;
const fragmentShader = `#version 300 es
precision mediump float;
in vec2 uv;
out vec4 color;
uniform sampler2D atlas;
uniform sampler2D seated;
uniform vec2 currentCell;
uniform vec2 previousCell;
uniform float blend;
vec4 samplePose(vec2 cell) {
  if (cell.y >= 6.0) return texture(seated, uv);
  return texture(atlas, (cell + uv) / vec2(4.0, 6.0));
}
void main() {
  vec4 current = samplePose(currentCell);
  vec4 previous = samplePose(previousCell);
  color = mix(previous, current, blend);
}`;

/** One connected mesh keeps the original neck pixels intact through every deformation. */
export class Artwork {
  private canvas = document.querySelector<HTMLCanvasElement>('#character')!;
  private gl!: WebGL2RenderingContext;
  private program!: WebGLProgram;
  private indexCount = 0;
  private frame = 0;
  private previousFrame = 0;
  private changedAt = -Infinity;
  private inverse = new DOMMatrix();
  private pixel = new Uint8Array(4);
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private world = new Float32Array(9);

  async load(): Promise<void> {
    this.canvas.width = 384; this.canvas.height = 416;
    const gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    const compile = (type: number, text: string): WebGLShader => {
      const shader = gl.createShader(type)!; gl.shaderSource(shader, text); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Invalid character shader');
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexShader));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentShader)); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Character shader unavailable');
    this.program = program; gl.useProgram(program);
    for (const name of ['headAngle', 'yaw', 'arms', 'legs', 'lifts', 'currentCell', 'previousCell', 'blend', 'world', 'viewport']) this.uniforms.set(name, gl.getUniformLocation(program, name));
    const vertices: number[] = [], indices: number[] = [];
    for (let y = 0; y <= 26; y++) for (let x = 0; x <= 24; x++) vertices.push(x * 16, y * 16);
    for (let y = 0; y < 26; y++) for (let x = 0; x < 24; x++) {
      const a = y * 25 + x; indices.push(a, a + 1, a + 25, a + 1, a + 26, a + 25);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW); this.indexCount = indices.length;
    for (const [unit, name, width, height] of [[0, 'character', 1536, 2496], [1, 'seated', 384, 416]] as const) {
      const image = new Image(); image.src = new URL(`assets/${name}.png`, import.meta.url).href; await image.decode();
      if (image.width !== width || image.height !== height) throw new Error('Invalid character artwork');
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture()); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(program, unit ? 'seated' : 'atlas'), unit);
    }
    gl.clearColor(0, 0, 0, 0);
  }

  draw(context: CanvasRenderingContext2D, pose: MotionPose, time: number): void {
    if (pose.frame !== this.frame) {
      // Putting down a listening pet restores its seat without a standing afterimage.
      this.previousFrame = this.frame === 5 && pose.frame === 24 ? pose.frame : this.frame;
      this.frame = pose.frame; this.changedAt = time;
    }
    const gl = this.gl;
    if (this.canvas.width !== context.canvas.width || this.canvas.height !== context.canvas.height) {
      this.canvas.width = context.canvas.width; this.canvas.height = context.canvas.height;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
    const location = (name: string): WebGLUniformLocation | null => this.uniforms.get(name)!;
    const transform = context.getTransform();
    this.world.set([transform.a, transform.b, 0, transform.c, transform.d, 0, transform.e, transform.f, 1]);
    gl.uniformMatrix3fv(location('world'), false, this.world);
    gl.uniform2f(location('viewport'), this.canvas.width, this.canvas.height);
    gl.uniform1f(location('headAngle'), pose.headAngle);
    gl.uniform1f(location('yaw'), pose.yaw);
    gl.uniform2f(location('arms'), pose.armLeft, pose.armRight);
    gl.uniform2f(location('legs'), pose.legLeft, pose.legRight);
    gl.uniform2f(location('lifts'), pose.liftLeft, pose.liftRight);
    gl.uniform2f(location('currentCell'), this.frame % 4, Math.floor(this.frame / 4));
    gl.uniform2f(location('previousCell'), this.previousFrame % 4, Math.floor(this.previousFrame / 4));
    gl.uniform1f(location('blend'), Math.min(1, (time - this.changedAt) / (this.frame === 6 ? 0.65 : 0.16)));
    gl.clear(gl.COLOR_BUFFER_BIT); gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
    this.inverse = transform.inverse();
  }

  hit(x: number, y: number): { opaque: boolean; head: boolean } {
    if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return { opaque: false, head: false };
    const point = this.inverse.transformPoint(new DOMPoint(x, y));
    const px = Math.floor((point.x + 96) * 2), py = Math.floor((point.y + 208) * 2);
    if (px < 0 || px >= 384 || py < 0 || py >= 416) return { opaque: false, head: false };
    this.gl.readPixels(Math.floor(x), this.canvas.height - 1 - Math.floor(y), 1, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.pixel);
    return { opaque: this.pixel[3] > 28, head: this.pixel[3] > 28 && py < 290 };
  }
}
