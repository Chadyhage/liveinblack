import { useEffect, useRef } from 'react'

const VS = `
  attribute vec2 a_pos;
  void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

const FS = `
precision highp float;
uniform float u_time;
uniform vec2  u_res;

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c,-s,s,c);
}

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(
    mix(hash(i), hash(i+vec2(1,0)), u.x),
    mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) {
    v += a * noise(p);
    p  = rot(0.37) * p * 2.1 + vec2(u_time * 0.03, u_time * 0.02);
    a *= 0.48;
  }
  return v;
}

vec3 envMap(vec2 n, float speed) {
  vec2 uv = n * 1.8 + vec2(u_time * speed, u_time * speed * 0.7);
  float f = fbm(uv);
  float g = fbm(uv + vec2(3.7, 1.3) + u_time * 0.015);
  float h = fbm(uv - vec2(1.1, 2.9) - u_time * 0.02);

  float chrome = smoothstep(0.0, 1.0, f * g * 3.0);
  vec3 base = mix(vec3(0.04, 0.04, 0.06), vec3(0.92, 0.94, 1.00), chrome);

  float iri  = sin(chrome * 12.0 + u_time * 0.4) * 0.5 + 0.5;
  float iri2 = sin(h * 9.0 - u_time * 0.3 + 1.57) * 0.5 + 0.5;

  vec3 iridColor = mix(
    vec3(0.05, 0.62, 0.82),
    vec3(0.78, 0.15, 0.55),
    iri
  );
  iridColor = mix(iridColor, vec3(0.85, 0.80, 0.20), iri2 * 0.4);

  float iridMask = smoothstep(0.4, 0.8, chrome) * smoothstep(0.0, 0.3, 1.0-chrome);
  iridMask += smoothstep(0.55, 0.65, g) * 0.6;

  return base + iridColor * iridMask * 0.55;
}

vec3 computeNormal(vec2 uv, float t) {
  float eps = 0.003;
  float h0 = fbm(uv * 3.0 + vec2(t*0.05));
  float hx = fbm((uv + vec2(eps,0)) * 3.0 + vec2(t*0.05));
  float hy = fbm((uv + vec2(0,eps)) * 3.0 + vec2(t*0.05));
  return normalize(vec3(hx - h0, hy - h0, eps * 6.0));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float t = u_time;

  vec2 warp1 = vec2(
    fbm(p * 1.2 + vec2(t*0.04, t*0.025)),
    fbm(p * 1.2 + vec2(3.14, 1.59) + vec2(t*0.035, t*0.04))
  );
  vec2 warp2 = vec2(
    fbm(p * 0.9 + warp1 * 1.2 + vec2(t*0.02)),
    fbm(p * 0.9 + warp1 * 1.2 + vec2(1.1, 2.7) + vec2(t*0.018))
  );
  vec2 warped = p + warp2 * 0.55;

  vec3 N = computeNormal(warped, t);
  vec3 L = normalize(vec3(sin(t*0.2)*0.8, cos(t*0.15)*0.6, 1.0));
  float diffuse = max(dot(N, L), 0.0) * 0.6 + 0.4;

  vec2 reflUV = warped + N.xy * 0.18;
  vec3 col = envMap(reflUV, 0.025);

  vec3 V = vec3(0,0,1);
  vec3 H = normalize(L + V);
  float spec  = pow(max(dot(N, H), 0.0), 64.0);
  float spec2 = pow(max(dot(N, H), 0.0), 220.0);
  col += vec3(0.9, 0.95, 1.0) * spec  * 0.4;
  col += vec3(1.0, 1.00, 1.0) * spec2 * 0.8;
  col *= diffuse;

  float vig = 1.0 - dot(uv - 0.5, (uv - 0.5) * vec2(1.2, 1.5));
  col *= smoothstep(0.0, 0.7, vig);

  /* darken heavily so content stays readable */
  col = pow(max(col, vec3(0.0)), vec3(0.88));
  col *= 0.28;
  col += vec3(0.01, 0.01, 0.025);

  gl_FragColor = vec4(col, 1.0);
}
`

function compile(gl, type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    console.error(gl.getShaderInfoLog(s))
  return s
}

export default function LiquidMetalBg() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!gl) return

    const prog = gl.createProgram()
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS))
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS))
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uTime = gl.getUniformLocation(prog, 'u_time')
    const uRes  = gl.getUniformLocation(prog, 'u_res')

    function resize() {
      const dpr = window.devicePixelRatio || 1
      canvas.width  = window.innerWidth  * dpr
      canvas.height = window.innerHeight * dpr
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    window.addEventListener('resize', resize)
    resize()

    let start = null
    let raf
    function frame(ts) {
      if (!start) start = ts
      const t = (ts - start) / 1000
      gl.uniform1f(uTime, t)
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
