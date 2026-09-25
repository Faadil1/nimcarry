// Liquid-gold wax seal, rendered live with WebGL (no library, no network).
// One shared GL context draws every seal on the page; each seal gets its own 2D canvas.
// The light follows the pointer or the phone's tilt. The letter tilts in 3D with it.
// Falls back to the SVG seal when WebGL is unavailable; with reduced motion it draws
// one still frame and never animates. Presentation only: no network, no storage.

const VERT = `attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}`;

const FRAG = `precision highp float;
varying vec2 v;
uniform float t;
uniform vec2 tilt;
uniform float seed;

float h21(vec2 p){p=fract(p*vec2(123.34,456.21)+seed);p+=dot(p,p+45.32);return fract(p.x*p.y);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*n2(p);p*=2.03;a*=.5;}return s;}

float hexSdf(vec2 p,float r){p=abs(p);return max(dot(p,vec2(.8660254,.5)),p.y)-r;}

float radiusAt(vec2 p){float a=atan(p.y,p.x);
  return .80+.045*sin(a*5.+seed*6.)+.03*sin(a*9.+seed*3.)+.03*(fbm(vec2(a*1.6,seed*9.))-.5);}

float height(vec2 p){
  float r=radiusAt(p),l=length(p);
  float dome=sqrt(max(0.,1.-pow(l/r,2.)))*.30;
  float ring=.05*exp(-pow((l-.60*r)/.035,2.));
  float hx=hexSdf(p,.30);
  float emboss=.075*smoothstep(.025,-.02,hx)-.02*smoothstep(.0,-.06,hx)*smoothstep(-.14,-.06,hx);
  float flow=.018*fbm(p*3.2+vec2(t*.07,-t*.05));
  return dome+ring+emboss+flow;
}

void main(){
  vec2 p=v*1.02;
  float r=radiusAt(p);
  float edge=length(p)-r;
  float alpha=smoothstep(.012,-.012,edge);
  if(alpha<=0.){gl_FragColor=vec4(0.);return;}
  float e=.004;
  float hx=height(p+vec2(e,0))-height(p-vec2(e,0));
  float hy=height(p+vec2(0,e))-height(p-vec2(0,e));
  vec3 n=normalize(vec3(-hx/(2.*e),-hy/(2.*e),1.6));
  vec3 V=vec3(0,0,1);
  vec3 L=normalize(vec3(tilt*1.1+vec2(-.45,.55),.85));
  vec3 R=reflect(-V,n);
  vec3 dark=vec3(.36,.23,.04),gold=vec3(.84,.64,.22),bright=vec3(1.,.95,.76);
  // Liquid studio environment: soft bands warped by slow noise.
  float warp=fbm(R.xy*2.+vec2(t*.05,t*.03)+tilt);
  float band=smoothstep(.34,.0,abs(fract(R.x*1.1+R.y*.8+warp*.9+t*.02)-.5));
  vec3 env=mix(dark,gold,smoothstep(-.6,.9,R.y+.35*R.x))+bright*band*.55;
  float diff=max(dot(n,L),0.);
  float spec=pow(max(dot(reflect(-L,n),V),0.),60.);
  float cavity=smoothstep(.0,.5,length(vec2(hx,hy))/(2.*e));
  vec3 col=gold*(.25+.55*diff)+env*.62+bright*spec*1.1;
  col*=1.-.28*cavity;
  col*=mix(.72,1.,smoothstep(-.02,-.14,edge));
  gl_FragColor=vec4(col*alpha,alpha);
}`;

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function createRenderer() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
    return s;
  };
  try {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = { t: gl.getUniformLocation(prog, "t"), tilt: gl.getUniformLocation(prog, "tilt"), seed: gl.getUniformLocation(prog, "seed") };
    return {
      draw(size, time, tilt, seed) {
        if (canvas.width !== size || canvas.height !== size) { canvas.width = size; canvas.height = size; }
        gl.viewport(0, 0, size, size);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(u.t, time);
        gl.uniform2f(u.tilt, tilt.x, tilt.y);
        gl.uniform1f(u.seed, seed);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return canvas;
      },
    };
  } catch {
    return null;
  }
}

const SEAL_SELECTOR = ".nc-seal, .nc-drop__knob, .nc-phase__icon";
const seals = new Set();
const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
let renderer;
let frame = 0;
let start = performance.now();

function attach(host) {
  if (host.dataset.wax === "1") return;
  host.dataset.wax = "1";
  const out = document.createElement("canvas");
  out.className = "nc-wax";
  out.setAttribute("aria-hidden", "true");
  host.appendChild(out);
  host.classList.add("is-wax");
  seals.add({ host, out, seed: Math.random() * 10, ctx: out.getContext("2d") });
}

function paint(time) {
  for (const seal of [...seals]) {
    if (!document.contains(seal.host)) { seals.delete(seal); continue; }
    const rect = seal.host.getBoundingClientRect();
    if (!rect.width || rect.bottom < 0 || rect.top > innerHeight) continue;
    const size = Math.min(512, Math.round(rect.width * Math.min(devicePixelRatio || 1, 2)));
    if (seal.out.width !== size) { seal.out.width = size; seal.out.height = size; }
    const source = renderer.draw(size, time, tilt, seal.seed);
    seal.ctx.clearRect(0, 0, size, size);
    seal.ctx.drawImage(source, 0, 0);
  }
}

function tick(now) {
  frame = 0;
  tilt.x += (tilt.tx - tilt.x) * 0.08;
  tilt.y += (tilt.ty - tilt.y) * 0.08;
  // The letter leans with the same light.
  document.documentElement.style.setProperty("--rx", `${(-tilt.y * 6).toFixed(2)}deg`);
  document.documentElement.style.setProperty("--ry", `${(tilt.x * 8).toFixed(2)}deg`);
  paint((now - start) / 1000);
  if (seals.size && document.visibilityState === "visible") frame = requestAnimationFrame(tick);
}

function wake() {
  if (reduced()) { paint(2.0); return; }
  if (!frame && seals.size) frame = requestAnimationFrame(tick);
}

function scan(root = document) {
  root.querySelectorAll?.(SEAL_SELECTOR).forEach(attach);
  wake();
}

export function startWax() {
  if (renderer !== undefined) return;
  renderer = createRenderer();
  if (!renderer) return;
  document.documentElement.classList.add("has-wax");
  addEventListener("pointermove", (event) => {
    tilt.tx = (event.clientX / innerWidth - 0.5) * 2;
    tilt.ty = (event.clientY / innerHeight - 0.5) * 2;
    wake();
  }, { passive: true });
  addEventListener("deviceorientation", (event) => {
    if (event.gamma == null || event.beta == null) return;
    tilt.tx = Math.max(-1, Math.min(1, event.gamma / 30));
    tilt.ty = Math.max(-1, Math.min(1, (event.beta - 45) / 30));
    wake();
  }, { passive: true });
  document.addEventListener("visibilitychange", wake);
  new MutationObserver(() => scan()).observe(document.body, { childList: true, subtree: true });
  scan();
}

startWax();
