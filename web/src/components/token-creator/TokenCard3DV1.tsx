"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { TokenCardV1 } from "@/lib/token-creator/design-v1";
import { renderTokenBackCanvasV1, renderTokenFrontCanvasV1 } from "@/lib/token-creator/render-v1";
import { TokenCardCanvasV1 } from "./TokenCardCanvasV1";
import { useTokenArtV1, useTokenFontsV1, useTokenPanelArtV1, useTokenSymbolArtV1 } from "./useTokenAssetsV1";

const W = 0.63;
const H = 0.88;
const RADIUS = 0.03;
const DEPTH = 0.009;
const TEXTURE_SCALE = 1.5;

function cardShape(): THREE.Shape {
  const s = new THREE.Shape();
  const x = -W / 2;
  const y = -H / 2;
  s.moveTo(x + RADIUS, y);
  s.lineTo(x + W - RADIUS, y);
  s.absarc(x + W - RADIUS, y + RADIUS, RADIUS, -Math.PI / 2, 0, false);
  s.lineTo(x + W, y + H - RADIUS);
  s.absarc(x + W - RADIUS, y + H - RADIUS, RADIUS, 0, Math.PI / 2, false);
  s.lineTo(x + RADIUS, y + H);
  s.absarc(x + RADIUS, y + H - RADIUS, RADIUS, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + RADIUS);
  s.absarc(x + RADIUS, y + RADIUS, RADIUS, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** A face whose texture spans the whole card, corners trimmed by the shape. */
function faceGeometry(shape: THREE.Shape): THREE.ShapeGeometry {
  const geo = new THREE.ShapeGeometry(shape, 10);
  const pos = geo.attributes.position!;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + W / 2) / W;
    uv[i * 2 + 1] = (pos.getY(i) + H / 2) / H;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function webglAvailableV1(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/**
 * Created and disposed by the same effect: a texture disposed while still
 * mounted (as a memo plus a separate cleanup would be under Strict Mode) is
 * never uploaded again and renders black.
 */
function useCanvasTexture(source: HTMLCanvasElement | null, gl: THREE.WebGLRenderer): THREE.CanvasTexture | null {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  useEffect(() => {
    if (!source) return;
    const t = new THREE.CanvasTexture(source);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    setTexture(t);
    return () => t.dispose();
  }, [source, gl]);
  return source ? texture : null;
}

function CardMesh({
  front,
  back,
  flipped,
  reducedMotion,
  hoverTilt,
}: {
  front: HTMLCanvasElement | null;
  back: HTMLCanvasElement | null;
  flipped: boolean;
  reducedMotion: boolean;
  hoverTilt: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const tilt = useRef({ x: 0, y: 0 });
  const { invalidate, gl } = useThree();
  const shape = useMemo(() => cardShape(), []);
  const faceGeo = useMemo(() => faceGeometry(shape), [shape]);
  const edgeGeo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: false, curveSegments: 10 });
    g.translate(0, 0, -DEPTH / 2);
    return g;
  }, [shape]);

  const frontTex = useCanvasTexture(front, gl);
  const backTex = useCanvasTexture(back, gl);
  useEffect(() => invalidate(), [frontTex, backTex, flipped, invalidate]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const targetY = (flipped ? Math.PI : 0) + tilt.current.y;
    const targetX = tilt.current.x;
    if (reducedMotion) {
      g.rotation.y = targetY;
      g.rotation.x = targetX;
      return;
    }
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, targetY, 0.14);
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, targetX, 0.14);
    if (Math.abs(g.rotation.y - targetY) > 0.001 || Math.abs(g.rotation.x - targetX) > 0.001) invalidate();
  });

  return (
    <group
      ref={group}
      onPointerMove={
        hoverTilt && !reducedMotion
          ? (e) => {
              const p = e.uv;
              if (!p) return;
              tilt.current = { x: (0.5 - p.y) * 0.35, y: (p.x - 0.5) * 0.45 * (flipped ? -1 : 1) };
              invalidate();
            }
          : undefined
      }
      onPointerOut={() => {
        tilt.current = { x: 0, y: 0 };
        invalidate();
      }}
    >
      <mesh geometry={edgeGeo}>
        <meshStandardMaterial color="#e8e2d4" roughness={0.6} metalness={0.05} />
      </mesh>
      <mesh geometry={faceGeo} position={[0, 0, DEPTH / 2 + 0.0004]}>
        {/* Keyed so a new texture gets a new material: three.js only adds map
            support to a material's shader when the material is compiled. */}
        {frontTex ? (
          <meshStandardMaterial key={frontTex.uuid} map={frontTex} roughness={0.42} metalness={0.04} toneMapped={false} />
        ) : (
          <meshStandardMaterial key="blank" color="#26221d" />
        )}
      </mesh>
      <mesh geometry={faceGeo} position={[0, 0, -DEPTH / 2 - 0.0004]} rotation={[0, Math.PI, 0]}>
        {backTex ? (
          <meshStandardMaterial key={backTex.uuid} map={backTex} roughness={0.5} toneMapped={false} />
        ) : (
          <meshStandardMaterial key="blank" color="#26221d" />
        )}
      </mesh>
    </group>
  );
}

export type TokenCard3DHandleV1 = { reset: () => void; zoom: (factor: number) => void };

const Rig = forwardRef<TokenCard3DHandleV1, { orbit: boolean }>(function Rig({ orbit }, ref) {
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const { camera, invalidate } = useThree();
  useImperativeHandle(ref, () => ({
    reset() {
      controls.current?.reset();
      camera.position.set(0, 0, 1.55);
      camera.lookAt(0, 0, 0);
      invalidate();
    },
    zoom(factor: number) {
      const d = THREE.MathUtils.clamp(camera.position.length() * factor, 0.75, 2.8);
      camera.position.setLength(d);
      controls.current?.update();
      invalidate();
    },
  }));
  if (!orbit) return null;
  return <OrbitControls ref={controls} enablePan={false} minDistance={0.75} maxDistance={2.8} enableDamping={false} />;
});

/** Front and back canvases for a card, redrawn when the design, art or fonts change. */
export function useTokenFaceCanvasesV1(card: TokenCardV1, artUrl: string | null | undefined, storeName: string) {
  const art = useTokenArtV1(artUrl);
  const panelArt = useTokenPanelArtV1(card);
  const symbolArt = useTokenSymbolArtV1(card);
  const fontsTick = useTokenFontsV1(card);
  const [front, setFront] = useState<HTMLCanvasElement | null>(null);
  const [back, setBack] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => {
      setFront(
        renderTokenFrontCanvasV1(card, {
          art,
          artWidth: art?.naturalWidth,
          artHeight: art?.naturalHeight,
          scale: TEXTURE_SCALE,
          bleed: false,
          panelArt,
          symbolArt,
        }),
      );
    }, 120);
    return () => window.clearTimeout(id);
  }, [card, art, panelArt, symbolArt, fontsTick]);
  useEffect(() => {
    setBack(renderTokenBackCanvasV1({ scale: TEXTURE_SCALE, bleed: false, storeName }));
  }, [storeName, fontsTick]);
  return { front, back };
}

/**
 * A token as a physical card: rounded corners, a little thickness, the
 * printed front and the card back. `orbit` lets the customer turn it freely
 * (the expanded viewer); otherwise it tilts toward the pointer. Without WebGL
 * it falls back to the flat card.
 */
export const TokenCard3DV1 = forwardRef<
  TokenCard3DHandleV1,
  {
    card: TokenCardV1;
    artUrl: string | null | undefined;
    storeName: string;
    flipped?: boolean;
    orbit?: boolean;
    height: number;
    className?: string;
  }
>(function TokenCard3DV1({ card, artUrl, storeName, flipped = false, orbit = false, height, className = "" }, ref) {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const { front, back } = useTokenFaceCanvasesV1(card, artUrl, storeName);
  useEffect(() => setWebgl(webglAvailableV1()), []);

  const width = Math.round((height * W) / H);
  if (webgl === false) {
    return (
      <div className={`token-flat-card ${flipped ? "token-flat-card--flipped" : ""} ${className}`} style={{ width, height }}>
        {flipped && back ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={back.toDataURL("image/png")} alt="Card back" style={{ width, height }} />
        ) : (
          <TokenCardCanvasV1 card={card} artUrl={artUrl} width={width} />
        )}
      </div>
    );
  }

  return (
    <div className={`token-3d ${className}`} style={{ height, width: orbit ? "100%" : width * 1.18 }}>
      {webgl ? (
        <Canvas
          frameloop="demand"
          dpr={[1, 2]}
          camera={{ position: [0, 0, 1.55], fov: 36 }}
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener("webglcontextlost", (e) => {
              e.preventDefault();
              setWebgl(false);
            });
          }}
        >
          <ambientLight intensity={1.15} />
          <directionalLight position={[1.5, 2, 3]} intensity={1.1} />
          <directionalLight position={[-2, -1, -2]} intensity={0.5} />
          <CardMesh front={front} back={back} flipped={flipped} reducedMotion={reducedMotion} hoverTilt={!orbit} />
          <Rig ref={ref} orbit={orbit} />
        </Canvas>
      ) : null}
    </div>
  );
});
