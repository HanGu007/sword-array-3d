import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FormationState } from '../types';

interface SwordArray3DProps {
  state: FormationState;
  targetPos: { x: number; y: number; vx: number; vy: number; active: boolean };
  swordScale: number;
  swordCount: number;
  animSpeed: number;
}

// ─── GLSL Shaders — 青竹峰云剑 ──────────────────────────────
const swordVertexShader = /* glsl */ `
  attribute vec3 instanceVelocity;
  varying float vVel;
  varying vec2 vUv;
  varying float vFresnel;
  varying float vHeight;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  void main() {
    float speed = length(instanceVelocity);
    vVel = speed;
    vUv = uv;
    vHeight = position.y;
    
    vec4 instancePosition = instanceMatrix * vec4(position, 1.0);
    vec3 worldNormal = normalize(mat3(instanceMatrix) * normal);
    vec3 viewDir = normalize(cameraPosition - instancePosition.xyz);
    vFresnel = pow(1.0 - abs(dot(worldNormal, viewDir)), 2.5);
    vWorldPos = instancePosition.xyz;

    gl_Position = projectionMatrix * modelViewMatrix * instancePosition;
  }
`;

const swordFragmentShader = /* glsl */ `
  varying float vVel;
  varying vec2 vUv;
  varying float vFresnel;
  varying float vHeight;
  varying vec3 vWorldPos;
  uniform float uTime;

  // Hash function for lightning pattern
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    // ─── Color Palette ─────────────────────────────────
    vec3 jadeCore  = vec3(0.08, 0.35, 0.18);   // deep bamboo green
    vec3 jadeMid   = vec3(0.15, 0.65, 0.30);   // mid jade
    vec3 jadeGlow  = vec3(0.25, 0.88, 0.42);   // bright emerald
    vec3 goldAccent = vec3(1.0, 0.72, 0.15);    // golden lightning
    vec3 goldEdge  = vec3(1.0, 0.85, 0.25);     // rim gold

    bool isBlade = vHeight > 0.15;
    bool isTip   = vHeight > 21.0;
    
    vec3 baseColor;
    float alpha = 1.0;

    if (isBlade) {
      // ─── Bamboo node pattern ────────────────────────
      // Nodes every ~3.5 units along the blade
      float nodePhase = vHeight / 3.5;
      float nodeFrac = fract(nodePhase);
      // Bulge at each node (brightens the bamboo ring)
      float nodeGlow = smoothstep(0.0, 0.06, nodeFrac) * smoothstep(0.14, 0.08, nodeFrac);
      nodeGlow = 1.0 - nodeGlow;
      // Narrow rings at the joints
      float ring = smoothstep(0.0, 0.015, nodeFrac) * smoothstep(0.03, 0.015, nodeFrac);
      
      // Base bamboo gradient: darker at bottom, brighter toward tip
      float heightGrad = smoothstep(0.15, 24.0, vHeight);
      baseColor = mix(jadeCore, jadeMid, heightGrad * 0.7);
      
      // Node rings: lighter jade + subtle gold
      baseColor = mix(baseColor, jadeGlow, ring * 0.35);
      baseColor = mix(baseColor, goldAccent * 0.5, ring * 0.15);
      
      // Lateral darkening (edges of the bamboo stalk)
      float lateral = abs(vUv.x - 0.5) * 2.0;
      baseColor = mix(baseColor, jadeCore * 0.6, smoothstep(0.3, 0.85, lateral) * 0.4);
      
      // Tip glows brighter
      baseColor = mix(baseColor, jadeGlow, smoothstep(22.0, 26.0, vHeight) * 0.6);
      
      // ─── Golden lightning arcs ───────────────────────
      float lx = vUv.x * 8.0;
      float ly = vHeight * 0.6 + uTime * 2.0;
      float n1 = noise(vec2(lx + uTime * 3.0, ly));
      float n2 = noise(vec2(lx * 2.3 - uTime * 2.0, ly * 1.5));
      float n3 = noise(vec2(lx * 4.1 + uTime * 1.5, ly * 0.8 - uTime));
      
      // Lightning only near edges and nodes
      float edgeMask = smoothstep(0.3, 0.7, lateral) * (1.0 - smoothstep(0.85, 1.0, lateral));
      float lightning = n1 * n2 * n3;
      lightning = pow(lightning, 1.5);
      // Threshold to make it crack-like
      lightning = smoothstep(0.65, 0.78, lightning) * edgeMask * (0.4 + nodeGlow * 0.6);
      
      // Add gold lightning at full brightness
      baseColor = mix(baseColor, goldAccent * 2.5, lightning * 0.8);
      // Lightning glow bleed
      baseColor += goldAccent * lightning * 0.4;
      
      // Pulsing energy on the blade
      float pulse = sin(uTime * 8.0 + vHeight * 0.4) * 0.5 + 0.5;
      baseColor += jadeGlow * pulse * edgeMask * 0.15;
      
      alpha = 0.9 + vFresnel * 0.1;
      
    } else {
      // ─── Handle / Hilt ──────────────────────────────
      float hiltRing = smoothstep(-0.85, -0.75, vHeight) * smoothstep(-0.65, -0.75, vHeight);
      float guardTop = smoothstep(-0.05, 0.15, vHeight);
      
      // Dark bamboo handle with gold wrapping
      baseColor = mix(jadeCore * 0.5, goldAccent, hiltRing * 0.8);
      baseColor = mix(baseColor, goldEdge * 1.5, guardTop * 0.6);
      
      // Handle wrap pattern
      float wrapPattern = abs(sin(vHeight * 3.0 + vUv.x * 15.0));
      baseColor = mix(baseColor, goldAccent * 1.3, wrapPattern * smoothstep(-6.0, -1.0, vHeight) * 0.3);
      
      alpha = 0.85;
    }

    // ─── Gold rim lighting (Fresnel) ───────────────────
    vec3 rim = goldEdge * 1.8 * vFresnel;
    
    // Speed-based glow
    float speedGlow = clamp(vVel, 0.0, 50.0) / 50.0;
    rim += goldAccent * speedGlow * 0.3;
    
    vec3 finalColor = baseColor + rim;
    
    // Additive gold energy on tip
    if (isTip) {
      finalColor += goldAccent * (1.0 + sin(uTime * 15.0) * 0.5) * 0.4;
    }

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// ─── Vector3 Pool ───────────────────────────────────────────
class Vec3Pool {
  private pool: THREE.Vector3[] = [];
  private idx = 0;

  get(): THREE.Vector3 {
    if (this.idx < this.pool.length) {
      const v = this.pool[this.idx++];
      return v;
    }
    const v = new THREE.Vector3();
    this.pool.push(v);
    this.idx++;
    return v;
  }

  reset() { this.idx = 0; }

  get tempCount() { return this.idx; }
}

// ─── Circular Buffer ────────────────────────────────────────
class CircularBuffer {
  private data: Float32Array;
  private head = 0;
  readonly size: number;

  constructor(size: number) {
    this.size = size;
    this.data = new Float32Array(size * 3);
  }

  push(x: number, y: number, z: number) {
    this.head = (this.head + 3) % (this.size * 3);
    this.data[this.head] = x;
    this.data[this.head + 1] = y;
    this.data[this.head + 2] = z;
  }

  /** Get item at logical index (0 = most recent, size-1 = oldest) */
  get3(idx: number, out: THREE.Vector3): THREE.Vector3 {
    const logicalHead = this.head / 3;
    const i = ((logicalHead - idx) % this.size + this.size) % this.size;
    const offset = i * 3;
    return out.set(this.data[offset], this.data[offset + 1], this.data[offset + 2]);
  }
}

// ─── Starfield ──────────────────────────────────────────────
function createStarfield(count: number): THREE.Points {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Spherical distribution
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 6000 + Math.random() * 8000;
    positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
    positions[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r;
    positions[i * 3 + 2] = Math.cos(phi) * r - 2000;

    const colorChoice = Math.random();
    if (colorChoice < 0.15) {
      colors[i * 3] = 0.2; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 0.5; // jade
    } else if (colorChoice < 0.25) {
      colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.8; colors[i * 3 + 2] = 0.3; // gold
    } else {
      colors[i * 3] = 0.7 + Math.random() * 0.3;
      colors[i * 3 + 1] = 0.7 + Math.random() * 0.3;
      colors[i * 3 + 2] = 0.8 + Math.random() * 0.2;
    }
    sizes[i] = 0.5 + Math.random() * 2.5;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    size: 2.5,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.7,
  });

  return new THREE.Points(geo, mat);
}

// ─── Energy Trail Particles ─────────────────────────────────
function createTrailParticles(maxSwords: number): {
  points: THREE.Points;
  positions: Float32Array;
  update: (swordPositions: Float32Array, count: number, dt: number) => void;
} {
  const trailCount = maxSwords * 3; // 3 trail dots per sword
  const positions = new Float32Array(trailCount * 3);
  const colors = new Float32Array(trailCount * 3);
  const sizes = new Float32Array(trailCount);
  const life = new Float32Array(trailCount);
  const attachedSword = new Int16Array(trailCount); // which sword each trail dot follows

  // Initialize
  for (let i = 0; i < trailCount; i++) {
    positions[i * 3] = 0;
    positions[i * 3 + 1] = -10000;
    positions[i * 3 + 2] = -10000;
    colors[i * 3] = 0.2;
    colors[i * 3 + 1] = 0.95;
    colors[i * 3 + 2] = 0.45;
    sizes[i] = 1.5;
    life[i] = 0;
    attachedSword[i] = i % maxSwords;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    size: 4.0,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.6,
  });

  const points = new THREE.Points(geo, mat);

  let elapsedCounter = 0;
  const spawnInterval = 0.03;

  const update = (swordPositions: Float32Array, count: number, dt: number) => {
    elapsedCounter += dt;

    for (let i = 0; i < trailCount; i++) {
      const sIdx = attachedSword[i];
      if (sIdx >= count) {
        life[i] = 0;
        positions[i * 3 + 1] = -10000;
        continue;
      }

      life[i] -= dt * 3.0;

      if (life[i] <= 0 && elapsedCounter > spawnInterval) {
        // Re-spawn at sword position
        positions[i * 3] = swordPositions[sIdx * 3];
        positions[i * 3 + 1] = swordPositions[sIdx * 3 + 1];
        positions[i * 3 + 2] = swordPositions[sIdx * 3 + 2];
        life[i] = 0.4 + Math.random() * 0.6;
        elapsedCounter = 0;
      } else if (life[i] > 0) {
        // Fade and drift
        positions[i * 3] += (Math.random() - 0.5) * 4;
        positions[i * 3 + 1] += (Math.random() - 0.5) * 4;
        positions[i * 3 + 2] += (Math.random() - 0.5) * 2;
        const t = life[i];
        colors[i * 3] = 0.2 * t;
        colors[i * 3 + 1] = 0.95 * t;
        colors[i * 3 + 2] = 0.45 * t;
        sizes[i] = 4.0 * t;
      }
    }

    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
  };

  return { points, positions, update };
}

// ─── Main Component ─────────────────────────────────────────
const MAX_SWORDS = 200;

const SwordArray3D: React.FC<SwordArray3DProps> = ({ state, targetPos, swordScale, swordCount, animSpeed }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const animIdRef = useRef<number>(0);

  const coreRef = useRef<{
    renderer: THREE.WebGLRenderer;
    composer: EffectComposer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    instancedMesh: THREE.InstancedMesh;
    particles: { pos: THREE.Vector3; vel: THREE.Vector3; acc: THREE.Vector3; offset: number }[];
    material: THREE.ShaderMaterial;
    pathBuf: CircularBuffer;
    pool: Vec3Pool;
    starfield: THREE.Points;
    trailSystem: ReturnType<typeof createTrailParticles>;
    bloomPass: UnrealBloomPass;
    swordPosBuf: Float32Array;
  } | null>(null);

  const paramsRef = useRef({ state, targetPos, swordScale, swordCount, animSpeed });

  useEffect(() => {
    paramsRef.current = { state, targetPos, swordScale, swordCount, animSpeed };
  }, [state, targetPos, swordScale, swordCount, animSpeed]);

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // ─── Scene Setup ──────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010409);

    const camera = new THREE.PerspectiveCamera(38, width / height, 1, 20000);
    camera.position.set(0, 0, 2600);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.setClearColor(0x010409, 1);
    renderer.autoClear = false;
    container.appendChild(renderer.domElement);

    // ─── Post Processing ──────────────────────────────────
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    renderPass.clear = true;
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      1.2,   // strength
      0.4,   // radius
      0.85   // threshold
    );
    bloomPass.renderToScreen = true;
    composer.addPass(bloomPass);

    // ─── Starfield ────────────────────────────────────────
    const starfield = createStarfield(2000);
    scene.add(starfield);

    // ─── Trail Particles ──────────────────────────────────
    const trailSystem = createTrailParticles(MAX_SWORDS);
    scene.add(trailSystem.points);

    // ─── 青竹峰云剑 Geometry ────────────────────────────
    const swordShape = new THREE.Shape();
    // Handle (grip): bamboo stalk, slightly tapered
    swordShape.moveTo(-0.35, -7.0);
    swordShape.lineTo(0.35, -7.0);
    swordShape.lineTo(0.22, -1.2);
    swordShape.lineTo(-0.22, -1.2);
    swordShape.lineTo(-0.35, -7.0);
    
    // Guard: elegant swept wings
    const guardHole = new THREE.Path();
    swordShape.moveTo(-1.6, -1.2);
    swordShape.lineTo(1.6, -1.2);
    swordShape.lineTo(1.8, -0.5);
    swordShape.bezierCurveTo(1.2, -0.35, 0.8, 0.0, 0.35, 0.15);
    swordShape.lineTo(-0.35, 0.15);
    swordShape.bezierCurveTo(-0.8, 0.0, -1.2, -0.35, -1.8, -0.5);
    swordShape.lineTo(-1.6, -1.2);
    
    // Blade: slender bamboo blade with subtle taper
    const bladeLen = 26.0;
    const tipW = 0.08;
    swordShape.moveTo(-0.25, 0.15);
    swordShape.lineTo(0.25, 0.15);
    // Right edge: slowly taper to tip
    swordShape.bezierCurveTo(0.25, 4.0, 0.22, 12.0, 0.06, bladeLen - 2.0);
    swordShape.lineTo(0.0, bladeLen + 1.5);
    // Left edge: mirror
    swordShape.lineTo(-0.06, bladeLen - 2.0);
    swordShape.bezierCurveTo(-0.22, 12.0, -0.25, 4.0, -0.25, 0.15);

    const geom = new THREE.ExtrudeGeometry(swordShape, {
      depth: 0.4,
      bevelEnabled: true,
      bevelThickness: 0.15,
      bevelSize: 0.15,
      bevelSegments: 5
    });

    const material = new THREE.ShaderMaterial({
      vertexShader: swordVertexShader,
      fragmentShader: swordFragmentShader,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const instancedMesh = new THREE.InstancedMesh(geom, material, MAX_SWORDS);
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instancedMesh.frustumCulled = false;

    const vels = new Float32Array(MAX_SWORDS * 3);
    instancedMesh.geometry.setAttribute('instanceVelocity', new THREE.InstancedBufferAttribute(vels, 3));
    scene.add(instancedMesh);

    // ─── Particle State ───────────────────────────────────
    const particles = Array.from({ length: MAX_SWORDS }).map((_, i) => ({
      pos: new THREE.Vector3((Math.random() - 0.5) * 4000, (Math.random() - 0.5) * 4000, (Math.random() - 0.5) * 2000 - 2000),
      vel: new THREE.Vector3(0, 0, 0),
      acc: new THREE.Vector3(0, 0, 0),
      offset: (i / MAX_SWORDS) * Math.PI * 2,
    }));

    // ─── Circular Path Buffer ─────────────────────────────
    const pathBuf = new CircularBuffer(180);
    for (let i = 0; i < 180; i++) pathBuf.push(0, 0, 0);

    // ─── Vector3 Pool ─────────────────────────────────────
    const pool = new Vec3Pool();

    // ─── Sword Position Buffer (for trail system) ─────────
    const swordPosBuf = new Float32Array(MAX_SWORDS * 3);

    coreRef.current = {
      renderer, composer, scene, camera, instancedMesh, particles,
      material, pathBuf, pool, starfield, trailSystem, bloomPass, swordPosBuf
    };

    // ─── Render Loop ──────────────────────────────────────
    let time = 0;
    const matrix = new THREE.Matrix4();
    // Target smoothing state
    let staticTargetX = 0, staticTargetY = 0;
    let prevTargetX = 0, prevTargetY = 0;
    let targetVelX = 0, targetVelY = 0;

    const loop = () => {
      if (!coreRef.current) return;
      const { renderer, composer, scene, camera, instancedMesh, particles, material, pathBuf, pool, starfield, trailSystem, swordPosBuf } = coreRef.current;
      const p = paramsRef.current;

      const dt = 0.016 * p.animSpeed;
      time += dt;
      material.uniforms.uTime.value = time;

      // Slow starfield rotation
      starfield.rotation.y += dt * 0.02;
      starfield.rotation.x += dt * 0.005;

      // Dynamic bloom based on formation
      const bloomPulse = 1.0 + Math.sin(time * 2.0) * 0.2;
      bloomPass.strength = 1.2 * bloomPulse;

      // Push current target to circular buffer (with temporal smoothing)
      const rawTx = (p.targetPos.x - 0.5) * 2800;
      const rawTy = -(p.targetPos.y - 0.5) * 2000;
      // EMA smooth the target to reduce hand jitter
      const smoothAlpha = 0.25;
      staticTargetX = staticTargetX * (1 - smoothAlpha) + rawTx * smoothAlpha;
      staticTargetY = staticTargetY * (1 - smoothAlpha) + rawTy * smoothAlpha;
      pathBuf.push(staticTargetX, staticTargetY, 0);

      // Track smoothed target velocity for prediction
      targetVelX = (staticTargetX - prevTargetX) * 60;
      targetVelY = (staticTargetY - prevTargetY) * 60;
      prevTargetX = staticTargetX;
      prevTargetY = staticTargetY;

      pool.reset();

      for (let i = 0; i < MAX_SWORDS; i++) {
        const part = particles[i];

        if (i >= p.swordCount) {
          // Move offscreen instead of scale=0 (avoids rendering overhead)
          matrix.identity();
          matrix.makeScale(0.01, 0.01, 0.01); 
          instancedMesh.setMatrixAt(i, matrix);
          const velAttr = instancedMesh.geometry.getAttribute('instanceVelocity') as THREE.InstancedBufferAttribute;
          velAttr.setXYZ(i, 0, 0, 0);
          swordPosBuf[i * 3] = 0;
          swordPosBuf[i * 3 + 1] = -10000;
          swordPosBuf[i * 3 + 2] = -10000;
          continue;
        }

        // ─── Anchor: hand position 1:1 mapped to 3D space ──
        const handX = staticTargetX;
        const handY = staticTargetY;
        const ratio = i / Math.max(p.swordCount, 1);

        // Hand move direction → chain extends backward along this
        const hVelX = targetVelX;
        const hVelY = targetVelY;
        const hSpeed = Math.sqrt(hVelX * hVelX + hVelY * hVelY) + 0.01;
        const hDirX = hVelX / hSpeed;
        const hDirY = hVelY / hSpeed;
        const pDirX = -hDirY;
        const pDirY = hDirX;

        // Chain spacing: head at hand, tail extends backward along movement
        const spacing = 20 + (1 - ratio) * 3;
        const tailOffset = ratio * spacing * p.swordCount * 0.22;
        const baseX = handX - hDirX * tailOffset;
        const baseY = handY - hDirY * tailOffset;

        // Dragon body wave: perpendicular to movement direction
        const waveP = time * 6 + ratio * 10;
        const waveA = 55 + ratio * 170;
        const bodyX = baseX + pDirX * Math.sin(waveP) * waveA;
        const bodyY = baseY + pDirY * Math.sin(waveP) * waveA;
        const bodyZ = -70 + Math.cos(waveP * 0.7) * (35 + ratio * 70);

        const anchor = pool.get().set(bodyX, bodyY, bodyZ - 40);
        
        let moveT: THREE.Vector3;

        switch (p.state) {
          case FormationState.POINT_STRIKE: {
            // Tight dragon: close spacing, straight line
            const zSpacing = ratio * 600 - 300;
            moveT = anchor.clone();
            moveT.z -= zSpacing;
            break;
          }
          case FormationState.DUAL_STREAM: {
            // Twin dragons: two chains side by side
            const side = i % 2 === 0 ? 1 : -1;
            const spread = 250 + Math.sin(time * 3 + ratio * 8) * 100;
            moveT = anchor.clone();
            moveT.x += spread * side;
            moveT.z += Math.sin(ratio * 6) * 150;
            break;
          }
          case FormationState.TRIPLE_HELIX: {
            // Triple helix dragon
            const helixAngle = time * 3 + ratio * Math.PI * 6;
            const helixR = 200 + ratio * 300;
            moveT = anchor.clone();
            moveT.x += Math.cos(helixAngle) * helixR;
            moveT.y += Math.sin(helixAngle) * helixR * 0.6;
            break;
          }
          case FormationState.SHIELD_DISK: {
            const ang = ratio * Math.PI * 2 + time * 2;
            const r = 400 + Math.sin(ratio * Math.PI * 6 + time) * 100;
            moveT = pool.get().set(handX, handY, 200);
            moveT.x += Math.cos(ang) * r;
            moveT.y += Math.sin(ang) * r;
            break;
          }
          case FormationState.RETRACT: {
            const orbitAngle = time * 8 + part.offset * 8;
            const orbitR = 60 + Math.sin(time * 3) * 30;
            moveT = pool.get().set(handX, handY, -80).add(
              pool.get().set(
                Math.cos(orbitAngle) * orbitR,
                Math.sin(orbitAngle) * orbitR,
                Math.cos(orbitAngle * 0.6) * orbitR * 0.4
              )
            );
            break;
          }
          case FormationState.FAN_WAVE: {
            // Dragon sweeps in a wide fan wave
            const fanRatio = ratio - 0.5;
            const fanAmp = 2000 + Math.sin(time * 2) * 300;
            moveT = anchor.clone();
            moveT.x += fanRatio * fanAmp;
            moveT.y += Math.sin(time * 7 + ratio * 16) * 350;
            moveT.z -= Math.abs(fanRatio) * 400;
            break;
          }
          case FormationState.SWARM: {
            // Dragon swarm: many overlapping chains
            const swarmAngle = part.offset * Math.PI * 2 + time * 2;
            const swarmR = 150 + ratio * 350;
            moveT = anchor.clone();
            moveT.x += Math.cos(swarmAngle) * swarmR;
            moveT.y += Math.sin(swarmAngle) * swarmR * 0.5;
            moveT.z += Math.cos(swarmAngle * 0.7) * swarmR * 0.3;
            break;
          }
          case FormationState.IDLE: {
            // ─── IDLE: Boids Flocking (no hand detected) ───
            const NUM_CLUSTERS = 5;
            const perCluster = Math.ceil(p.swordCount / NUM_CLUSTERS);
            const cIdx = Math.floor(i / perCluster);
            
            const cAngle = time * 0.22 + cIdx * Math.PI * 1.3;
            const cRadX = 700 + Math.sin(time * 0.35 + cIdx * 0.7) * 400;
            const cRadY = 400 + Math.cos(time * 0.4 + cIdx * 1.1) * 250;
            const cZ = Math.cos(time * 0.25 + cIdx * 1.5) * 500 - 400;
            const clusterCenter = pool.get().set(Math.cos(cAngle) * cRadX, Math.sin(cAngle) * cRadY, cZ);

            const sep = pool.get().set(0, 0, 0);
            const ali = pool.get().set(0, 0, 0);
            const coh = pool.get().set(0, 0, 0);
            let nSep = 0, nAli = 0, nCoh = 0;
            const startJ = cIdx * perCluster;
            const endJ = Math.min(startJ + perCluster, p.swordCount);

            for (let j = startJ; j < endJ; j++) {
              if (j === i) continue;
              const o = particles[j];
              const dx = part.pos.x - o.pos.x, dy = part.pos.y - o.pos.y, dz = part.pos.z - o.pos.z;
              const d = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.001;
              if (d < 160) { const w = 1/(d*d); sep.x+=dx*w*800; sep.y+=dy*w*800; sep.z+=dz*w*800; nSep++; }
              if (d < 350) { ali.x+=o.vel.x; ali.y+=o.vel.y; ali.z+=o.vel.z; nAli++; }
              if (d < 650) { coh.x+=o.pos.x; coh.y+=o.pos.y; coh.z+=o.pos.z; nCoh++; }
            }
            for (let c = 0; c < NUM_CLUSTERS; c++) {
              if (c === cIdx) continue;
              const sc = c * perCluster, ec = Math.min(sc + perCluster, p.swordCount);
              for (let j = sc; j < ec; j++) {
                const o = particles[j];
                const dx = part.pos.x - o.pos.x, dy = part.pos.y - o.pos.y, dz = part.pos.z - o.pos.z;
                const d = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.001;
                if (d < 300) { const w = 1/(d*d); sep.x+=dx*w*600; sep.y+=dy*w*600; sep.z+=dz*w*600; nSep++; }
              }
            }
            const forceSum = pool.get().set(0,0,0);
            if (nSep>0) forceSum.add(sep.multiplyScalar(1.8));
            if (nAli>0) { ali.divideScalar(nAli); forceSum.add(pool.get().copy(ali).sub(part.vel).multiplyScalar(0.9)); }
            if (nCoh>0) { coh.divideScalar(nCoh); forceSum.add(pool.get().copy(coh).sub(part.pos).multiplyScalar(0.018)); }
            const toCenter = pool.get().copy(clusterCenter).sub(part.pos);
            forceSum.add(toCenter.normalize().multiplyScalar(Math.min(toCenter.length()*0.025, 70)));
            const bx=2000,by=1400,bz=1000;
            if (Math.abs(part.pos.x)>bx) forceSum.x-=Math.sign(part.pos.x)*60;
            if (Math.abs(part.pos.y)>by) forceSum.y-=Math.sign(part.pos.y)*60;
            if (Math.abs(part.pos.z)>bz) forceSum.z-=Math.sign(part.pos.z)*40;
            const mf=80;
            if (forceSum.lengthSq()>mf*mf) forceSum.normalize().multiplyScalar(mf);
            part.acc.copy(forceSum);
            part.vel.add(pool.get().copy(part.acc).multiplyScalar(0.016*p.animSpeed));
            const spd=part.vel.length();
            if (spd>110) part.vel.normalize().multiplyScalar(110);
            if (spd<18 && spd>0.01) part.vel.normalize().multiplyScalar(25);
            part.vel.multiplyScalar(0.978);
            part.pos.add(part.vel);
            swordPosBuf[i*3]=part.pos.x; swordPosBuf[i*3+1]=part.pos.y; swordPosBuf[i*3+2]=part.pos.z;
            if (part.vel.lengthSq()>0.02) {
              const velDir=pool.get().copy(part.vel).normalize();
              const quat=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),velDir);
              matrix.compose(part.pos,quat,new THREE.Vector3(p.swordScale,p.swordScale,p.swordScale));
            } else {
              const quat=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,-1));
              matrix.compose(part.pos,quat,new THREE.Vector3(p.swordScale,p.swordScale,p.swordScale));
            }
            instancedMesh.setMatrixAt(i,matrix);
            (instancedMesh.geometry.getAttribute('instanceVelocity') as THREE.InstancedBufferAttribute).setXYZ(i,part.vel.x,part.vel.y,part.vel.z);
            continue;
          }

          default: {
            // Default dragon chain: pure follow
            moveT = anchor.clone();
          }
        }

        // ─── PD Controller Physics ──────────────────────────
        // Add prediction: targets near the front anticipate hand movement
        const frontRatio = i / Math.max(p.swordCount, 1);
        const predictionFactor = Math.max(0, 0.5 - frontRatio * 0.5); // 0.5 for i=0, 0 for i=count/2+
        const predX = targetVelX * predictionFactor * 0.15;
        const predY = targetVelY * predictionFactor * 0.15;

        const error = pool.get().copy(moveT).add(pool.get().set(predX, predY, 0)).sub(part.pos);
        const dist = error.length();
        
        // Proportional gain (spring): non-linear for natural feel
        const kp = 0.28 * p.animSpeed;
        const springForce = Math.min(dist * dist * 0.001 + dist * kp, 260);
        
        // Derivative damping (velocity-based)
        const kd = 0.6;
        const dampingForce = pool.get().copy(part.vel).multiplyScalar(kd);
        
        // Combine: force = spring - damping (+ gentle turbulence)
        error.normalize();
        const forceMag = springForce;
        error.multiplyScalar(forceMag).sub(dampingForce);
        
        // Subtle sinusoidal oscillation for organic swimming motion
        const waveAmp = 8.0 + (1 - frontRatio) * 12.0;
        const waveFreq = time * 5.0 + part.offset * 2.5;
        error.x += Math.sin(waveFreq) * waveAmp * 0.3;
        error.y += Math.cos(waveFreq * 0.7) * waveAmp * 0.3;
        error.z += Math.sin(waveFreq * 0.5 + 1.0) * waveAmp * 0.2;
        
        part.acc.copy(error);

        // Velocity integration
        part.vel.add(pool.get().copy(part.acc).multiplyScalar(0.016 * p.animSpeed));
        
        // Speed-adaptive friction: faster = more damping
        const speed = part.vel.length();
        const baseFriction = p.state === FormationState.RETRACT ? 0.72 : 0.955;
        const adaptiveFriction = baseFriction - speed * 0.00008;
        part.vel.multiplyScalar(Math.max(adaptiveFriction, 0.88));
        
        // Clamp max speed
        const maxSpeed = 320;
        if (speed > maxSpeed) part.vel.normalize().multiplyScalar(maxSpeed);
        
        part.pos.add(part.vel);

        // Store position for trail system
        swordPosBuf[i * 3] = part.pos.x;
        swordPosBuf[i * 3 + 1] = part.pos.y;
        swordPosBuf[i * 3 + 2] = part.pos.z;

        // Quaternion rotation: blade tip (+Y) → velocity direction
        if (part.vel.lengthSq() > 0.02) {
          const velDir = pool.get().copy(part.vel).normalize();
          const quat = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0), velDir
          );
          matrix.compose(part.pos, quat, new THREE.Vector3(p.swordScale, p.swordScale, p.swordScale));
        } else {
          const quat = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1)
          );
          matrix.compose(part.pos, quat, new THREE.Vector3(p.swordScale, p.swordScale, p.swordScale));
        }
        instancedMesh.setMatrixAt(i, matrix);
        const velAttr = instancedMesh.geometry.getAttribute('instanceVelocity') as THREE.InstancedBufferAttribute;
        velAttr.setXYZ(i, part.vel.x, part.vel.y, part.vel.z);
      }

      instancedMesh.instanceMatrix.needsUpdate = true;
      (instancedMesh.geometry.getAttribute('instanceVelocity') as THREE.InstancedBufferAttribute).needsUpdate = true;

      // Update trail particles
      trailSystem.update(swordPosBuf, p.swordCount, dt);

      composer.render();
      animIdRef.current = requestAnimationFrame(loop);
    };

    loop();

    const onResize = () => {
      if (!container || !coreRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      coreRef.current.camera.aspect = w / h;
      coreRef.current.camera.updateProjectionMatrix();
      coreRef.current.renderer.setSize(w, h);
      coreRef.current.composer.setSize(w, h);
    };

    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animIdRef.current);
      renderer.dispose();
      composer.dispose();
      geom.dispose();
      material.dispose();
      coreRef.current = null;
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full" />;
};

export default SwordArray3D;
