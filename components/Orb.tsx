"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { fragmentShader, vertexShader } from "@/lib/orb/shaders";
import { ORB_STATES, type OrbStatePreset } from "@/lib/orb/states";
import type { OrbState } from "@/lib/types";

interface OrbProps {
  state: OrbState;
  /** 0..1 live energy, used in Phase 2 to drive the orb from audio. */
  amplitude?: number;
  /** Fires on a tap or click that lands on the orb surface. */
  onTap?: () => void;
}

const RADIUS = 1.25;
const clamp = (min: number, max: number, value: number) =>
  Math.max(min, Math.min(max, value));
const lerp = (a: number, b: number, n: number) => a + (b - a) * n;

export default function Orb({ state, amplitude = 0, onTap }: OrbProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);

  // Mutable values the render loop reads without re-running the setup effect.
  const targetRef = useRef<OrbStatePreset>(ORB_STATES[state]);
  const amplitudeRef = useRef(amplitude);
  const onTapRef = useRef(onTap);

  useEffect(() => {
    targetRef.current = ORB_STATES[state];
  }, [state]);
  useEffect(() => {
    amplitudeRef.current = amplitude;
  }, [amplitude]);
  useEffect(() => {
    onTapRef.current = onTap;
  }, [onTap]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const halo = haloRef.current;
    if (!container || !canvas) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const motion = reduced ? 0.45 : 1;

    const isMobile =
      Math.min(window.innerWidth, window.innerHeight) < 640 ||
      window.matchMedia("(pointer: coarse)").matches;
    const count = isMobile ? 2200 : 4200;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 3.7);

    // Rotating group holds the visible points plus an invisible raycast shell.
    const group = new THREE.Group();
    scene.add(group);

    // Fibonacci sphere: even distribution of dots over the surface.
    const positions = new Float32Array(count * 3);
    const randoms = new Float32Array(count);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const t = golden * i;
      positions[i * 3] = Math.cos(t) * r * RADIUS;
      positions[i * 3 + 1] = y * RADIUS;
      positions[i * 3 + 2] = Math.sin(t) * r * RADIUS;
      randoms[i] = Math.random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));

    const initial = targetRef.current;
    const uniforms: Record<string, THREE.IUniform> = {
      uTime: { value: 0 },
      uBreath: { value: initial.breath * motion },
      uBreathSpeed: { value: initial.bSpeed },
      uWobbleAmp: { value: initial.wAmp * motion },
      uWobbleFreq: { value: initial.wFreq },
      uWobbleSpeed: { value: initial.wSpeed },
      uSize: { value: 14 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uEnergy: { value: initial.energy },
      uClickDir: { value: new THREE.Vector3(0, 1, 0) },
      uClickTime: { value: -10 },
      uColorA: { value: new THREE.Color(initial.colorA) },
      uColorB: { value: new THREE.Color(initial.colorB) },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    group.add(points);

    // Invisible shell, used only for raycasting taps onto the surface.
    const shellGeometry = new THREE.SphereGeometry(RADIUS, 24, 24);
    const shellMaterial = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
    });
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    group.add(shell);

    let autoRot = initial.rot * motion;

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      const dpr = Math.min(window.devicePixelRatio, 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      uniforms.uPixelRatio.value = dpr;
      uniforms.uSize.value = clamp(10, 16, Math.min(w, h) / 55);
    };
    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    window.addEventListener("orientationchange", resize);

    // Pointer: drag to orbit with inertia, tap to ripple.
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down: { x: number; y: number; t: number } | null = null;
    let dragging = false;
    let rotX = 0;
    let rotY = 0;
    let velX = 0;
    let velY = 0;

    const tap = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(shell, false);
      if (hits.length > 0) {
        const local = group.worldToLocal(hits[0].point.clone()).normalize();
        (uniforms.uClickDir.value as THREE.Vector3).copy(local);
        uniforms.uClickTime.value = uniforms.uTime.value;
        onTapRef.current?.();
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
      dragging = true;
      velX = 0;
      velY = 0;
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || !down) return;
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      velY = dx * 0.005;
      velX = dy * 0.005;
      rotY += velY;
      rotX += velX;
      rotX = clamp(-1.2, 1.2, rotX);
    };
    const onPointerUp = (e: PointerEvent) => {
      dragging = false;
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const dt = performance.now() - down.t;
      if (moved < 7 && dt < 400) tap(e.clientX, e.clientY);
      down = null;
    };
    const onPointerCancel = () => {
      dragging = false;
      down = null;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);

    const clock = new THREE.Clock();
    let frameId = 0;
    let running = true;

    const frame = () => {
      // Clamp dt so a long hidden-tab pause does not jump the animation.
      const dt = Math.min(clock.getDelta(), 0.05);
      uniforms.uTime.value += dt;

      const target = targetRef.current;
      const s = 0.06;
      const energyTarget = Math.max(target.energy, amplitudeRef.current);
      uniforms.uEnergy.value = lerp(uniforms.uEnergy.value, energyTarget, s);
      uniforms.uBreath.value = lerp(
        uniforms.uBreath.value,
        target.breath * motion,
        s,
      );
      uniforms.uBreathSpeed.value = lerp(
        uniforms.uBreathSpeed.value,
        target.bSpeed,
        s,
      );
      uniforms.uWobbleAmp.value = lerp(
        uniforms.uWobbleAmp.value,
        target.wAmp * motion,
        s,
      );
      uniforms.uWobbleFreq.value = lerp(
        uniforms.uWobbleFreq.value,
        target.wFreq,
        s,
      );
      uniforms.uWobbleSpeed.value = lerp(
        uniforms.uWobbleSpeed.value,
        target.wSpeed,
        s,
      );
      (uniforms.uColorA.value as THREE.Color).lerp(
        new THREE.Color(target.colorA),
        s,
      );
      (uniforms.uColorB.value as THREE.Color).lerp(
        new THREE.Color(target.colorB),
        s,
      );
      autoRot = target.rot * motion;

      if (!dragging) {
        rotY += velY;
        rotX += velX;
        velX *= 0.94;
        velY *= 0.94;
        rotY += autoRot;
      }
      group.rotation.y = lerp(group.rotation.y, rotY, 0.12);
      group.rotation.x = lerp(group.rotation.x, rotX, 0.12);

      if (halo) {
        const pct = Math.round(8 + uniforms.uEnergy.value * 22);
        halo.style.background = `radial-gradient(60% 60% at 50% 46%, color-mix(in srgb, ${target.glow} ${pct}%, transparent) 0%, transparent 60%)`;
      }

      renderer.render(scene, camera);
      if (running) frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(frameId);
      } else if (!running) {
        running = true;
        clock.getDelta(); // discard the idle gap
        frameId = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(frameId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("orientationchange", resize);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      geometry.dispose();
      material.dispose();
      shellGeometry.dispose();
      shellMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <div
        ref={haloRef}
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ filter: "blur(8px)" }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
    </div>
  );
}
