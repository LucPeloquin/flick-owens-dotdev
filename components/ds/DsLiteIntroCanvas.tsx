"use client";

import {
  Component,
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { cartridgesForKind, type DsCartridgeKind } from "@/lib/ds/cartridges";
import type { DsHardwareState } from "@/lib/ds/hardware";
import type { DsPowerIndicatorColor } from "@/lib/ds/power-indicator";
import type { SkyEmuFrame } from "@/lib/ds/skyemu-protocol";

const MODEL_URL = "/assets/ds/model/ds-lite-crimson.glb?v=normalized-25";
const ACCESSORY_URL = "/assets/ds/model/ds-lite-accessories.glb?v=accessories-2";
const ALIGNMENT_SECONDS = 0.42;
const OPENING_SECONDS = 0.65;
// Keep the hinge and both screens centered in the open firmware pose. The
// original target sat a little too high, clipping the top shell on desktop
// while making the portrait crop feel off-center.
const CANONICAL_TARGET = new THREE.Vector3(0, 0.78, 0);
// The authored Open clip leaves both screen planes parallel, but the base
// deck is pitched toward the viewer. Use a restrained overhead pitch so the
// two screens read as one head-on reference plane, like the supplied DS photo,
// without flattening the hinge or foreshortening the lower screen.
const REFERENCE_VIEW_DIRECTION = new THREE.Vector3(0, 0.423, 0.906).normalize();
// Use one long-lens camera for inspection, the snap/open animation, and the
// firmware handoff. Keeping distance and FOV identical prevents the canvas
// remount at handoff from visibly changing perspective.
const REFERENCE_CAMERA_DISTANCE = 60;
const REFERENCE_CAMERA_FOV = 4.4;
const CANONICAL_CAMERA_POSITION = CANONICAL_TARGET.clone().add(REFERENCE_VIEW_DIRECTION.clone().multiplyScalar(REFERENCE_CAMERA_DISTANCE));
const FIRMWARE_CAMERA_POSITION = CANONICAL_CAMERA_POSITION.clone();
const FIRMWARE_CAMERA_FOV = REFERENCE_CAMERA_FOV;
const TOP_FOCUS_CAMERA_DISTANCE = 37;
const CANONICAL_CAMERA_FOV = REFERENCE_CAMERA_FOV;
const CANONICAL_ROOT_ROTATION = { x: 0, y: 0, z: 0 };
const SWITCH_TRAVEL = 4.5;
const SWITCH_PULSE_SECONDS = 0.24;
const SERVICE_CLOSE_SECONDS = 0.58;
const SLOT1_EJECT_SECONDS = 0.59;
const SLOT2_EJECT_SECONDS = 0.44;
const SLOT1_INSERT_SECONDS = 0.59;
const SLOT2_INSERT_SECONDS = 0.44;
// Accessory geometry is authored in normalized scene units. These pulls are
// long enough to clear the shell while remaining proportionate to the model.
const SLOT1_EJECT_DISTANCE = 1.02;
const SLOT2_EJECT_DISTANCE = 1.12;
// The cartridge accessories are modeled with their origin at the
// geometric center of the shell. A real DS/GBA card sits
// recessed inside the slot cavity with only the back/grip
// edge flush with the slot opening, so the cartridge center
// must be offset from the slot anchor along the slot axis
// (into the console) when the card is seated. The half-length
// of each accessory along its +Y axis (the insertion direction)
// is 0.464 units (half of the 35 mm card height),
// so the seated center sits 0.464 deeper than
// the anchor along the insertion axis.
const SLOT_SEAT_OFFSET = 0.464;
// The accessories are also modeled with their contacts on
// their -Y face and their label on +Z. When seated in
// the slot, the contacts must face into the console and
// the label must face the player, so each accessory is
// rotated 90 degrees around the slot's local +X axis to
// align its +Y (back/grip) with the slot's ejection
// direction. Slot-1 ejects toward the anchor's local -Z, so
// its seat rotation is -90 degrees around +X; Slot-2 ejects
// toward the anchor's local +Z, so its seat rotation is +90
// degrees around +X. These quaternions are expressed in the
// anchor's own local frame so placeAccessory can compose
// them with the anchor's world quaternion.
const SLOT1_SEAT_ROTATION = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
const SLOT2_SEAT_ROTATION = new THREE.Quaternion(Math.SQRT1_2, 0, 0, Math.SQRT1_2);
const SLOT_SEAT_CONFIG: Record<DsCartridgeKind, { offset: number; rotation: THREE.Quaternion }> = {
  // Slot-1 (NDS) ejects toward the anchor's local -Z, so the
  // seated offset along the anchor's +Z is positive (into the
  // console) and the seat rotation points the cartridge's
  // back/grip toward -Z.
  nds: { offset: SLOT_SEAT_OFFSET, rotation: SLOT1_SEAT_ROTATION },
  // Slot-2 (GBA) ejects toward the anchor's local +Z, so the
  // seated offset along the anchor's +Z is negative (into the
  // console, opposite the ejection direction) and the seat
  // rotation points the cartridge's grip toward +Z.
  gba: { offset: -SLOT_SEAT_OFFSET, rotation: SLOT2_SEAT_ROTATION },
};
const CLOSED_ROOT_POSITION = new THREE.Vector3(0, -0.18, 0);
const CLOSED_ROOT_ROTATION = { x: -0.28, y: 0.33, z: -0.03 };

const POWER_INDICATOR_APPEARANCE: Record<DsPowerIndicatorColor, { color: string; emissive: string; intensity: number }> = {
  off: { color: "#1b2720", emissive: "#000000", intensity: 0 },
  green: { color: "#55d98a", emissive: "#35e884", intensity: 2.2 },
  orange: { color: "#f3a43b", emissive: "#f27b18", intensity: 1.75 },
  red: { color: "#fa5060", emissive: "#f81938", intensity: 1.9 },
};

function setPowerIndicatorState(materials: THREE.MeshStandardMaterial[], color: DsPowerIndicatorColor) {
  const appearance = POWER_INDICATOR_APPEARANCE[color];
  for (const material of materials) {
    material.color.set(appearance.color);
    material.emissive.set(appearance.emissive);
    material.emissiveIntensity = appearance.intensity;
    material.needsUpdate = true;
  }
}

type RuntimeTexture = { texture: THREE.DataTexture; data: Uint8Array };

function createRuntimeScreenTexture(): RuntimeTexture {
  const data = new Uint8Array(256 * 192 * 4);
  const texture = new THREE.DataTexture(data, 256, 192, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return { texture, data };
}

function writeRuntimeFrame(frame: SkyEmuFrame, top: Uint8Array, bottom: Uint8Array) {
  top.fill(0);
  bottom.fill(0);
  const source = new Uint8Array(frame.buffer);
  const sourceHeight = frame.system === "nds" ? 384 : 160;
  const copyScreen = (target: Uint8Array, sourceY: number, targetX: number, targetY: number, width: number, height: number) => {
    for (let y = 0; y < height; y += 1) {
      // The libretro XRGB framebuffer is top-left origin while glTF UVs use
      // bottom-left origin. Reverse each destination row once here instead of
      // relying on renderer-specific texture flip behavior.
      const destinationY = 191 - targetY - y;
      for (let x = 0; x < width; x += 1) {
        const sourceIndex = ((sourceY + y) * frame.width + x) * 4;
        const destinationIndex = (destinationY * 256 + targetX + x) * 4;
        target[destinationIndex] = source[sourceIndex + 2] ?? 0;
        target[destinationIndex + 1] = source[sourceIndex + 1] ?? 0;
        target[destinationIndex + 2] = source[sourceIndex] ?? 0;
        target[destinationIndex + 3] = 255;
      }
    }
  };
  if (frame.system === "nds") {
    copyScreen(top, 0, 0, 0, Math.min(256, frame.width), 192);
    copyScreen(bottom, 192, 0, 0, Math.min(256, frame.width), 192);
  } else {
    // GBA output is 240x160. Center it on the upper DS screen and keep the
    // lower screen black, matching the physical Slot-2 presentation.
    copyScreen(top, 0, 8, 16, Math.min(240, frame.width), Math.min(160, sourceHeight));
  }
}

export type PowerSwitchAnchor = {
  x: number;
  y: number;
  visible: boolean;
};

export type ProjectedBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
  visible: boolean;
};

export type DsLiteCanvasPhase = IntroCanvasProps["phase"];

/**
 * Hardware controls that have a dedicated mesh in the production GLB. The
 * remaining controls (SELECT/START/shoulders/volume) intentionally keep their
 * semantic DOM fallback until the source asset exposes stable nodes for them.
 */
export type DsLiteMeshControl =
  | "dpad-up"
  | "dpad-left"
  | "dpad-right"
  | "dpad-down"
  | "a"
  | "b"
  | "x"
  | "y"
  | "l"
  | "r"
  | "start"
  | "select"
  | "power";

type IntroCanvasProps = {
  phase: "inspecting" | "aligning" | "opening" | "power-prompt" | "handoff" | "firmware";
  reducedMotion: boolean;
  onModelReady?: () => void;
  onActivate?: () => void;
  onAligned?: () => void;
  onOpenComplete?: () => void;
  onError?: () => void;
  onPowerSwitchPosition?: (position: PowerSwitchAnchor) => void;
  onScreenPosition?: (screen: "top" | "bottom", position: ProjectedBounds) => void;
  onBasePosition?: (position: ProjectedBounds) => void;
  onMeshControlPress?: (control: DsLiteMeshControl, pointerId: number) => void;
  onMeshControlRelease?: (control: DsLiteMeshControl, pointerId: number) => void;
  onMeshPowerFlick?: () => void;
  powerInputEnabled?: boolean;
  hardwareState?: DsHardwareState;
  onShellActivate?: () => void;
  onCartridgeActivate?: (slot: DsCartridgeKind) => void;
  onCartridgePromptPosition?: (slot: DsCartridgeKind, position: PowerSwitchAnchor) => void;
  onLibraryCartridgeActivate?: (slot: DsCartridgeKind) => void;
  screenFocus?: "full" | "top";
  onHardwareMotionComplete?: (token: number) => void;
  powerSwitchPulse: number;
  pressedControl?: string | null;
  pressedControls?: ReadonlySet<string>;
  powerIndicatorColor?: DsPowerIndicatorColor;
  /** Latest emulator framebuffer; uploaded directly to the GLB screen surfaces. */
  runtimeFrame?: SkyEmuFrame | null;
  onRuntimeTouch?: (x: number, y: number, pressed: boolean) => void;
};

export function DsLiteIntroCanvas({
  phase,
  reducedMotion,
  onModelReady,
  onActivate,
  onAligned,
  onOpenComplete,
  onError,
  onPowerSwitchPosition,
  onScreenPosition,
  onBasePosition,
  onMeshControlPress,
  onMeshControlRelease,
  onMeshPowerFlick,
  powerInputEnabled = true,
  hardwareState,
  onShellActivate,
  onCartridgeActivate,
  onCartridgePromptPosition,
  onLibraryCartridgeActivate,
  screenFocus = "full",
  onHardwareMotionComplete,
  powerSwitchPulse,
  pressedControl = null,
  pressedControls,
  powerIndicatorColor = "off",
  runtimeFrame = null,
  onRuntimeTouch,
}: IntroCanvasProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const contextLossReported = useRef(false);
  const cameraConfig = phase === "firmware"
    ? { position: FIRMWARE_CAMERA_POSITION.toArray(), fov: FIRMWARE_CAMERA_FOV, near: 0.1, far: 300 }
    : { position: CANONICAL_CAMERA_POSITION.toArray(), fov: CANONICAL_CAMERA_FOV, near: 0.1, far: 300 };

  return (
    <CanvasErrorBoundary onError={onError ?? (() => undefined)}>
      <Canvas
        className="ds-lite-intro-canvas"
        camera={cameraConfig}
        dpr={[1, 1.5]}
        // Keep the context conservative for embedded browsers and laptops
        // with strict GPU budgets. Antialiasing and the high-performance hint
        // can make the browser evict this canvas before the GLB finishes its
        // first stable frame.
        gl={{ alpha: true, antialias: false, powerPreference: "default", failIfMajorPerformanceCaveat: false }}
        onCreated={({ gl, camera }) => {
          gl.setClearColor(0x000000, 0);
          // R3F applies the camera position prop before the first render, but
          // a PerspectiveCamera still looks down its default -Z axis until it
          // is explicitly aimed. Without this initial lookAt the closed intro
          // can render an empty studio while OrbitControls waits for its first
          // frame update.
          camera.position.copy(CANONICAL_CAMERA_POSITION);
          camera.lookAt(CANONICAL_TARGET);
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld(true);
          // A browser can evict WebGL contexts when another tab or an
          // emulator renderer is active. Treat that as a normal capability
          // failure and hand the intro to its 2D fallback instead of leaving
          // an empty white stage behind.
          const handleContextLost = (event: Event) => {
            event.preventDefault();
            if (contextLossReported.current) return;
            contextLossReported.current = true;
            onError?.();
          };
          gl.domElement.addEventListener("webglcontextlost", handleContextLost, { once: true });
        }}
      >
        <StudioWireSphere />
        <ambientLight intensity={1.8} color="#ffffff" />
        <directionalLight position={[4, 8, 6]} intensity={3.2} color="#fff7f2" />
        <directionalLight position={[-4, 2, -3]} intensity={1.1} color="#cbd8ff" />
        <spotLight position={[0, 8, 3]} angle={0.45} penumbra={0.8} intensity={1.2} color="#ffffff" />
        <DsLiteDevice
          phase={phase}
          reducedMotion={reducedMotion}
          onModelReady={onModelReady}
          onActivate={onActivate}
          onAligned={onAligned}
          onOpenComplete={onOpenComplete}
          onError={onError}
          controlsRef={controlsRef}
          onPowerSwitchPosition={onPowerSwitchPosition}
          onScreenPosition={onScreenPosition}
          onBasePosition={onBasePosition}
          onMeshControlPress={onMeshControlPress}
          onMeshControlRelease={onMeshControlRelease}
          onMeshPowerFlick={onMeshPowerFlick}
          powerInputEnabled={powerInputEnabled}
          hardwareState={hardwareState}
          onShellActivate={onShellActivate}
          onCartridgeActivate={onCartridgeActivate}
          onCartridgePromptPosition={onCartridgePromptPosition}
          onLibraryCartridgeActivate={onLibraryCartridgeActivate}
          screenFocus={screenFocus}
          onHardwareMotionComplete={onHardwareMotionComplete}
          powerSwitchPulse={powerSwitchPulse}
          pressedControl={pressedControl}
          pressedControls={pressedControls}
          powerIndicatorColor={powerIndicatorColor}
          runtimeFrame={runtimeFrame}
          onRuntimeTouch={onRuntimeTouch}
        />
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enabled={phase === "inspecting" || (phase === "firmware" && hardwareState?.pose === "closed" && hardwareState.mode === "idle")}
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          minDistance={48}
          maxDistance={72}
          minPolarAngle={Math.PI / 2 - 0.61}
          maxPolarAngle={Math.PI / 2 + 0.61}
          target={CANONICAL_TARGET.toArray()}
        />
      </Canvas>
    </CanvasErrorBoundary>
  );
}

class CanvasErrorBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error("DS intro canvas error", error);
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function DsLiteDevice({
  phase,
  reducedMotion,
  onModelReady,
  onActivate,
  onAligned,
  onOpenComplete,
  onError,
  controlsRef,
  onPowerSwitchPosition,
  onScreenPosition,
  onBasePosition,
  onMeshControlPress,
  onMeshControlRelease,
  onMeshPowerFlick,
  powerInputEnabled,
  hardwareState,
  onShellActivate,
  onCartridgeActivate,
  onCartridgePromptPosition,
  onLibraryCartridgeActivate,
  screenFocus,
  onHardwareMotionComplete,
  powerSwitchPulse,
  pressedControl,
  pressedControls,
  powerIndicatorColor,
  runtimeFrame,
  onRuntimeTouch,
}: {
  phase: IntroCanvasProps["phase"];
  reducedMotion: boolean;
  onModelReady?: () => void;
  onActivate?: () => void;
  onAligned?: () => void;
  onOpenComplete?: () => void;
  onError?: () => void;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  onPowerSwitchPosition?: (position: PowerSwitchAnchor) => void;
  onScreenPosition?: (screen: "top" | "bottom", position: ProjectedBounds) => void;
  onBasePosition?: (position: ProjectedBounds) => void;
  onMeshControlPress?: (control: DsLiteMeshControl, pointerId: number) => void;
  onMeshControlRelease?: (control: DsLiteMeshControl, pointerId: number) => void;
  onMeshPowerFlick?: () => void;
  powerInputEnabled: boolean;
  hardwareState?: DsHardwareState;
  onShellActivate?: () => void;
  onCartridgeActivate?: (slot: DsCartridgeKind) => void;
  onCartridgePromptPosition?: (slot: DsCartridgeKind, position: PowerSwitchAnchor) => void;
  onLibraryCartridgeActivate?: (slot: DsCartridgeKind) => void;
  screenFocus: "full" | "top";
  onHardwareMotionComplete?: (token: number) => void;
  powerSwitchPulse: number;
  pressedControl?: string | null;
  pressedControls?: ReadonlySet<string>;
  powerIndicatorColor: DsPowerIndicatorColor;
  runtimeFrame?: SkyEmuFrame | null;
  onRuntimeTouch?: (x: number, y: number, pressed: boolean) => void;
}) {
  const { scene, animations } = useGLTF(MODEL_URL);
  // Loading the accessory GLB during the first inspection competes with the
  // intro renderer in embedded browsers. The console-only source is already
  // cached for inspection; defer accessories until the persistent firmware
  // canvas is mounted.
  const accessorySourceUrl = phase === "firmware" ? ACCESSORY_URL : MODEL_URL;
  const { scene: accessorySource } = useGLTF(accessorySourceUrl);
  // The intro and firmware canvases overlap during handoff. A Three.js object
  // may only belong to one scene graph, so give each canvas its own clone of
  // the loaded GLB while sharing immutable geometry and textures underneath.
  // Without this clone, mounting firmware briefly reparents the model out of
  // the intro canvas and reads as a reload/flash.
  const modelScene = useMemo(() => scene.clone(true), [scene]);
  const accessoryScene = useMemo(() => accessorySource.clone(true), [accessorySource]);
  // The extracted cartridge remains the centered object. These lightweight
  // clones are only the neighboring blank choices shown in the 3D library;
  // they share the accessory GLB's immutable geometry/materials and never
  // replace the extracted object.
  const libraryNdsPrevious = useMemo(() => {
    const node = accessorySource.getObjectByName("nds_cartridge")?.clone(true) ?? null;
    if (node) node.visible = false;
    return node;
  }, [accessorySource]);
  const libraryNdsNext = useMemo(() => {
    const node = accessorySource.getObjectByName("nds_cartridge")?.clone(true) ?? null;
    if (node) node.visible = false;
    return node;
  }, [accessorySource]);
  const libraryGbaPrevious = useMemo(() => {
    const node = accessorySource.getObjectByName("gba_cartridge")?.clone(true) ?? null;
    if (node) node.visible = false;
    return node;
  }, [accessorySource]);
  const libraryGbaNext = useMemo(() => {
    const node = accessorySource.getObjectByName("gba_cartridge")?.clone(true) ?? null;
    if (node) node.visible = false;
    return node;
  }, [accessorySource]);
  const libraryNdsPreviousRef = useRef<THREE.Object3D | null>(libraryNdsPrevious);
  const libraryNdsNextRef = useRef<THREE.Object3D | null>(libraryNdsNext);
  const libraryGbaPreviousRef = useRef<THREE.Object3D | null>(libraryGbaPrevious);
  const libraryGbaNextRef = useRef<THREE.Object3D | null>(libraryGbaNext);
  const deviceRoot = useRef<THREE.Group>(null);
  const openMixer = useRef<THREE.AnimationMixer | null>(null);
  const openAction = useRef<THREE.AnimationAction | null>(null);
  const pointerGesture = useRef<{
    pointerId: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const phaseRef = useRef(phase);
  const phaseStartedAt = useRef(0);
  const alignedSent = useRef(false);
  const openedSent = useRef(false);
  const readySent = useRef(false);
  const powerSwitch = useRef<THREE.Object3D | null>(null);
  const base = useRef<THREE.Object3D | null>(null);
  const screenTop = useRef<THREE.Object3D | null>(null);
  const screenBottom = useRef<THREE.Object3D | null>(null);
  const powerSwitchRestPosition = useRef<THREE.Vector3 | null>(null);
  const seenPowerSwitchPulse = useRef(powerSwitchPulse);
  const powerSwitchPulseStartedAt = useRef<number | null>(null);
  const powerIndicatorMaterials = useRef<THREE.MeshStandardMaterial[]>([]);
  const slot1Anchor = useRef<THREE.Object3D | null>(null);
  const slot2Anchor = useRef<THREE.Object3D | null>(null);
  const slot1Cartridge = useRef<THREE.Object3D | null>(null);
  const slot2Cover = useRef<THREE.Object3D | null>(null);
  const slot1PromptAnchor = useRef<THREE.Object3D | null>(null);
  const slot2PromptAnchor = useRef<THREE.Object3D | null>(null);
  const slot1AnchorRest = useRef<THREE.Vector3 | null>(null);
  const slot2AnchorRest = useRef<THREE.Vector3 | null>(null);
  const ndsAccessory = useRef<THREE.Object3D | null>(null);
  const gbaAccessory = useRef<THREE.Object3D | null>(null);
  const slot1Dot = useRef<THREE.Group>(null);
  const slot2Dot = useRef<THREE.Group>(null);
  const slot1PromptPosition = useRef(new THREE.Vector3());
  const slot2PromptPosition = useRef(new THREE.Vector3());
  const slot1PromptProjected = useRef(new THREE.Vector3());
  const slot2PromptProjected = useRef(new THREE.Vector3());
  const hardwareMotionStartedAt = useRef(0);
  const hardwareCompletionSent = useRef<number | null>(null);
  const hardwarePoseStart = useRef<{ cameraPosition: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const firmwareCameraTarget = useRef(new THREE.Vector3());
  const hardwareLookTarget = useRef(new THREE.Vector3());
  const accessoryWorldPosition = useRef(new THREE.Vector3());
  const accessoryWorldQuaternion = useRef(new THREE.Quaternion());
  const accessoryAxis = useRef(new THREE.Vector3());
  const libraryAccessoryPosition = useRef(new THREE.Vector3());
  const libraryNeighborPosition = useRef(new THREE.Vector3());
  const libraryCameraRight = useRef(new THREE.Vector3());
  const libraryNeighborQuaternion = useRef(new THREE.Quaternion());
  const libraryConsoleOffset = useRef(new THREE.Vector3());
  const libraryReturnPosition = useRef<THREE.Vector3 | null>(null);
  const previousHardwareMode = useRef<string | null>(null);
  const focusTarget = useRef(new THREE.Vector3());
  const focusCamera = useRef(new THREE.Vector3());
  const focusBounds = useRef(new THREE.Box3());
  const buttonPressNodes = useRef<Record<string, { node: THREE.Object3D; restY: number }>>({});
  const buttonPressProgress = useRef<Record<string, number>>({});
  const meshControlNames = useRef<Record<string, DsLiteMeshControl | "dpad">>({});
  const meshGesture = useRef<{
    pointerId: number;
    control: DsLiteMeshControl;
    startY: number;
    fired: boolean;
  } | null>(null);
  const projectedPowerSwitch = useRef(new THREE.Vector3());
  const lastPowerSwitchAnchor = useRef<PowerSwitchAnchor | null>(null);
  const lastCartridgePromptAnchors = useRef<Record<DsCartridgeKind, PowerSwitchAnchor | null>>({ nds: null, gba: null });
  const lastProjectedBounds = useRef<Record<string, ProjectedBounds | null>>({
    base: null,
    top: null,
    bottom: null,
  });
  const alignmentStart = useRef<{
    rootRotation: { x: number; y: number; z: number };
    rootY: number;
    cameraPosition: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);
  const { camera, size } = useThree();

  const runtimeSystem = runtimeFrame?.system ?? null;
  const runtimeTextures = useMemo(() => ({
    top: createRuntimeScreenTexture(),
    bottom: createRuntimeScreenTexture(),
  }), []);

  // Clone the screen materials once per runtime system and put the frame on
  // the actual GLB surfaces. The DOM screens remain only as a native-firmware
  // fallback; ROM output therefore tracks hinge/camera transforms exactly.
  useEffect(() => {
    const surfaces = [
      ["screen_top_surface", runtimeTextures.top.texture],
      ["screen_bottom_surface", runtimeTextures.bottom.texture],
    ] as const;
    for (const [name, texture] of surfaces) {
      const surface = modelScene.getObjectByName(name);
      surface?.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
        const materials = sourceMaterials.map((material) => material.clone());
        for (const material of materials) {
          material.map = runtimeSystem ? texture : null;
          material.color.set(runtimeSystem ? "#ffffff" : "#050608");
          material.needsUpdate = true;
        }
        child.material = Array.isArray(child.material) ? materials : materials[0];
      });
    }
  }, [modelScene, runtimeSystem, runtimeTextures]);

  useEffect(() => () => {
    runtimeTextures.top.texture.dispose();
    runtimeTextures.bottom.texture.dispose();
  }, [runtimeTextures]);

  useEffect(() => {
    if (!runtimeFrame) return;
    writeRuntimeFrame(runtimeFrame, runtimeTextures.top.data, runtimeTextures.bottom.data);
    // The textures are intentionally imperative Three.js resources owned by
    // this canvas; updating needsUpdate is the upload signal, not React state.
    // eslint-disable-next-line react-hooks/immutability
    runtimeTextures.top.texture.needsUpdate = true;
    runtimeTextures.bottom.texture.needsUpdate = true;
  }, [runtimeFrame, runtimeTextures]);

  // placeAccessory seats an accessory at a slot anchor. The
  // accessory's own origin sits at its geometric center, but a
  // real cartridge is recessed inside the slot cavity with its
  // back/grip edge flush with the slot opening. The seat
  // offset shifts the accessory along the slot axis (into the
  // console) so its center sits 0.426 deeper than the anchor,
  // and the seat rotation aligns the accessory's +Y (back/grip)
  // with the slot's ejection direction so the contacts face
  // into the console and the label faces the player. The
  // optional travel parameter slides the accessory along the
  // slot axis by the signed offset (positive along the
  // anchor's local +Z), used by the eject/insert animation.
  const placeAccessory = (
    node: THREE.Object3D,
    anchor: THREE.Object3D,
    seatRotation: THREE.Quaternion,
    seatOffset: number,
    travel: number,
    visible: boolean,
  ) => {
    anchor.getWorldPosition(accessoryWorldPosition.current);
    anchor.getWorldQuaternion(accessoryWorldQuaternion.current);
    // Compose the slot's seat rotation (expressed in the
    // anchor's local frame) with the anchor's world quaternion so
    // the accessory inherits the console's world orientation and
    // then rotates into its seated pose.
    accessoryWorldQuaternion.current.copy(seatRotation).premultiply(accessoryWorldQuaternion.current);
    accessoryAxis.current.set(0, 0, 1).applyQuaternion(accessoryWorldQuaternion.current).normalize();
    // The seat offset places the accessory's center 0.426
    // deeper than the slot opening (into the console). The
    // travel slides it along the slot axis; positive travel
    // moves along the anchor's local +Z, so the ejection
    // animation passes a negative travel for Slot-1 (which
    // ejects toward -Z) and a positive travel for Slot-2.
    accessoryWorldPosition.current.addScaledVector(accessoryAxis.current, seatOffset + travel);
    node.position.copy(accessoryWorldPosition.current);
    node.quaternion.copy(accessoryWorldQuaternion.current);
    node.visible = visible;
  };

  useEffect(() => {
    phaseRef.current = phase;
    phaseStartedAt.current = 0;
    alignedSent.current = false;
    openedSent.current = false;

    if (phase === "aligning") {
      const root = deviceRoot.current;
      const controls = controlsRef.current;
      alignmentStart.current = {
        rootRotation: {
          x: root?.rotation.x ?? CANONICAL_ROOT_ROTATION.x,
          y: root?.rotation.y ?? CANONICAL_ROOT_ROTATION.y,
          z: root?.rotation.z ?? CANONICAL_ROOT_ROTATION.z,
        },
        rootY: root?.position.y ?? 0,
        cameraPosition: camera.position.clone(),
        target: controls?.target.clone() ?? CANONICAL_TARGET.clone(),
      };
    } else {
      alignmentStart.current = null;
    }
  }, [camera, controlsRef, phase]);

  useEffect(() => {
    const clip = animations.find((candidate) => candidate.name === "Open");
    if (!clip) {
      onError?.();
      return;
    }

    const mixer = new THREE.AnimationMixer(modelScene);
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    action.paused = false;
    mixer.setTime(0);
    action.paused = true;
    openMixer.current = mixer;
    openAction.current = action;
    const switchNode = modelScene.getObjectByName("power_switch");
    powerSwitch.current = switchNode ?? null;
    base.current = modelScene.getObjectByName("base") ?? null;
    screenTop.current = modelScene.getObjectByName("screen_top") ?? null;
    screenBottom.current = modelScene.getObjectByName("screen_bottom") ?? null;
    slot1Anchor.current = modelScene.getObjectByName("slot1_anchor") ?? null;
    slot2Anchor.current = modelScene.getObjectByName("slot2_anchor") ?? null;
    slot1Cartridge.current = modelScene.getObjectByName("slot1_cartridge") ?? null;
    slot2Cover.current = modelScene.getObjectByName("slot2_cover") ?? null;
    slot1PromptAnchor.current = modelScene.getObjectByName("slot1_prompt_anchor") ?? null;
    slot2PromptAnchor.current = modelScene.getObjectByName("slot2_prompt_anchor") ?? null;
    slot1AnchorRest.current = slot1Anchor.current?.position.clone() ?? null;
    slot2AnchorRest.current = slot2Anchor.current?.position.clone() ?? null;
    // The normalized console GLB keeps only the installed shell details. The
    // full removable objects live in the accessory GLB so they can follow the
    // same scene object from the slot, through the library, and back again.
    ndsAccessory.current = accessoryScene.getObjectByName("nds_cartridge") ?? null;
    gbaAccessory.current = accessoryScene.getObjectByName("gba_cartridge") ?? null;
    if (slot1Cartridge.current) slot1Cartridge.current.visible = false;
    if (slot2Cover.current) slot2Cover.current.visible = false;
    if (ndsAccessory.current) ndsAccessory.current.visible = true;
    if (gbaAccessory.current) gbaAccessory.current.visible = true;
    powerSwitchRestPosition.current = switchNode?.position.clone() ?? null;
    // The source's power indicator shares the named switch group. Give this
    // canvas its own material so the intro stays dark until power-on while
    // the persistent firmware model lights in DS Lite green.
    const indicators: THREE.MeshStandardMaterial[] = [];
    switchNode?.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const cloned = materials.map((material) => material.clone());
      child.material = Array.isArray(child.material) ? cloned : cloned[0];
      for (const material of cloned) {
        if (material instanceof THREE.MeshStandardMaterial) indicators.push(material);
      }
    });
    powerIndicatorMaterials.current = indicators;

    // The source GLB predates the semantic control contract, but its button
    // meshes are stable and spatially named. Keep the mapping here so the
    // authored model remains untouched while presses still depress real mesh
    // groups instead of only tinting a transparent hit target.
    const pressMeshNames: Record<string, string[]> = {
      a: ["button_a", "Cylinder004"],
      b: ["button_b", "Cylinder001"],
      x: ["button_x", "Cylinder003"],
      y: ["button_y", "Cylinder002"],
      "dpad-up": ["button_dpad", "Cube006"],
      "dpad-left": ["button_dpad", "Cube006"],
      "dpad-right": ["button_dpad", "Cube006"],
      "dpad-down": ["button_dpad", "Cube006"],
      // These four meshes are present in the downloaded source but were not
      // previously semanticized. Keep the empty contract anchors as a
      // forward-compatible fallback while making the authored controls
      // clickable in the current model as well.
      l: ["Cube008", "button_l"],
      r: ["Cube009", "button_r"],
      start: ["Cylinder005", "button_start"],
      select: ["Cylinder006", "button_select"],
    };
    const nextPressNodes: Record<string, { node: THREE.Object3D; restY: number }> = {};
    for (const [control, nodeNames] of Object.entries(pressMeshNames)) {
      const node = nodeNames.map((nodeName) => modelScene.getObjectByName(nodeName)).find(Boolean);
      if (node) nextPressNodes[control] = { node, restY: node.position.y };
    }
    buttonPressNodes.current = nextPressNodes;
    buttonPressProgress.current = {};
    meshControlNames.current = {
      button_a: "a",
      button_b: "b",
      button_x: "x",
      button_y: "y",
      button_dpad: "dpad",
      Cylinder004: "a",
      Cylinder001: "b",
      Cylinder003: "x",
      Cylinder002: "y",
      Cube006: "dpad",
      button_l: "l",
      button_r: "r",
      button_start: "start",
      button_select: "select",
      Cube008: "l",
      Cube009: "r",
      Cylinder005: "start",
      Cylinder006: "select",
      power_switch: "power",
    };

    if (!readySent.current) {
      readySent.current = true;
      onModelReady?.();
    }

    return () => {
      action.stop();
      mixer.stopAllAction();
      mixer.uncacheRoot(modelScene);
      openMixer.current = null;
      openAction.current = null;
      powerSwitch.current = null;
      base.current = null;
      screenTop.current = null;
      screenBottom.current = null;
      slot1Anchor.current = null;
      slot2Anchor.current = null;
      slot1Cartridge.current = null;
      slot2Cover.current = null;
      slot1PromptAnchor.current = null;
      slot2PromptAnchor.current = null;
      slot1AnchorRest.current = null;
      slot2AnchorRest.current = null;
      ndsAccessory.current = null;
      gbaAccessory.current = null;
      powerSwitchRestPosition.current = null;
      powerIndicatorMaterials.current = [];
      buttonPressNodes.current = {};
      buttonPressProgress.current = {};
      meshControlNames.current = {};
      meshGesture.current = null;
    };
  }, [accessoryScene, animations, modelScene, onError, onModelReady]);

  useEffect(() => {
    if (!hardwareState) return;
    const activeSlot = hardwareState.activeSlot;
    const insertingSlot = hardwareState.pendingCartridge?.slot ?? null;
    // The old normalized GLB children are only the slot silhouettes. Hide
    // them permanently; the accessory clone below is the one object that is
    // animated and carried into the library.
    if (slot1Cartridge.current) slot1Cartridge.current.visible = false;
    if (slot2Cover.current) slot2Cover.current.visible = false;
    if (ndsAccessory.current) ndsAccessory.current.visible = hardwareState.cartridges.nds !== null
      || (hardwareState.mode === "ejecting" && activeSlot === "nds")
      || (hardwareState.mode === "inserting" && insertingSlot === "nds")
      || (hardwareState.mode === "library" && hardwareState.removedCartridge?.slot === "nds");
    if (gbaAccessory.current) gbaAccessory.current.visible = hardwareState.cartridges.gba !== null
      || (hardwareState.mode === "ejecting" && activeSlot === "gba")
      || (hardwareState.mode === "inserting" && insertingSlot === "gba")
      || (hardwareState.mode === "library" && hardwareState.removedCartridge?.slot === "gba");
  }, [hardwareState]);

  useEffect(() => {
    const mode = hardwareState?.mode ?? null;
    if (previousHardwareMode.current === "library" && mode !== "library") {
      // Capture the actual off-screen position before the closed-pose branch
      // writes its resting transform. Cancel and insert can then return the
      // console without a one-frame teleport back over the library UI.
      libraryReturnPosition.current = deviceRoot.current?.position.clone() ?? null;
    } else if (mode === "library") {
      libraryReturnPosition.current = null;
    }
    previousHardwareMode.current = mode;
  }, [hardwareState?.mode]);

  useEffect(() => {
    hardwareMotionStartedAt.current = 0;
    hardwareCompletionSent.current = null;
    hardwarePoseStart.current = {
      cameraPosition: camera.position.clone(),
      target: controlsRef.current?.target.clone() ?? CANONICAL_TARGET.clone(),
    };
  }, [camera, controlsRef, hardwareState?.motionToken]);

  useEffect(() => {
    setPowerIndicatorState(powerIndicatorMaterials.current, powerIndicatorColor);
  }, [powerIndicatorColor]);

  useEffect(() => {
    const mixer = openMixer.current;
    const action = openAction.current;
    if (!mixer || !action) return;

    action.reset();
    action.play();
    action.paused = false;
    if (phase === "firmware") {
      if (hardwareState?.pose === "closed" || hardwareState?.pose === "opening") mixer.setTime(0);
      else mixer.setTime(OPENING_SECONDS);
    } else if (phase === "power-prompt" || phase === "handoff") {
      mixer.setTime(OPENING_SECONDS);
    } else if (phase === "inspecting" || phase === "aligning" || phase === "opening") {
      mixer.setTime(0);
    }
    action.paused = true;
  }, [hardwareState?.pose, phase]);

  useFrame(({ clock }, delta) => {
    const root = deviceRoot.current;
    const mixer = openMixer.current;
    if (!root || !mixer) return;
    if (!hardwareState) {
      if (ndsAccessory.current) ndsAccessory.current.visible = false;
      if (gbaAccessory.current) gbaAccessory.current.visible = false;
    }
    if (phaseStartedAt.current === 0) phaseStartedAt.current = clock.elapsedTime;
    const elapsed = clock.elapsedTime - phaseStartedAt.current;
    if (hardwareState && hardwareMotionStartedAt.current === 0) hardwareMotionStartedAt.current = clock.elapsedTime;
    const hardwareElapsed = hardwareState ? clock.elapsedTime - hardwareMotionStartedAt.current : 0;

    const showCartridgePrompts = phase === "firmware"
      && hardwareState?.powered === false
      && hardwareState?.pose === "closed"
      && hardwareState.mode === "idle";
    const placePrompt = (
      marker: THREE.Group | null,
      anchor: THREE.Object3D | null,
      position: THREE.Vector3,
      phaseOffset: number,
    ) => {
      if (!marker) return;
      marker.visible = Boolean(showCartridgePrompts && anchor);
      if (!marker.visible || !anchor) return;
      anchor.getWorldPosition(position);
      root.worldToLocal(position);
      marker.position.copy(position);
      const pulse = reducedMotion ? 1 : 1 + Math.sin(clock.elapsedTime * 4.8 + phaseOffset) * 0.18;
      marker.scale.setScalar(pulse);
    };
    placePrompt(slot1Dot.current, slot1PromptAnchor.current, slot1PromptPosition.current, 0);
    placePrompt(slot2Dot.current, slot2PromptAnchor.current, slot2PromptPosition.current, Math.PI * 0.7);
    const projectPrompt = (
      slot: DsCartridgeKind,
      anchor: THREE.Object3D | null,
      projected: THREE.Vector3,
    ) => {
      if (!onCartridgePromptPosition) return;
      let next: PowerSwitchAnchor = { x: 0, y: 0, visible: false };
      if (showCartridgePrompts && anchor) {
        anchor.getWorldPosition(projected);
        projected.project(camera);
        next = {
          x: (projected.x * 0.5 + 0.5) * 100,
          y: (-projected.y * 0.5 + 0.5) * 100,
          visible: projected.z >= -1 && projected.z <= 1,
        };
      }
      const previous = lastCartridgePromptAnchors.current[slot];
      if (!previous || previous.visible !== next.visible || Math.abs(previous.x - next.x) > 0.3 || Math.abs(previous.y - next.y) > 0.3) {
        lastCartridgePromptAnchors.current[slot] = next;
        onCartridgePromptPosition(slot, next);
      }
    };
    projectPrompt("nds", slot1PromptAnchor.current, slot1PromptProjected.current);
    projectPrompt("gba", slot2PromptAnchor.current, slot2PromptProjected.current);

    const resetCartridgeAnchors = () => {
      if (slot1Anchor.current && slot1AnchorRest.current) slot1Anchor.current.position.copy(slot1AnchorRest.current);
      if (slot2Anchor.current && slot2AnchorRest.current) slot2Anchor.current.position.copy(slot2AnchorRest.current);
    };
    resetCartridgeAnchors();
    if (hardwareState && (hardwareState.mode === "ejecting" || hardwareState.mode === "inserting") && hardwareState.activeSlot) {
      const slot = hardwareState.activeSlot;
      const anchor = slot === "nds" ? slot1Anchor.current : slot2Anchor.current;
      const rest = slot === "nds" ? slot1AnchorRest.current : slot2AnchorRest.current;
      const direction = slot === "nds" ? -1 : 1;
      const distance = slot === "nds" ? SLOT1_EJECT_DISTANCE : SLOT2_EJECT_DISTANCE;
      const duration = hardwareState.mode === "ejecting"
        ? slot === "nds" ? SLOT1_EJECT_SECONDS : SLOT2_EJECT_SECONDS
        : slot === "nds" ? SLOT1_INSERT_SECONDS : SLOT2_INSERT_SECONDS;
      const motionElapsed = reducedMotion ? duration : hardwareElapsed;
      const progress = reducedMotion ? 1 : Math.min(1, hardwareElapsed / duration);
      // `travel` is the signed distance the accessory has moved
      // along the slot axis from its seated position (positive
      // along the anchor's local +Z, i.e. toward the ejection
      // direction for Slot-2 and opposite the ejection for Slot-1).
      // The seated offset itself is added by placeAccessory so the
      // accessory stays recessed in the slot at travel = 0.
      let travel = 0;
      if (hardwareState.mode === "ejecting" && slot === "nds") {
        // Authentic DS-card sequence: 90 ms inward push-click, 180 ms
        // spring release, then 320 ms of deliberate full withdrawal.
        if (motionElapsed < 0.09) {
          const push = motionElapsed / 0.09;
          travel = THREE.MathUtils.lerp(0, -direction * 4, push * push * (3 - 2 * push));
        } else if (motionElapsed < 0.27) {
          const release = (motionElapsed - 0.09) / 0.18;
          const eased = 1 - (1 - release) ** 3;
          travel = THREE.MathUtils.lerp(-direction * 4, direction * distance * 0.18, eased);
        } else {
          const release = Math.min(1, (motionElapsed - 0.27) / 0.32);
          const eased = 1 - (1 - release) ** 3;
          travel = THREE.MathUtils.lerp(direction * distance * 0.18, direction * distance, eased);
        }
      } else if (hardwareState.mode === "ejecting") {
        // Slot-2 is a friction-fit GBA Pak: it slides straight out without
        // the DS-card push-click/spring-release gesture.
        const eased = progress * progress * (3 - 2 * progress);
        travel = THREE.MathUtils.lerp(0, direction * distance, eased);
      } else if (slot === "nds") {
        // Reinsertion reverses the same three DS-card phases.
        if (motionElapsed < 0.32) {
          const eased = (motionElapsed / 0.32) ** 2 * (3 - 2 * motionElapsed / 0.32);
          travel = THREE.MathUtils.lerp(direction * distance, direction * distance * 0.18, eased);
        } else if (motionElapsed < 0.5) {
          const phase = (motionElapsed - 0.32) / 0.18;
          const eased = phase * phase * (3 - 2 * phase);
          travel = THREE.MathUtils.lerp(direction * distance * 0.18, -direction * 4, eased);
        } else {
          const phase = Math.min(1, (motionElapsed - 0.5) / 0.09);
          const eased = phase * phase * (3 - 2 * phase);
          travel = THREE.MathUtils.lerp(-direction * 4, 0, eased);
        }
      } else {
        const eased = progress * progress * (3 - 2 * progress);
        travel = THREE.MathUtils.lerp(direction * distance, 0, eased);
      }
      if (anchor && rest) anchor.position.copy(rest);
      const accessory = slot === "nds" ? ndsAccessory.current : gbaAccessory.current;
      const seat = SLOT_SEAT_CONFIG[slot];
      if (accessory && anchor) placeAccessory(accessory, anchor, seat.rotation, seat.offset, travel, true);
      if (progress >= 1 && hardwareCompletionSent.current !== hardwareState.motionToken) {
        hardwareCompletionSent.current = hardwareState.motionToken;
        onHardwareMotionComplete?.(hardwareState.motionToken);
      }
    }

    // Keep the installed accessory in its physical anchor whenever no motion
    // owns it. In library mode the exact same clone is lifted to a camera
    // facing presentation pose; it is never replaced by a poster/card image.
    if (hardwareState && hardwareState.mode !== "ejecting" && hardwareState.mode !== "inserting") {
      if (hardwareState.mode === "library" && hardwareState.activeSlot && hardwareState.removedCartridge) {
        const removed = hardwareState.activeSlot === "nds" ? ndsAccessory.current : gbaAccessory.current;
        const previous = hardwareState.activeSlot === "nds" ? libraryNdsPreviousRef.current : libraryGbaPreviousRef.current;
        const next = hardwareState.activeSlot === "nds" ? libraryNdsNextRef.current : libraryGbaNextRef.current;
        if (removed) {
          libraryAccessoryPosition.current.copy(CANONICAL_TARGET).y += 0.15;
          libraryCameraRight.current.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
          const sway = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 1.15) * 0.06;
          libraryAccessoryPosition.current.addScaledVector(libraryCameraRight.current, sway);
          removed.position.copy(libraryAccessoryPosition.current);
          libraryNeighborQuaternion.current.copy(camera.quaternion);
          if (!reducedMotion) {
            libraryNeighborQuaternion.current.premultiply(new THREE.Quaternion().setFromAxisAngle(camera.up, Math.sin(clock.elapsedTime * 1.15) * THREE.MathUtils.degToRad(8)));
          }
          removed.quaternion.copy(libraryNeighborQuaternion.current);
          removed.visible = true;
        }
        libraryCameraRight.current.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
        libraryNeighborQuaternion.current.copy(camera.quaternion);
        if (previous) {
          libraryNeighborPosition.current.copy(libraryAccessoryPosition.current).addScaledVector(libraryCameraRight.current, -1.25);
          previous.position.copy(libraryNeighborPosition.current);
          previous.quaternion.copy(libraryNeighborQuaternion.current);
          previous.visible = true;
        }
        if (next) {
          libraryNeighborPosition.current.copy(libraryAccessoryPosition.current).addScaledVector(libraryCameraRight.current, 1.25);
          next.position.copy(libraryNeighborPosition.current);
          next.quaternion.copy(libraryNeighborQuaternion.current);
          next.visible = true;
        }
      } else {
        if (ndsAccessory.current && slot1Anchor.current) {
          const seat = SLOT_SEAT_CONFIG.nds;
          placeAccessory(ndsAccessory.current, slot1Anchor.current, seat.rotation, seat.offset, 0, hardwareState.cartridges.nds !== null);
        }
        if (gbaAccessory.current && slot2Anchor.current) {
          const seat = SLOT_SEAT_CONFIG.gba;
          placeAccessory(gbaAccessory.current, slot2Anchor.current, seat.rotation, seat.offset, 0, hardwareState.cartridges.gba !== null);
        }
      }
      if (hardwareState.mode === "library" && hardwareState.activeSlot) {
        // The untouched accessory travels with the console while
        // the removed object is presented in the center of the carousel.
        const other = hardwareState.activeSlot === "nds" ? gbaAccessory.current : ndsAccessory.current;
        const otherAnchor = hardwareState.activeSlot === "nds" ? slot2Anchor.current : slot1Anchor.current;
        const otherInstalled = hardwareState.activeSlot === "nds" ? hardwareState.cartridges.gba !== null : hardwareState.cartridges.nds !== null;
        if (other && otherAnchor) {
          const seat = hardwareState.activeSlot === "nds" ? SLOT_SEAT_CONFIG.gba : SLOT_SEAT_CONFIG.nds;
          placeAccessory(other, otherAnchor, seat.rotation, seat.offset, 0, otherInstalled);
        }
      }
      const activeNeighbors = hardwareState.mode === "library" && hardwareState.activeSlot === "nds"
        ? new Set([libraryNdsPreviousRef.current, libraryNdsNextRef.current])
        : hardwareState.mode === "library" && hardwareState.activeSlot === "gba"
          ? new Set([libraryGbaPreviousRef.current, libraryGbaNextRef.current])
          : new Set<THREE.Object3D>();
      const selectedLibraryCartridges = hardwareState.mode === "library" && hardwareState.activeSlot
        ? cartridgesForKind(hardwareState.activeSlot)
        : [];
      const selectedLibraryIndex = hardwareState.removedCartridge
        ? selectedLibraryCartridges.findIndex((cartridge) => cartridge.id === hardwareState.removedCartridge?.cartridgeId)
        : -1;
      for (const neighbor of [libraryNdsPreviousRef.current, libraryNdsNextRef.current, libraryGbaPreviousRef.current, libraryGbaNextRef.current]) {
        if (!neighbor) continue;
        const isPrevious = neighbor === libraryNdsPreviousRef.current || neighbor === libraryGbaPreviousRef.current;
        const isNext = neighbor === libraryNdsNextRef.current || neighbor === libraryGbaNextRef.current;
        neighbor.visible = activeNeighbors.has(neighbor)
          && (!isPrevious || selectedLibraryIndex > 0)
          && (!isNext || selectedLibraryIndex >= 0 && selectedLibraryIndex < selectedLibraryCartridges.length - 1);
      }
    }

    // Give the physical controls a short, damped travel that follows the
    // pointer/keyboard pressed state. The source button nodes are small,
    // single-mesh groups; moving their local Y position creates the expected
    // click-down depth without changing the authored hinge animation.
    const nodePressDepth = new Map<THREE.Object3D, { restY: number; depth: number }>();
    for (const [control, target] of Object.entries(buttonPressNodes.current)) {
      const current = buttonPressProgress.current[control] ?? 0;
      const desired = pressedControls?.has(control) || pressedControl === control ? 1 : 0;
      const next = THREE.MathUtils.damp(current, desired, 28, delta);
      buttonPressProgress.current[control] = next;
      const previous = nodePressDepth.get(target.node);
      nodePressDepth.set(target.node, {
        restY: target.restY,
        // D-pad directions share one authored cross mesh. The deepest held
        // arm owns the mesh translation so a second simultaneous direction
        // cannot overwrite the first one while its key is still down.
        depth: Math.max(previous?.depth ?? 0, next),
      });
    }
    for (const [node, state] of nodePressDepth) {
      node.position.y = state.restY - state.depth * 2.6;
    }

    if (powerSwitchPulse !== seenPowerSwitchPulse.current) {
      seenPowerSwitchPulse.current = powerSwitchPulse;
      powerSwitchPulseStartedAt.current = clock.elapsedTime;
    }
    const switchNode = powerSwitch.current;
    const switchRestPosition = powerSwitchRestPosition.current;
    if (switchNode && switchRestPosition) {
      const pulseStart = powerSwitchPulseStartedAt.current;
      if (pulseStart === null) {
        switchNode.position.copy(switchRestPosition);
      } else {
        const pulseProgress = Math.min(1, Math.max(0, (clock.elapsedTime - pulseStart) / SWITCH_PULSE_SECONDS));
        const travelProgress = pulseProgress < 0.42
          ? pulseProgress / 0.42
          : 1 - ((pulseProgress - 0.42) / 0.58);
        const easedTravel = Math.sin(Math.max(0, Math.min(1, travelProgress)) * Math.PI / 2);
        switchNode.position.copy(switchRestPosition);
        switchNode.position.y += easedTravel * SWITCH_TRAVEL;
        if (pulseProgress >= 1) powerSwitchPulseStartedAt.current = null;
      }
    }

    if (phase === "inspecting") {
      root.position.y = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 1.2) * 0.075;
      const controls = controlsRef.current;
      if (controls) {
        controls.target.copy(CANONICAL_TARGET);
        controls.update();
      } else {
        camera.lookAt(CANONICAL_TARGET);
      }
      return;
    }

    if (phase === "firmware") {
      const pose = hardwareState?.pose ?? "open";
      const isPoseMotion = pose === "closing" || pose === "opening";
      const poseProgress = isPoseMotion
        ? (reducedMotion ? 1 : Math.min(1, hardwareElapsed / SERVICE_CLOSE_SECONDS))
        : 1;
      const poseEased = poseProgress * poseProgress * (3 - 2 * poseProgress);
      const action = openAction.current;

      if (pose === "closing") {
        root.rotation.set(
          THREE.MathUtils.lerp(CANONICAL_ROOT_ROTATION.x, CLOSED_ROOT_ROTATION.x, poseEased),
          THREE.MathUtils.lerp(CANONICAL_ROOT_ROTATION.y, CLOSED_ROOT_ROTATION.y, poseEased),
          THREE.MathUtils.lerp(CANONICAL_ROOT_ROTATION.z, CLOSED_ROOT_ROTATION.z, poseEased),
        );
        root.position.set(0, THREE.MathUtils.lerp(0, CLOSED_ROOT_POSITION.y, poseEased), 0);
        if (action) action.paused = false;
        mixer.setTime((1 - poseEased) * OPENING_SECONDS);
        if (action) action.paused = true;
      } else if (pose === "opening") {
        root.rotation.set(
          THREE.MathUtils.lerp(CLOSED_ROOT_ROTATION.x, CANONICAL_ROOT_ROTATION.x, poseEased),
          THREE.MathUtils.lerp(CLOSED_ROOT_ROTATION.y, CANONICAL_ROOT_ROTATION.y, poseEased),
          THREE.MathUtils.lerp(CLOSED_ROOT_ROTATION.z, CANONICAL_ROOT_ROTATION.z, poseEased),
        );
        root.position.set(0, THREE.MathUtils.lerp(CLOSED_ROOT_POSITION.y, 0, poseEased), 0);
        if (action) action.paused = false;
        mixer.setTime(poseEased * OPENING_SECONDS);
        if (action) action.paused = true;
      } else if (pose === "closed") {
        root.rotation.set(CLOSED_ROOT_ROTATION.x, CLOSED_ROOT_ROTATION.y, CLOSED_ROOT_ROTATION.z);
        root.position.copy(CLOSED_ROOT_POSITION);
        if (action) action.paused = false;
        mixer.setTime(0);
        if (action) action.paused = true;
      } else {
        root.rotation.set(CANONICAL_ROOT_ROTATION.x, CANONICAL_ROOT_ROTATION.y, CANONICAL_ROOT_ROTATION.z);
        root.position.set(0, 0, 0);
        if (action) action.paused = false;
        mixer.setTime(OPENING_SECONDS);
        if (action) action.paused = true;
      }

      // A library is a service view, not a second console layout. Calculate a
      // camera-space clearance vector from the current model bounds instead
      // of relying on a viewport-specific magic x offset.
      if (hardwareState?.mode === "library") {
        root.updateMatrixWorld(true);
        focusBounds.current.setFromObject(root);
        const clearance = Math.max(focusBounds.current.getSize(new THREE.Vector3()).length(), 1) + 8;
        libraryCameraRight.current.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
        libraryConsoleOffset.current.copy(libraryCameraRight.current).multiplyScalar(clearance);
        root.position.copy(libraryConsoleOffset.current);
      } else {
        libraryConsoleOffset.current.set(0, 0, 0);
        if (libraryReturnPosition.current) {
          if (reducedMotion) {
            root.position.copy(CLOSED_ROOT_POSITION);
            libraryReturnPosition.current = null;
          } else {
            libraryReturnPosition.current.lerp(CLOSED_ROOT_POSITION, 1 - Math.exp(-delta / 0.42));
            root.position.copy(libraryReturnPosition.current);
            if (root.position.distanceToSquared(CLOSED_ROOT_POSITION) < 0.0001) {
              root.position.copy(CLOSED_ROOT_POSITION);
              libraryReturnPosition.current = null;
            }
          }
        }
      }

      if (isPoseMotion && poseProgress >= 1 && hardwareState && hardwareCompletionSent.current !== hardwareState.motionToken) {
        hardwareCompletionSent.current = hardwareState.motionToken;
        onHardwareMotionComplete?.(hardwareState.motionToken);
      }

      // Portrait stages have a narrower perspective frustum. Pull the camera
      // back proportionally so the complete clamshell (including controls)
      // remains in frame instead of cropping its left/right edges.
      const aspect = size.width / Math.max(1, size.height);
      const fit = aspect < 1 ? Math.min(2.8, (1 / aspect) * 1.16) : 1;
      const desiredCamera = firmwareCameraTarget.current
        .copy(FIRMWARE_CAMERA_POSITION)
        .sub(CANONICAL_TARGET)
        .multiplyScalar(fit)
        .add(CANONICAL_TARGET);
      if (screenFocus === "top" && pose !== "closed" && screenTop.current) {
        focusBounds.current.setFromObject(screenTop.current);
        focusBounds.current.getCenter(focusTarget.current);
        focusCamera.current.copy(focusTarget.current).add(REFERENCE_VIEW_DIRECTION.clone().multiplyScalar(TOP_FOCUS_CAMERA_DISTANCE * fit));
      }
      if (pose === "opening") {
        const start = hardwarePoseStart.current;
        if (start) {
          camera.position.lerpVectors(start.cameraPosition, desiredCamera, poseEased);
          hardwareLookTarget.current.lerpVectors(start.target, CANONICAL_TARGET, poseEased);
          camera.lookAt(hardwareLookTarget.current);
        } else {
          camera.position.copy(desiredCamera);
          camera.lookAt(CANONICAL_TARGET);
        }
      } else if (pose !== "closed") {
        if (screenFocus === "top" && screenTop.current) {
          camera.position.lerp(focusCamera.current, 1 - Math.exp(-delta / 0.42));
          camera.lookAt(focusTarget.current);
        } else {
          camera.position.copy(desiredCamera);
          camera.lookAt(CANONICAL_TARGET);
        }
      }
      // OrbitControls is disabled in firmware mode; do not call update here,
      // because it would restore its previous spherical radius and undo the
      // portrait camera-fit distance above.
      // R3F renders after this callback, but the projected DOM anchors are
      // calculated immediately. Refresh the inverse matrix now so the screen
      // overlays use the same head-on camera that just rendered the GLB.
      camera.updateMatrixWorld(true);
      // The mixer and the firmware root both changed this frame. Update the
      // world matrices before deriving DOM screen/control anchors so they
      // match the just-rendered open pose rather than the previous phase.
      root.updateMatrixWorld(true);
      projectHardwareBounds(camera, base.current, "base", lastProjectedBounds, onBasePosition);
      projectHardwareBounds(camera, screenTop.current, "top", lastProjectedBounds, (position) => onScreenPosition?.("top", position));
      projectHardwareBounds(camera, screenBottom.current, "bottom", lastProjectedBounds, (position) => onScreenPosition?.("bottom", position));
      if (onPowerSwitchPosition && switchNode) {
        const projected = projectedPowerSwitch.current;
        switchNode.getWorldPosition(projected);
        projected.project(camera);
        const anchor: PowerSwitchAnchor = {
          x: (projected.x * 0.5 + 0.5) * 100,
          y: (-projected.y * 0.5 + 0.5) * 100,
          visible: projected.z >= -1 && projected.z <= 1,
        };
        const previous = lastPowerSwitchAnchor.current;
        if (!previous || previous.visible !== anchor.visible || Math.abs(previous.x - anchor.x) > 0.35 || Math.abs(previous.y - anchor.y) > 0.35) {
          lastPowerSwitchAnchor.current = anchor;
          onPowerSwitchPosition(anchor);
        }
      }
      return;
    }

    if (phase === "aligning") {
      const progress = reducedMotion ? 1 : Math.min(1, elapsed / ALIGNMENT_SECONDS);
      const eased = 1 - (1 - progress) ** 3;
      const start = alignmentStart.current ?? {
        rootRotation: {
          x: root.rotation.x,
          y: root.rotation.y,
          z: root.rotation.z,
        },
        rootY: root.position.y,
        cameraPosition: camera.position.clone(),
        target: controlsRef.current?.target.clone() ?? CANONICAL_TARGET.clone(),
      };
      root.rotation.set(
        THREE.MathUtils.lerp(start.rootRotation.x, CANONICAL_ROOT_ROTATION.x, eased),
        THREE.MathUtils.lerp(start.rootRotation.y, CANONICAL_ROOT_ROTATION.y, eased),
        THREE.MathUtils.lerp(start.rootRotation.z, CANONICAL_ROOT_ROTATION.z, eased),
      );
      root.position.y = THREE.MathUtils.lerp(start.rootY, 0, eased);
      camera.position.lerpVectors(start.cameraPosition, CANONICAL_CAMERA_POSITION, eased);
      const controls = controlsRef.current;
      if (controls) {
        controls.target.lerpVectors(start.target, CANONICAL_TARGET, eased);
        controls.update();
      } else {
        camera.lookAt(CANONICAL_TARGET);
      }
      if (progress >= 1 && !alignedSent.current) {
        root.rotation.set(CANONICAL_ROOT_ROTATION.x, CANONICAL_ROOT_ROTATION.y, CANONICAL_ROOT_ROTATION.z);
        root.position.y = 0;
        camera.position.copy(CANONICAL_CAMERA_POSITION);
        if (controls) {
          controls.target.copy(CANONICAL_TARGET);
          controls.update();
        } else {
          camera.lookAt(CANONICAL_TARGET);
        }
        alignedSent.current = true;
        onAligned?.();
      }
      return;
    }

    if (phase === "opening") {
      const progress = reducedMotion ? 1 : Math.min(1, elapsed / OPENING_SECONDS);
      const eased = progress * progress * (3 - 2 * progress);
      const action = openAction.current;
      camera.position.copy(CANONICAL_CAMERA_POSITION);
      const controls = controlsRef.current;
      if (controls) {
        controls.target.copy(CANONICAL_TARGET);
        controls.update();
      } else {
        camera.lookAt(CANONICAL_TARGET);
      }
      if (action) action.paused = false;
      mixer.setTime(eased * OPENING_SECONDS);
      if (action) action.paused = true;
      if (progress >= 1 && !openedSent.current) {
        openedSent.current = true;
        onOpenComplete?.();
      }
      return;
    }

    if (phase === "power-prompt" || phase === "handoff") {
      const action = openAction.current;
      if (action) action.paused = false;
      mixer.setTime(OPENING_SECONDS);
      if (action) action.paused = true;
      root.position.y = 0;
    }

    if (onPowerSwitchPosition && switchNode && (phase === "power-prompt" || phase === "handoff")) {
      const projected = projectedPowerSwitch.current;
      switchNode.getWorldPosition(projected);
      projected.project(camera);
      const anchor: PowerSwitchAnchor = {
        x: (projected.x * 0.5 + 0.5) * 100,
        y: (-projected.y * 0.5 + 0.5) * 100,
        visible: projected.z >= -1 && projected.z <= 1,
      };
      const previous = lastPowerSwitchAnchor.current;
      if (!previous || previous.visible !== anchor.visible || Math.abs(previous.x - anchor.x) > 0.35 || Math.abs(previous.y - anchor.y) > 0.35) {
        lastPowerSwitchAnchor.current = anchor;
        onPowerSwitchPosition(anchor);
      }
    }
  });

  const pointerDown = (event: ThreeEvent<PointerEvent>) => {
    const canActivateIntro = phaseRef.current === "inspecting";
    const canCloseFirmware = phaseRef.current === "firmware"
      && hardwareState?.powered === false
      && hardwareState.pose === "open"
      && hardwareState.mode === "idle";
    if (!canActivateIntro && !canCloseFirmware) return;
    event.stopPropagation();
    pointerGesture.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    const target = event.target as unknown as { setPointerCapture?: (pointerId: number) => void } | null;
    target?.setPointerCapture?.(event.pointerId);
  };
  const pointerMove = (event: ThreeEvent<PointerEvent>) => {
    const gesture = pointerGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6) gesture.moved = true;
  };
  const pointerUp = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const gesture = pointerGesture.current;
    pointerGesture.current = null;
    const target = event.target as unknown as { releasePointerCapture?: (pointerId: number) => void } | null;
    target?.releasePointerCapture?.(event.pointerId);
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.moved) return;
    if (phaseRef.current === "inspecting") onActivate?.();
    else if (phaseRef.current === "firmware" && hardwareState?.powered === false && hardwareState.pose === "open") onShellActivate?.();
  };

  const resolveMeshControl = (event: ThreeEvent<PointerEvent>): DsLiteMeshControl | null => {
    let node: THREE.Object3D | null = event.object;
    while (node) {
      const mapped = meshControlNames.current[node.name];
      if (mapped) {
        if (mapped !== "dpad") return mapped;
        // The GLB models the D-pad as one cross-shaped mesh. Its local X/Y
        // coordinates identify the pressed arm while Z is the shell depth.
        const point = node.worldToLocal(event.point.clone());
        if (Math.abs(point.x) > Math.abs(point.y)) return point.x < 0 ? "dpad-left" : "dpad-right";
        return point.y > 0 ? "dpad-up" : "dpad-down";
      }
      if (node === modelScene) break;
      node = node.parent;
    }
    return null;
  };

  const releaseMeshPointer = (event: ThreeEvent<PointerEvent>) => {
    const gesture = meshGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.stopPropagation();
    meshGesture.current = null;
    const target = event.target as unknown as { releasePointerCapture?: (pointerId: number) => void } | null;
    target?.releasePointerCapture?.(event.pointerId);
    if (!gesture.fired) onMeshControlRelease?.(gesture.control, gesture.pointerId);
  };

  const meshPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (phaseRef.current !== "firmware") return;
    const control = resolveMeshControl(event);
    if (!control) return;
    if (control === "power" && !powerInputEnabled) return;
    event.stopPropagation();
    meshGesture.current = {
      pointerId: event.pointerId,
      control,
      startY: event.clientY,
      fired: false,
    };
    const target = event.target as unknown as { setPointerCapture?: (pointerId: number) => void } | null;
    target?.setPointerCapture?.(event.pointerId);
    onMeshControlPress?.(control, event.pointerId);
  };

  const runtimeScreenPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!runtimeFrame || phaseRef.current !== "firmware" || !onRuntimeTouch || event.object.name !== "screen_bottom_surface") return;
    event.stopPropagation();
    const target = event.target as unknown as { setPointerCapture?: (pointerId: number) => void } | null;
    target?.setPointerCapture?.(event.pointerId);
    const uv = event.uv;
    if (uv) onRuntimeTouch(Math.max(0, Math.min(255, uv.x * 256)), Math.max(0, Math.min(191, (1 - uv.y) * 192)), true);
  };

  const runtimeScreenPointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!runtimeFrame || !onRuntimeTouch || event.object.name !== "screen_bottom_surface" || !event.buttons) return;
    const uv = event.uv;
    if (uv) onRuntimeTouch(Math.max(0, Math.min(255, uv.x * 256)), Math.max(0, Math.min(191, (1 - uv.y) * 192)), true);
  };

  const runtimeScreenPointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (!runtimeFrame || !onRuntimeTouch || event.object.name !== "screen_bottom_surface") return;
    event.stopPropagation();
    const target = event.target as unknown as { releasePointerCapture?: (pointerId: number) => void } | null;
    target?.releasePointerCapture?.(event.pointerId);
    const uv = event.uv;
    if (uv) onRuntimeTouch(Math.max(0, Math.min(255, uv.x * 256)), Math.max(0, Math.min(191, (1 - uv.y) * 192)), false);
  };

  const meshPointerMove = (event: ThreeEvent<PointerEvent>) => {
    const gesture = meshGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.control !== "power" || gesture.fired || !powerInputEnabled) return;
    if (gesture.startY - event.clientY < 14) return;
    gesture.fired = true;
    event.stopPropagation();
    onMeshControlRelease?.(gesture.control, gesture.pointerId);
    onMeshPowerFlick?.();
  };

  const meshPointerUp = (event: ThreeEvent<PointerEvent>) => {
    const gesture = meshGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.control === "power" && powerInputEnabled && !gesture.fired && gesture.startY - event.clientY >= 14) {
      gesture.fired = true;
      event.stopPropagation();
      const target = event.target as unknown as { releasePointerCapture?: (pointerId: number) => void } | null;
      target?.releasePointerCapture?.(event.pointerId);
      meshGesture.current = null;
      onMeshControlRelease?.(gesture.control, gesture.pointerId);
      onMeshPowerFlick?.();
      return;
    }
    releaseMeshPointer(event);
  };

  const meshPointerCancel = (event: ThreeEvent<PointerEvent>) => {
    releaseMeshPointer(event);
  };

  const accessoryPointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (!hardwareState) return;
    event.stopPropagation();
    let node: THREE.Object3D | null = event.object;
    let hitAccessoryRoot: THREE.Object3D | null = null;
    while (node) {
      if (node.name === "nds_cartridge" || node.name === "gba_cartridge") hitAccessoryRoot = node;
      node = node.parent;
    }
    if (hardwareState.mode === "library" && hardwareState.activeSlot) {
      const centered = hardwareState.activeSlot === "nds" ? ndsAccessory.current : gbaAccessory.current;
      if (hitAccessoryRoot === centered) onLibraryCartridgeActivate?.(hardwareState.activeSlot);
    }
  };

  return (
    <>
    <group
      ref={deviceRoot}
      name="device_root"
      scale={1.42}
      position={[0, -0.18, 0]}
      rotation={[-0.28, 0.33, -0.03]}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={() => { pointerGesture.current = null; }}
      onLostPointerCapture={() => { pointerGesture.current = null; }}
    >
      <primitive
        object={modelScene}
        onPointerDown={meshPointerDown}
        onPointerMove={meshPointerMove}
        onPointerUp={meshPointerUp}
        onPointerCancel={meshPointerCancel}
        onLostPointerCapture={meshPointerCancel}
        onPointerDownCapture={runtimeScreenPointerDown}
        onPointerMoveCapture={runtimeScreenPointerMove}
        onPointerUpCapture={runtimeScreenPointerUp}
      />
      <CartridgePromptDot ref={slot1Dot} slot="nds" onActivate={onCartridgeActivate} />
      <CartridgePromptDot ref={slot2Dot} slot="gba" onActivate={onCartridgeActivate} />
      <PowerStatusLight color={powerIndicatorColor} />
    </group>
    {phase === "firmware" && <primitive object={accessoryScene} onPointerUp={accessoryPointerUp} />}
    {libraryNdsPrevious && <primitive object={libraryNdsPrevious} />}
    {libraryNdsNext && <primitive object={libraryNdsNext} />}
    {libraryGbaPrevious && <primitive object={libraryGbaPrevious} />}
    {libraryGbaNext && <primitive object={libraryGbaNext} />}
    </>
  );
}

function PowerStatusLight({ color }: { color: DsPowerIndicatorColor }) {
  const appearance = POWER_INDICATOR_APPEARANCE[color];
  return (
    <>
      <mesh position={[1.5, 0.43, -0.8]} renderOrder={2}>
        <sphereGeometry args={[0.03, 16, 12]} />
        <meshStandardMaterial color={appearance.color} emissive={appearance.emissive} emissiveIntensity={appearance.intensity} toneMapped={false} />
      </mesh>
      {color !== "off" && <pointLight position={[1.5, 0.43, -0.74]} color={appearance.color} intensity={0.25} distance={0.7} />}
    </>
  );
}

const CartridgePromptDot = forwardRef<THREE.Group, {
  slot: DsCartridgeKind;
  onActivate?: (slot: DsCartridgeKind) => void;
}>(function CartridgePromptDot({ slot, onActivate }, ref) {
  return (
    <group ref={ref} visible={false} renderOrder={6}>
      <mesh renderOrder={6}>
        <sphereGeometry args={[0.048, 18, 12]} />
        <meshStandardMaterial
          color={slot === "nds" ? "#f4f7f8" : "#f0b84c"}
          emissive={slot === "nds" ? "#c9f4ff" : "#f29d27"}
          emissiveIntensity={2.4}
          toneMapped={false}
          depthTest={false}
        />
      </mesh>
      <pointLight color={slot === "nds" ? "#d4f7ff" : "#f0a33b"} intensity={0.32} distance={0.75} />
      <mesh
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => {
          event.stopPropagation();
          onActivate?.(slot);
        }}
      >
        <sphereGeometry args={[0.22, 12, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
});

function StudioWireSphere() {
  const groupRef = useRef<THREE.Group | null>(null);
  const backdropDirection = useMemo(() => new THREE.Vector3(), []);
  const gridGeometry = useMemo(() => {
    const positions: number[] = [];
    const radius = 1.002;
    const longitudeDivisions = 48;
    const latitudeDivisions = 24;
    const curveSegments = 64;

    const pushPoint = (latitude: number, longitude: number) => {
      const latitudeRadius = Math.cos(latitude) * radius;
      positions.push(
        Math.sin(longitude) * latitudeRadius,
        Math.sin(latitude) * radius,
        Math.cos(longitude) * latitudeRadius,
      );
    };

    // Build explicit curved meridians and latitude rings. A mesh wireframe
    // would expose its triangulation, which is what caused the old diagonal
    // facets instead of the requested square-cell spherical grid.
    for (let longitudeIndex = 0; longitudeIndex < longitudeDivisions; longitudeIndex += 1) {
      const longitude = longitudeIndex / longitudeDivisions * Math.PI * 2;
      for (let segment = 0; segment < curveSegments; segment += 1) {
        pushPoint(-Math.PI / 2 + segment / curveSegments * Math.PI, longitude);
        pushPoint(-Math.PI / 2 + (segment + 1) / curveSegments * Math.PI, longitude);
      }
    }

    for (let latitudeIndex = 1; latitudeIndex < latitudeDivisions; latitudeIndex += 1) {
      const latitude = -Math.PI / 2 + latitudeIndex / latitudeDivisions * Math.PI;
      for (let segment = 0; segment < curveSegments; segment += 1) {
        pushPoint(latitude, segment / curveSegments * Math.PI * 2);
        pushPoint(latitude, (segment + 1) / curveSegments * Math.PI * 2);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
  }, []);

  useEffect(() => () => gridGeometry.dispose(), [gridGeometry]);

  useFrame(({ camera }) => {
    const group = groupRef.current;
    if (!group) return;
    backdropDirection.copy(CANONICAL_TARGET).sub(camera.position).normalize();
    group.position.copy(CANONICAL_TARGET).addScaledVector(backdropDirection, 14);
  });

  return (
    // Keep the real curved backdrop behind the console as the inspection
    // camera orbits, so 360-degree yaw never carries the globe in front of it.
    <group ref={groupRef} position={[0, 0.8, -14]} scale={9} renderOrder={-4}>
      <mesh renderOrder={-4}>
        <sphereGeometry args={[1, 36, 24]} />
        <meshBasicMaterial color="#92989f" transparent opacity={0.025} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineSegments geometry={gridGeometry} renderOrder={-3}>
        <lineBasicMaterial color="#171a1e" transparent opacity={0.18} depthWrite={false} toneMapped={false} />
      </lineSegments>
    </group>
  );
}

function projectHardwareBounds(
  camera: THREE.Camera,
  object: THREE.Object3D | null,
  key: string,
  lastBounds: MutableRefObject<Record<string, ProjectedBounds | null>>,
  onPosition?: (position: ProjectedBounds) => void,
) {
  if (!object || !onPosition) return;
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const points = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ];
  const projected = points.map((point) => point.project(camera));
  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  const minZ = Math.min(...projected.map((point) => point.z));
  const maxZ = Math.max(...projected.map((point) => point.z));
  const anchor: ProjectedBounds = {
    left: (minX * 0.5 + 0.5) * 100,
    top: (-maxY * 0.5 + 0.5) * 100,
    width: Math.max(0, (maxX - minX) * 50),
    height: Math.max(0, (maxY - minY) * 50),
    visible: maxZ >= -1 && minZ <= 1 && maxX >= -1.08 && minX <= 1.08 && maxY >= -1.08 && minY <= 1.08,
  };
  const previous = lastBounds.current[key];
  if (!previous || previous.visible !== anchor.visible || Math.abs(previous.left - anchor.left) > 0.2 || Math.abs(previous.top - anchor.top) > 0.2 || Math.abs(previous.width - anchor.width) > 0.2 || Math.abs(previous.height - anchor.height) > 0.2) {
    lastBounds.current[key] = anchor;
    onPosition(anchor);
  }
}

useGLTF.preload(MODEL_URL);
