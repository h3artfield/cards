"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Line } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { SemanticMapCompareResult, SemanticMapInventoryOverlay, SemanticMapPoint } from "@/lib/semantic-visualization/types";

const QUALITY_COLORS: Record<string, string> = {
  publishable: "#7dd3fc",
  needs_review: "#fbbf24",
  quarantined: "#f87171",
};

const SELECTED_COLOR = "#fbbf24";
const HOVER_COLOR = "#ffffff";

/** Disable raycast so decorative markers never steal clicks from the point cloud. */
function disableRaycast(obj: THREE.Object3D) {
  obj.raycast = () => undefined;
}

function pointColor(
  p: SemanticMapPoint,
  inventory: SemanticMapInventoryOverlay | undefined,
  selectedOracleId: string | null,
  hoverOracleId: string | null,
): THREE.Color {
  if (p.oracleId === selectedOracleId) return new THREE.Color(SELECTED_COLOR);
  if (p.oracleId === hoverOracleId) return new THREE.Color(HOVER_COLOR);
  if (inventory?.inStock) return new THREE.Color("#34d399");
  if (selectedOracleId && p.oracleId !== selectedOracleId) {
    return new THREE.Color(QUALITY_COLORS[p.qualityStatus] ?? "#7dd3fc").multiplyScalar(0.45);
  }
  return new THREE.Color(QUALITY_COLORS[p.qualityStatus] ?? "#7dd3fc");
}

function nearestPointToRay(
  points: SemanticMapPoint[],
  ray: THREE.Ray,
  maxDistance: number,
): SemanticMapPoint | null {
  let best: SemanticMapPoint | null = null;
  let bestDist = maxDistance;
  const tmp = new THREE.Vector3();
  for (const p of points) {
    tmp.set(p.x, p.y, p.z);
    const dist = ray.distanceToPoint(tmp);
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

function pickDistanceThreshold(camera: THREE.Camera, span: number): number {
  if (!(camera instanceof THREE.PerspectiveCamera)) return span * 0.02;
  const dist = camera.position.length();
  return Math.max(span * 0.012, dist * 0.025);
}

function SemanticPoints({
  points,
  selectedOracleId,
  hoverOracleId,
  highlightOracleIds,
  inventoryMap,
  meshRef,
}: {
  points: SemanticMapPoint[];
  selectedOracleId: string | null;
  hoverOracleId: string | null;
  highlightOracleIds: string[];
  inventoryMap: Map<string, SemanticMapInventoryOverlay>;
  meshRef: React.RefObject<THREE.InstancedMesh | null>;
}) {
  const tempObj = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || points.length === 0) return;

    if (!mesh.instanceColor) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(points.length * 3), 3);
    }

    points.forEach((p, i) => {
      const isSelected = p.oracleId === selectedOracleId;
      const isHighlighted = highlightOracleIds.includes(p.oracleId);
      const scale = isSelected ? 0.01 : isHighlighted ? 1.8 : hoverOracleId === p.oracleId ? 1.5 : 1;
      tempObj.position.set(p.x, p.y, p.z);
      tempObj.scale.setScalar(scale);
      tempObj.updateMatrix();
      mesh.setMatrixAt(i, tempObj.matrix);
      mesh.setColorAt(
        i,
        pointColor(p, inventoryMap.get(p.oracleId), selectedOracleId, hoverOracleId),
      );
    });
    mesh.count = points.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [points, selectedOracleId, hoverOracleId, highlightOracleIds, inventoryMap, tempObj, meshRef]);

  if (points.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, points.length]}
      frustumCulled={false}
    >
      <sphereGeometry args={[0.045, 10, 10]} />
      <meshBasicMaterial vertexColors toneMapped={false} transparent opacity={0.85} depthWrite={false} />
    </instancedMesh>
  );
}

function PointCloudInteraction({
  points,
  allPoints,
  meshRef,
  span,
  onHover,
  onSelect,
}: {
  points: SemanticMapPoint[];
  allPoints: SemanticMapPoint[];
  meshRef: React.RefObject<THREE.InstancedMesh | null>;
  span: number;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const { camera, raycaster, gl } = useThree();
  const idByIndex = useMemo(() => points.map((p) => p.oracleId), [points]);
  const dragRef = useRef<{ x: number; y: number; dragging: boolean }>({ x: 0, y: 0, dragging: false });

  const resolvePick = useCallback(
    (clientX: number, clientY: number, allowNearestFallback: boolean): string | null => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

      const mesh = meshRef.current;
      if (mesh) {
        const hits = raycaster.intersectObject(mesh, false);
        if (hits.length > 0 && hits[0].instanceId != null) {
          const id = idByIndex[hits[0].instanceId];
          if (id) return id;
        }
      }

      if (!allowNearestFallback) return null;
      const nearest = nearestPointToRay(allPoints, raycaster.ray, pickDistanceThreshold(camera, span));
      return nearest?.oracleId ?? null;
    },
    [allPoints, camera, gl.domElement, idByIndex, meshRef, raycaster, span],
  );

  useEffect(() => {
    const el = gl.domElement;
    const onPointerDown = (e: PointerEvent) => {
      dragRef.current = { x: e.clientX, y: e.clientY, dragging: false };
    };
    const onPointerMove = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - dragRef.current.x, e.clientY - dragRef.current.y) > 4) {
        dragRef.current.dragging = true;
      }
      const id = resolvePick(e.clientX, e.clientY, false);
      onHover(id);
      el.style.cursor = id ? "pointer" : "grab";
    };
    const onPointerUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - dragRef.current.x, e.clientY - dragRef.current.y);
      if (!dragRef.current.dragging && moved < 6) {
        const id = resolvePick(e.clientX, e.clientY, true);
        if (id) onSelect(id);
      }
      dragRef.current.dragging = false;
    };
    const onPointerLeave = () => {
      onHover(null);
      el.style.cursor = "grab";
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointerleave", onPointerLeave);
    el.style.cursor = "grab";
    el.style.touchAction = "none";

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.style.cursor = "";
      el.style.touchAction = "";
    };
  }, [gl.domElement, onHover, onSelect, resolvePick]);

  return null;
}

function PointMarker({
  point,
  color,
  innerRadius,
  outerRadius,
  pulse = false,
}: {
  point: SemanticMapPoint;
  color: string;
  innerRadius: number;
  outerRadius: number;
  pulse?: boolean;
}) {
  const innerRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (groupRef.current) disableRaycast(groupRef.current);
  }, []);

  useFrame(({ clock }) => {
    if (!pulse) return;
    const s = 1 + Math.sin(clock.elapsedTime * 5) * 0.12;
    if (innerRef.current) innerRef.current.scale.setScalar(s);
    if (ringRef.current) ringRef.current.scale.setScalar(s);
  });

  return (
    <group ref={groupRef} position={[point.x, point.y, point.z]}>
      <mesh ref={innerRef}>
        <sphereGeometry args={[innerRadius, 20, 20]} />
        <meshBasicMaterial color={color} toneMapped={false} depthTest={false} transparent opacity={0.95} />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[outerRadius * 0.85, outerRadius, 48]} />
        <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} transparent opacity={0.85} depthTest={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[outerRadius * 1.15, outerRadius * 1.35, 48]} />
        <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.35} depthTest={false} />
      </mesh>
    </group>
  );
}

function CompareLine({ compare, points }: { compare: SemanticMapCompareResult | null; points: SemanticMapPoint[] }) {
  const a = compare ? points.find((p) => p.oracleId === compare.cardA.oracleId) : undefined;
  const b = compare ? points.find((p) => p.oracleId === compare.cardB.oracleId) : undefined;
  if (!a || !b) return null;
  return (
    <Line
      points={[
        [a.x, a.y, a.z],
        [b.x, b.y, b.z],
      ]}
      color="#f472b6"
      lineWidth={2}
    />
  );
}

function CameraFly({
  allPoints,
  flyTarget,
  controlsRef,
  onComplete,
}: {
  allPoints: SemanticMapPoint[];
  flyTarget: string | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  onComplete: () => void;
}) {
  const { camera } = useThree();
  const animRef = useRef<{ pos: THREE.Vector3; look: THREE.Vector3 } | null>(null);

  useEffect(() => {
    if (!flyTarget) return;
    const p = allPoints.find((x) => x.oracleId === flyTarget);
    if (!p) return;

    const look = new THREE.Vector3(p.x, p.y, p.z);
    const offset = new THREE.Vector3(0.35, 0.35, 0.55).normalize().multiplyScalar(1.2);
    animRef.current = {
      pos: look.clone().add(offset),
      look,
    };
  }, [flyTarget, allPoints]);

  useFrame(() => {
    if (!animRef.current) return;
    camera.position.lerp(animRef.current.pos, 0.1);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(animRef.current.look, 0.12);
      controlsRef.current.update();
    } else {
      camera.lookAt(animRef.current.look);
    }
    if (camera.position.distanceTo(animRef.current.pos) < 0.02) {
      animRef.current = null;
      onComplete();
    }
  });

  return null;
}

function SceneInner(props: {
  points: SemanticMapPoint[];
  allPoints: SemanticMapPoint[];
  span: number;
  selectedOracleId: string | null;
  hoverOracleId: string | null;
  highlightOracleIds: string[];
  compare: SemanticMapCompareResult | null;
  inventoryMap: Map<string, SemanticMapInventoryOverlay>;
  flyTarget: string | null;
  onFlyComplete: () => void;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const meshRef = useRef<THREE.InstancedMesh | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const selectedPoint = props.allPoints.find((p) => p.oracleId === props.selectedOracleId) ?? null;
  const hoverPoint =
    props.hoverOracleId && props.hoverOracleId !== props.selectedOracleId
      ? props.allPoints.find((p) => p.oracleId === props.hoverOracleId) ?? null
      : null;

  useEffect(() => {
    if (gridRef.current) disableRaycast(gridRef.current);
  }, []);

  return (
    <>
      <color attach="background" args={["#0a0a0a"]} />
      <ambientLight intensity={0.8} />
      <pointLight position={[10, 10, 10]} intensity={1.4} />
      <SemanticPoints
        points={props.points}
        selectedOracleId={props.selectedOracleId}
        hoverOracleId={props.hoverOracleId}
        highlightOracleIds={props.highlightOracleIds}
        inventoryMap={props.inventoryMap}
        meshRef={meshRef}
      />
      <PointCloudInteraction
        points={props.points}
        allPoints={props.allPoints}
        meshRef={meshRef}
        span={props.span}
        onHover={props.onHover}
        onSelect={props.onSelect}
      />
      {selectedPoint && (
        <PointMarker point={selectedPoint} color={SELECTED_COLOR} innerRadius={0.14} outerRadius={0.24} pulse />
      )}
      {hoverPoint && (
        <PointMarker point={hoverPoint} color={HOVER_COLOR} innerRadius={0.08} outerRadius={0.14} />
      )}
      <CompareLine compare={props.compare} points={props.allPoints} />
      <CameraFly
        allPoints={props.allPoints}
        flyTarget={props.flyTarget}
        controlsRef={controlsRef}
        onComplete={props.onFlyComplete}
      />
      <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.08} />
      <gridHelper ref={gridRef} args={[20, 20, "#333", "#222"]} />
    </>
  );
}

function computeBounds(allPoints: SemanticMapPoint[]) {
  if (allPoints.length === 0) {
    return {
      center: [0, 0, 0] as [number, number, number],
      span: 8,
      position: [0, 0, 8] as [number, number, number],
    };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of allPoints) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
  return {
    center: [cx, cy, cz] as [number, number, number],
    span,
    position: [cx, cy, cz + span * 1.4] as [number, number, number],
  };
}

export function SemanticMapCanvas3D(props: {
  points: SemanticMapPoint[];
  allPoints: SemanticMapPoint[];
  selectedOracleId: string | null;
  hoverOracleId: string | null;
  highlightOracleIds: string[];
  compare: SemanticMapCompareResult | null;
  showEdges: {
    semanticNeighbors: boolean;
    sharedActions: boolean;
    zoneFlow: boolean;
    grantedAbility: boolean;
  };
  neighborMap: Map<string, Array<{ oracleId: string; distance: number }>>;
  inventoryMap: Map<string, SemanticMapInventoryOverlay>;
  flyTarget: string | null;
  onFlyComplete: () => void;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const bounds = useMemo(() => computeBounds(props.allPoints), [props.allPoints]);

  return (
    <Canvas camera={{ position: bounds.position, fov: 50 }} className="h-full w-full">
      <SceneInner
        points={props.points}
        allPoints={props.allPoints}
        span={bounds.span}
        selectedOracleId={props.selectedOracleId}
        hoverOracleId={props.hoverOracleId}
        highlightOracleIds={props.highlightOracleIds}
        compare={props.compare}
        inventoryMap={props.inventoryMap}
        flyTarget={props.flyTarget}
        onFlyComplete={props.onFlyComplete}
        onHover={props.onHover}
        onSelect={props.onSelect}
      />
    </Canvas>
  );
}
