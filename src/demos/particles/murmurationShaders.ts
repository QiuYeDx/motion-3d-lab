/* Murmuration shaders.
 * Neighbourhood without O(n²): every frame all birds are splatted (additively, 1 px points) into a coarse
 * 3D grid stored as z-slices tiled in a 2D half-float texture: rgb = Σ velocity, a = bird count.
 * Each bird then reads that field trilinearly: local mean velocity → alignment, density gradient at two
 * scales → cohesion (coarse, uphill) and separation (fine, downhill once crowded). */

export const GRID = {
  min: [-22, -6, -18] as const,
  dim: [44, 26, 32] as const, // cells
  cell: 1,
  tilesX: 8, // 32 z-slices → 8 × 4 tiles
}
export const GRID_TEX = [GRID.dim[0] * GRID.tilesX, GRID.dim[1] * Math.ceil(GRID.dim[2] / GRID.tilesX)] as const

const GRID_UNIFORMS = /* glsl */ `
uniform sampler2D tGrid;
uniform vec3 uMin, uDim;
uniform float uCell, uTilesX;
uniform vec2 uGridTex;
`

export const SPLAT_VERT = /* glsl */ `
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform float uCount;
${GRID_UNIFORMS}
varying vec4 vVal;
void main() {
  vec2 uv = position.xy;
  vec3 p = texture2D(tPos, uv).xyz;
  vec3 c = floor((p - uMin) / uCell);
  if (position.z >= uCount || any(lessThan(c, vec3(0.0))) || any(greaterThanEqual(c, uDim))) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vVal = vec4(0.0);
    return;
  }
  vec2 tile = vec2(mod(c.z, uTilesX), floor(c.z / uTilesX));
  vec2 px = tile * uDim.xy + c.xy + 0.5;
  gl_Position = vec4(px / uGridTex * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
  vVal = vec4(texture2D(tVel, uv).xyz, 1.0);
}
`
export const SPLAT_FRAG = /* glsl */ `
varying vec4 vVal;
void main() { gl_FragColor = vVal; }
`

export const VEL_FRAG = /* glsl */ `
${GRID_UNIFORMS}
uniform float uDt, uTime;
uniform float uAli, uCoh, uSep, uSpeed, uNoise, uTargetK, uDensRef;
uniform vec3 uTarget, uBMin, uBMax;
uniform vec4 uPred;   // xyz, strength
uniform float uPredR;

vec4 gridAt(vec3 c) {
  vec3 g = clamp(c - 0.5, vec3(0.0), uDim - 1.0);
  float z0 = floor(g.z);
  float z1 = min(z0 + 1.0, uDim.z - 1.0);
  vec2 inTile = g.xy + 0.5;
  vec2 t0 = vec2(mod(z0, uTilesX), floor(z0 / uTilesX)) * uDim.xy + inTile;
  vec2 t1 = vec2(mod(z1, uTilesX), floor(z1 / uTilesX)) * uDim.xy + inTile;
  return mix(texture2D(tGrid, t0 / uGridTex), texture2D(tGrid, t1 / uGridTex), g.z - z0);
}
float dens(vec3 c) { return gridAt(c).w; }

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// low-frequency shared wind: neighbours get nearly the same push, so the flock banks together
vec3 wander(vec3 p, float t) {
  return vec3(
    sin(p.y * 0.21 + t * 0.53) + sin(p.z * 0.17 - t * 0.37),
    0.9 * sin(p.z * 0.19 + t * 0.41) + 0.7 * sin(p.x * 0.13 + t * 0.29),
    sin(p.x * 0.23 - t * 0.47) + sin(p.y * 0.15 + t * 0.31)
  );
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 P = texture2D(texturePosition, uv);
  vec4 V = texture2D(textureVelocity, uv);
  vec3 p = P.xyz;
  vec3 v = V.xyz;
  float rnd = hash12(uv * 371.3);
  vec3 c = (p - uMin) / uCell;
  vec4 g = gridAt(c);
  float n = g.w;
  vec3 acc = vec3(0.0);

  // alignment: steer toward the local mean velocity
  if (n > 0.6) acc += (g.xyz / n - v) * uAli;

  // separation: fine density gradient, push downhill when crowded
  vec3 gf = vec3(dens(c + vec3(1.0, 0.0, 0.0)) - dens(c - vec3(1.0, 0.0, 0.0)),
                 dens(c + vec3(0.0, 1.0, 0.0)) - dens(c - vec3(0.0, 1.0, 0.0)),
                 dens(c + vec3(0.0, 0.0, 1.0)) - dens(c - vec3(0.0, 0.0, 1.0)));
  acc -= gf * vec3(1.1, 0.75, 1.1) / (n + 2.0) * uSep * 9.0 * smoothstep(0.3, 1.4, n / uDensRef);

  // cohesion: coarse density gradient (±3 cells), climb toward the body of the flock
  vec3 gc = vec3(dens(c + vec3(3.0, 0.0, 0.0)) - dens(c - vec3(3.0, 0.0, 0.0)),
                 dens(c + vec3(0.0, 3.0, 0.0)) - dens(c - vec3(0.0, 3.0, 0.0)),
                 dens(c + vec3(0.0, 0.0, 3.0)) - dens(c - vec3(0.0, 0.0, 3.0)));
  float nc = dens(c + vec3(3.0, 0.0, 0.0)) + dens(c - vec3(3.0, 0.0, 0.0)) + dens(c + vec3(0.0, 3.0, 0.0))
           + dens(c - vec3(0.0, 3.0, 0.0)) + dens(c + vec3(0.0, 0.0, 3.0)) + dens(c - vec3(0.0, 0.0, 3.0));
  // anisotropic: firm vertically, soft horizontally → the flock spreads into a banking sheet
  acc += gc * vec3(0.85, 1.3, 0.85) / (nc / 6.0 + n + 2.0) * uCoh * 4.0 * (1.0 - smoothstep(0.8, 1.6, n / uDensRef));

  // the roost path: weak always, firm when a bird strays
  vec3 dT = uTarget - p;
  float lT = length(dT) + 1e-3;
  acc += dT / lT * uTargetK * (0.25 + smoothstep(4.0, 13.0, lT) * 1.6);

  acc += wander(p * 2.1, uTime) * uNoise;
  // starlings hold altitude: damp climb/dive so the flock spreads into sheets that bank, not a ball
  acc.y -= v.y * 0.5;

  // soft bounds + keep clear of the ground
  acc -= (p - clamp(p, uBMin, uBMax)) * 2.0;
  acc.y += smoothstep(uBMin.y + 2.5, uBMin.y - 0.5, p.y) * 8.0;

  // predator: flee outward and sideways (the side the bird is already heading), panic boosts speed
  float panic = V.w * exp(-uDt * 0.9);
  if (uPred.w > 0.001) {
    vec3 dp = p - uPred.xyz;
    float r = length(dp) + 1e-3;
    float threat = uPred.w * (1.0 - smoothstep(0.0, uPredR, r));
    if (threat > 0.0) {
      vec3 away = dp / r;
      vec3 side = cross(away, vec3(0.0, 1.0, 0.0));
      side /= length(side) + 1e-4;
      side *= dot(v, side) >= 0.0 ? 1.0 : -1.0;
      acc += (away * 26.0 + side * 12.0 + vec3(0.0, (rnd - 0.4) * 10.0, 0.0)) * threat;
      panic = max(panic, threat);
    }
  }
  // panic spreads through the local field: crowded panicking neighbours carry it as speed
  float cruise = uSpeed * (0.9 + rnd * 0.2) * (1.0 + panic * 0.9);
  float sp = length(v) + 1e-4;
  acc += v / sp * (cruise - sp) * 1.8;

  v += acc * uDt;
  sp = length(v) + 1e-4;
  float lo = uSpeed * 0.5;
  float hi = uSpeed * 2.6;
  if (sp < lo) v *= lo / sp;
  if (sp > hi) v *= hi / sp;
  gl_FragColor = vec4(v, panic);
}
`

export const POS_FRAG = /* glsl */ `
uniform float uDt;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 P = texture2D(texturePosition, uv);
  vec4 V = texture2D(textureVelocity, uv);
  float freq = 11.0 + hash12(uv * 91.7) * 5.0 + V.w * 14.0;
  gl_FragColor = vec4(P.xyz + V.xyz * uDt, mod(P.w + uDt * freq, 6.2831853));
}
`

export const BIRD_VERT = /* glsl */ `
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform float uSize, uCount, uReveal;
attribute vec3 aRef;   // uv, index
attribute float aWing; // 0 body, 1 wing tip
varying float vFog;
void main() {
  vec4 P = texture2D(tPos, aRef.xy);
  vec4 V = texture2D(tVel, aRef.xy);
  float reveal = clamp((uCount - aRef.z) / uReveal, 0.0, 1.0);
  vec3 f = normalize(V.xyz + vec3(1e-4, 0.0, 0.0));
  vec3 r = cross(f, vec3(0.0, 1.0, 0.0));
  r /= length(r) + 1e-4;
  vec3 u = cross(r, f);
  vec3 lp = position;
  float flap = sin(P.w);
  lp.y += aWing * flap * 0.34;
  lp.x *= 1.0 - aWing * 0.22 * (1.0 - flap * flap);
  vec3 wp = P.xyz + (r * lp.x + u * lp.y + f * lp.z) * uSize * reveal;
  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  vFog = smoothstep(30.0, 58.0, -mv.z);
}
`
export const BIRD_FRAG = /* glsl */ `
uniform vec3 uInk, uHaze;
uniform float uAlpha;
varying float vFog;
void main() {
  gl_FragColor = vec4(mix(uInk, uHaze, vFog * 0.75), uAlpha);
}
`
