"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Center, Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { ReviewCardState } from "@/components/ReviewStateCardShell";

useGLTF.preload("/models/card.glb");

function WhiteCardMesh() {
  const { scene } = useGLTF("/models/card.glb");
  const whiteScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.material = new THREE.MeshStandardMaterial({
          color: "#ffffff",
          roughness: 0.4,
          metalness: 0.06,
        });
      }
    });
    return clone;
  }, [scene]);

  return <primitive object={whiteScene} scale={1.35} />;
}

function FlippingCardGroup({
  flipped,
  front,
  back,
}: {
  flipped: boolean;
  front: ReactNode;
  back: ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const target = useRef(flipped ? Math.PI : 0);

  useEffect(() => {
    target.current = flipped ? Math.PI : 0;
  }, [flipped]);

  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = THREE.MathUtils.lerp(
      groupRef.current.rotation.y,
      target.current,
      0.12,
    );
  });

  return (
    <group ref={groupRef}>
      <WhiteCardMesh />
      <Html
        transform
        occlude
        position={[0, 0, 0.012]}
        center
        style={{
          width: "220px",
          maxHeight: "300px",
          overflow: "hidden",
          pointerEvents: flipped ? "none" : "auto",
          opacity: flipped ? 0 : 1,
          transition: "opacity 0.15s",
        }}
      >
        <div className="rounded-lg bg-white/95 p-1 shadow-sm">{front}</div>
      </Html>
      <Html
        transform
        occlude
        position={[0, 0, -0.012]}
        rotation={[0, Math.PI, 0]}
        center
        style={{
          width: "220px",
          maxHeight: "300px",
          overflow: "hidden",
          pointerEvents: flipped ? "auto" : "none",
          opacity: flipped ? 1 : 0,
          transition: "opacity 0.15s",
        }}
      >
        <div className="rounded-lg bg-white/95 p-1 shadow-sm">{back}</div>
      </Html>
    </group>
  );
}

function CardScene({
  flipped,
  front,
  back,
}: {
  flipped: boolean;
  front: ReactNode;
  back: ReactNode;
}) {
  return (
    <>
      <ambientLight intensity={0.95} />
      <directionalLight position={[2, 3, 4]} intensity={0.85} />
      <directionalLight position={[-2, 1, -1]} intensity={0.25} />
      <Center>
        <FlippingCardGroup flipped={flipped} front={front} back={back} />
      </Center>
    </>
  );
}

export function ReviewFlipCard3D({
  face,
  reviewState,
  front,
  reasonBack,
  reviewBack,
  backMode,
  onError,
}: {
  face: "front" | "back";
  reviewState: ReviewCardState;
  front: ReactNode;
  reasonBack: ReactNode;
  reviewBack: ReactNode;
  backMode: "reason" | "review" | null;
  onError: () => void;
}) {
  const flipped = face === "back";
  const backContent = backMode === "reason" ? reasonBack : reviewBack;
  const accent =
    reviewState === "yes"
      ? "ring-emerald-400/70"
      : reviewState === "pending"
        ? "ring-amber-400/80"
        : "ring-red-400/60";

  return (
    <div
      className={`mx-auto w-full max-w-md touch-pan-y overflow-hidden rounded-xl ring-2 ${accent}`}
      style={{ height: "min(85vh, 520px)", maxHeight: "520px" }}
    >
      <Canvas
        camera={{ position: [0, 0, 2.15], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
        style={{ touchAction: "pan-y" }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            onError();
          });
        }}
        onError={onError}
      >
        <Suspense fallback={null}>
          <CardScene flipped={flipped} front={front} back={backContent} />
        </Suspense>
      </Canvas>
    </div>
  );
}
