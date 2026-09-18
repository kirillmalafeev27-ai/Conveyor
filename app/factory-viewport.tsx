'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  LEVEL_CONFIGS,
  ROUTES,
  ROUTE_ORDER,
  TERMINALS,
  machineCyclePhase,
  machineCycleStrike,
  routeLength,
  routePose,
  type ConveyorRun,
  type ProcessingLane,
  type ProcessingLevelConfig,
  type ProcessingLevelId,
  type ProcessingMachineId,
  type RouteId,
  type TerminalId,
} from '@/lib/conveyor-game';

type RouteMark = {
  group: THREE.Group;
  routeId: RouteId;
  offset: number;
};

type LinearMark = {
  group: THREE.Group;
  baseX: number;
};

type MovingBand = {
  mesh: THREE.Mesh;
  baseX: number;
  baseZ: number;
  normalX: number;
  normalZ: number;
  phase: number;
};

export type WorkpieceProcessState = {
  /** Temperature in °C, matching ProcessingState. */
  temperature?: number;
  /** Physical dimensions, matching ProcessingState's millimetre-like values. */
  thickness?: number;
  width?: number;
  length?: number;
  /** Normalized 0..1 surface damage and completed cut. */
  cracks?: number;
  crackRisk?: number;
  cracked?: boolean;
  cut?: number;
  machineHistory?: ReadonlyArray<string>;
};

type WorkpieceParts = {
  group: THREE.Group;
  body: THREE.Mesh<RoundedBoxGeometry, THREE.MeshStandardMaterial>;
  skin: THREE.Mesh<RoundedBoxGeometry, THREE.MeshStandardMaterial>;
  pressedRibs: THREE.Mesh[];
  crackLines: THREE.Mesh[];
  cutLine: THREE.Mesh;
  heatLight: THREE.PointLight;
};

type PressRig = {
  ram?: THREE.Object3D;
  ramY?: number;
  plate?: THREE.Object3D;
  plateY?: number;
  level: ProcessingLevelId;
  start: number;
  end: number;
  lane: ProcessingLane | 'both';
};

type CoolingEffect = {
  object: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  baseY: number;
  baseScale: THREE.Vector3;
  phase: number;
  steam: boolean;
};

type CutterRig = {
  blade?: THREE.Object3D;
  bladeX?: number;
  carriage?: THREE.Object3D;
  carriageX?: number;
};

type ProcessingZone = {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  level: ProcessingLevelId;
  machineId: ProcessingMachineId;
  start: number;
  end: number;
  lane: ProcessingLane | 'both';
};

type ProcessingMachineVisual = {
  object: THREE.Object3D;
  level: ProcessingLevelId;
  start: number;
  end: number;
  lane: ProcessingLane | 'both';
};

type AnimatedParts = {
  workpiece: WorkpieceParts;
  pressPlate?: THREE.Mesh;
  pressPlateY?: number;
  pressRam?: THREE.Object3D;
  pressRamY?: number;
  sawBlade?: THREE.Object3D;
  sawBladeX?: number;
  pistonRods: Array<{ object: THREE.Object3D; baseY: number; phase: number }>;
  turbineBlades: THREE.Object3D[];
  terminalLights: Partial<Record<TerminalId, THREE.MeshStandardMaterial>>;
  exit?: THREE.Object3D;
  exitLights: THREE.MeshStandardMaterial[];
  routeMarks: RouteMark[];
  routeGroups: Partial<Record<RouteId, THREE.Group>>;
  routeStripes: Partial<Record<RouteId, THREE.MeshStandardMaterial[]>>;
  dangerZones: Record<string, THREE.Mesh>;
  windBands: MovingBand[];
  furnaceGlow: THREE.MeshStandardMaterial[];
  machineGroups: Partial<Record<RouteId, THREE.Group>>;
  linearMarks: LinearMark[];
  productionLine: THREE.Group;
  levelOneMachines: THREE.Group;
  levelMachineGroups: Partial<Record<ProcessingLevelId, THREE.Group>>;
  presses: PressRig[];
  rollerMeshes: Array<{ object: THREE.Object3D; direction: number }>;
  coolingEffects: CoolingEffect[];
  cutters: CutterRig[];
  processingZones: ProcessingZone[];
  processingMachines: ProcessingMachineVisual[];
};

function cloneAsset(
  source: THREE.Object3D,
  name: string,
  position: [number, number, number],
  scale = 1,
) {
  const template = source.getObjectByName(name);
  if (!template) return undefined;
  const clone = template.clone(true);
  clone.position.set(...position);
  clone.rotation.set(0, 0, 0);
  clone.scale.setScalar(scale);
  clone.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.castShadow = true;
    node.receiveShadow = true;
    if (Array.isArray(node.material))
      node.material = node.material.map((material) => material.clone());
    else node.material = node.material.clone();
  });
  return clone;
}

function segmentPose(
  start: readonly [number, number],
  end: readonly [number, number],
  local: number,
) {
  const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
  return {
    x: start[0] + (end[0] - start[0]) * local,
    z: start[1] + (end[1] - start[1]) * local,
    angle,
  };
}

function placeAlongRoute(
  object: THREE.Object3D,
  routeId: RouteId,
  progress: number,
  y: number,
  facingOffset = Math.PI / 2,
  lateral = 0,
) {
  const pose = routePose(routeId, progress);
  const normalX = -Math.sin(pose.angle);
  const normalZ = Math.cos(pose.angle);
  object.position.set(
    pose.x + normalX * lateral,
    y,
    pose.z + normalZ * lateral,
  );
  object.rotation.y = facingOffset - pose.angle;
  return pose;
}

function createDirectionArrow(color: number) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.46,
    metalness: 0.44,
    roughness: 0.32,
  });
  const slat = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.075, 5.35),
    material,
  );
  slat.castShadow = true;
  group.add(slat);
  for (const side of [-1, 1]) {
    const chevron = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.085, 0.32),
      material,
    );
    chevron.position.set(0.45, 0.02, side * 0.73);
    chevron.rotation.y = side * 0.63;
    chevron.castShadow = true;
    group.add(chevron);
  }
  return group;
}

function clamp(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  return THREE.MathUtils.clamp(value ?? fallback, min, max);
}

function smoothstep(from: number, to: number, value: number) {
  if (to <= from) return value >= to ? 1 : 0;
  const normalized = THREE.MathUtils.clamp((value - from) / (to - from), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

const STRAIGHT_LANE_OFFSET = 1.45;
const BRANCH_LANE_OFFSET = 5.2;

function forkAmountAt(config: ProcessingLevelConfig, progress: number) {
  for (const fork of config.forks) {
    const mergeStart = fork.mergeAt - 3;
    const mergeEnd = fork.mergeAt + 2;
    if (progress < fork.decisionStart || progress > mergeEnd) continue;
    if (progress < fork.commitAt)
      return smoothstep(fork.decisionStart, fork.commitAt, progress);
    if (progress <= mergeStart) return 1;
    return 1 - smoothstep(mergeStart, mergeEnd, progress);
  }
  return 0;
}

function processingLaneOffset(
  config: ProcessingLevelConfig,
  progress: number,
  lane: ProcessingLane,
) {
  const direction = lane === 'upper' ? -1 : 1;
  const forkAmount = forkAmountAt(config, progress);
  return (
    direction *
    (STRAIGHT_LANE_OFFSET +
      (BRANCH_LANE_OFFSET - STRAIGHT_LANE_OFFSET) * forkAmount)
  );
}

function addForkGeometry(parent: THREE.Group, config: ProcessingLevelConfig) {
  const wingMaterial = new THREE.MeshStandardMaterial({
    color: 0x293f44,
    metalness: 0.74,
    roughness: 0.43,
  });
  const splitMaterial = new THREE.MeshStandardMaterial({
    color: 0x090e10,
    metalness: 0.35,
    roughness: 0.72,
  });
  const guideMaterials = [0xf0ad38, 0x61dbeb].map(
    (color) =>
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.5,
        metalness: 0.42,
        roughness: 0.32,
      }),
  );

  for (const fork of config.forks) {
    const from = fork.decisionStart;
    const to = fork.mergeAt + 2;
    const sliceLength = 1.2;
    for (let x = from + sliceLength / 2; x < to; x += sliceLength) {
      const amount = forkAmountAt(config, x);
      if (amount < 0.015) continue;
      const wingWidth = 4.4 * amount;
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(
          new THREE.BoxGeometry(sliceLength + 0.08, 0.1, wingWidth + 0.06),
          wingMaterial,
        );
        wing.position.set(x, 0.46, side * (3.4 + wingWidth / 2));
        wing.receiveShadow = true;
        parent.add(wing);

        const guide = new THREE.Mesh(
          new THREE.BoxGeometry(sliceLength * 0.72, 0.07, 0.15),
          guideMaterials[side < 0 ? 0 : 1],
        );
        guide.position.set(x, 0.57, side * BRANCH_LANE_OFFSET * amount);
        parent.add(guide);
      }
      const splitter = new THREE.Mesh(
        new THREE.BoxGeometry(
          sliceLength + 0.1,
          0.08,
          0.38 * Math.min(1, amount + 0.15),
        ),
        splitMaterial,
      );
      splitter.position.set(x, 0.57, 0);
      parent.add(splitter);
    }
  }
}

function createWorkpiece(): WorkpieceParts {
  const group = new THREE.Group();
  group.name = 'PLAYER_WORKPIECE';

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x82949a,
    metalness: 0.9,
    roughness: 0.24,
  });
  const body = new THREE.Mesh(
    new RoundedBoxGeometry(1, 1, 1, 5, 0.09),
    bodyMaterial,
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const skinMaterial = new THREE.MeshStandardMaterial({
    color: 0xa8b8bc,
    metalness: 0.84,
    roughness: 0.17,
    transparent: true,
    opacity: 0.48,
  });
  const skin = new THREE.Mesh(
    new RoundedBoxGeometry(1.02, 1.02, 1.02, 4, 0.08),
    skinMaterial,
  );
  skin.castShadow = true;
  group.add(skin);

  const ribMaterial = new THREE.MeshStandardMaterial({
    color: 0xcbd9dc,
    metalness: 0.94,
    roughness: 0.16,
  });
  const pressedRibs: THREE.Mesh[] = [];
  for (const x of [-0.62, 0, 0.62]) {
    const rib = new THREE.Mesh(
      new RoundedBoxGeometry(0.22, 0.11, 1.55, 3, 0.045),
      ribMaterial,
    );
    rib.position.x = x;
    rib.castShadow = true;
    group.add(rib);
    pressedRibs.push(rib);
  }

  const crackMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a2021,
    metalness: 0.2,
    roughness: 0.88,
  });
  const crackLines: THREE.Mesh[] = [];
  for (let index = 0; index < 3; index += 1) {
    const crack = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.025, 0.045),
      crackMaterial,
    );
    crack.rotation.y = (index - 1) * 0.38;
    crack.position.set(-0.62 + index * 0.5, 0.56, -0.34 + index * 0.31);
    group.add(crack);
    crackLines.push(crack);
  }

  const cutLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.075, 1.82),
    new THREE.MeshStandardMaterial({
      color: 0x152326,
      emissive: 0x47e6d1,
      emissiveIntensity: 0.55,
      metalness: 0.5,
      roughness: 0.3,
    }),
  );
  group.add(cutLine);

  const heatLight = new THREE.PointLight(0xff6a24, 0, 6, 2);
  heatLight.position.y = 1.1;
  group.add(heatLight);

  return { group, body, skin, pressedRibs, crackLines, cutLine, heatLight };
}

function addRouteZone(
  parent: THREE.Object3D,
  parts: AnimatedParts,
  id: string,
  routeId: RouteId,
  from: number,
  to: number,
  color: number,
) {
  const length = routeLength(routeId) * (to - from);
  const pose = routePose(routeId, (from + to) / 2);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const zone = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.055, 6.12),
    material,
  );
  zone.position.set(pose.x, 0.5, pose.z);
  zone.rotation.y = -pose.angle;
  parts.dangerZones[id] = zone;
  parent.add(zone);
}

const PROCESSING_ZONE_COLORS: Record<ProcessingMachineId, number> = {
  furnace: 0xff7626,
  press: 0xff453d,
  rollers: 0xf0ad38,
  cooling: 0x55d8ff,
  cutter: 0xff4f87,
};

function addProcessingZone(
  parent: THREE.Object3D,
  parts: AnimatedParts,
  level: ProcessingLevelId,
  config: ProcessingLevelConfig,
  machineId: ProcessingMachineId,
  start: number,
  end: number,
  lane: ProcessingLane | 'both',
) {
  const center = (start + end) / 2;
  const z = lane === 'both' ? 0 : processingLaneOffset(config, center, lane);
  const material = new THREE.MeshBasicMaterial({
    color: PROCESSING_ZONE_COLORS[machineId],
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  const zone = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(2, end - start), 0.06, 6.12),
    material,
  );
  zone.position.set(center, 0.535, z);
  parent.add(zone);
  parts.processingZones.push({
    mesh: zone,
    level,
    machineId,
    start,
    end,
    lane,
  });
}

export function FactoryViewport({
  runRef,
  processState,
}: {
  runRef: { current: ConveyorRun };
  processState?: WorkpieceProcessState;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const processStateRef = useRef(processState);

  useEffect(() => {
    processStateRef.current = processState;
  }, [processState]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x071113);
    scene.fog = new THREE.Fog(0x071113, 36, 82);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.48;
    host.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 120);
    const startPose = routePose(
      runRef.current.routeId,
      runRef.current.routeProgress,
    );
    camera.position.set(startPose.x - 8, 24.5, startPose.z + 4.6);
    camera.lookAt(startPose.x + 7.2, 0.8, startPose.z);

    scene.add(new THREE.HemisphereLight(0xd9fffa, 0x071011, 3.2));
    const key = new THREE.DirectionalLight(0xecfffc, 5.2);
    key.position.set(-7, 24, -10);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -18;
    key.shadow.camera.right = 18;
    key.shadow.camera.top = 18;
    key.shadow.camera.bottom = -18;
    scene.add(key);

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(180, 0.6, 38),
      new THREE.MeshStandardMaterial({
        color: 0x102225,
        metalness: 0.65,
        roughness: 0.58,
      }),
    );
    floor.position.set(82, -0.62, 6);
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(180, 180, 0x2b6c68, 0x1b3e40);
    grid.position.set(82, -0.3, 6);
    const gridMaterials = Array.isArray(grid.material)
      ? grid.material
      : [grid.material];
    for (const material of gridMaterials) {
      material.transparent = true;
      material.opacity = 0.36;
    }
    scene.add(grid);

    const productionLine = new THREE.Group();
    productionLine.name = 'SCALAR_PRODUCTION_LINE';
    scene.add(productionLine);
    const levelOneMachines = new THREE.Group();
    levelOneMachines.name = 'LEVEL_1_MACHINES';
    scene.add(levelOneMachines);
    const levelMachineGroups: Partial<Record<ProcessingLevelId, THREE.Group>> =
      { 1: levelOneMachines };
    for (const levelId of [2, 3, 4, 5] as const) {
      const levelGroup = new THREE.Group();
      levelGroup.name = `LEVEL_${levelId}_MACHINES`;
      levelGroup.visible = false;
      addForkGeometry(levelGroup, LEVEL_CONFIGS[levelId]);
      levelMachineGroups[levelId] = levelGroup;
      scene.add(levelGroup);
    }

    const parts: AnimatedParts = {
      pistonRods: [],
      turbineBlades: [],
      terminalLights: {},
      exitLights: [],
      workpiece: createWorkpiece(),
      routeMarks: [],
      routeGroups: {},
      routeStripes: {},
      dangerZones: {},
      windBands: [],
      furnaceGlow: [],
      machineGroups: {},
      linearMarks: [],
      productionLine,
      levelOneMachines,
      levelMachineGroups,
      presses: [],
      rollerMeshes: [],
      coolingEffects: [],
      cutters: [],
      processingZones: [],
      processingMachines: [],
    };
    scene.add(parts.workpiece.group);
    const beltMaterial = new THREE.MeshStandardMaterial({
      color: 0x1d3034,
      metalness: 0.78,
      roughness: 0.34,
    });
    const railMaterial = new THREE.MeshStandardMaterial({
      color: 0xe0aa30,
      metalness: 0.68,
      roughness: 0.3,
    });

    for (const routeId of ROUTE_ORDER) {
      const route = ROUTES[routeId];
      const group = new THREE.Group();
      group.name = `ROUTE_${routeId}`;
      parts.routeGroups[routeId] = group;
      parts.routeStripes[routeId] = [];
      scene.add(group);

      const machineGroup = new THREE.Group();
      machineGroup.name = `MACHINES_${routeId}`;
      parts.machineGroups[routeId] = machineGroup;
      scene.add(machineGroup);

      for (let index = 1; index < route.points.length; index += 1) {
        const start = route.points[index - 1];
        const end = route.points[index];
        const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
        const pose = segmentPose(start, end, 0.5);
        const belt = new THREE.Mesh(
          new THREE.BoxGeometry(length + 0.28, 0.58, 6.8),
          beltMaterial.clone(),
        );
        belt.position.set(pose.x, 0.08, pose.z);
        belt.rotation.y = -pose.angle;
        belt.receiveShadow = true;
        group.add(belt);

        const inset = new THREE.Mesh(
          new THREE.BoxGeometry(length + 0.12, 0.075, 6.12),
          new THREE.MeshStandardMaterial({
            color: 0x31484d,
            metalness: 0.74,
            roughness: 0.46,
          }),
        );
        inset.position.set(pose.x, 0.405, pose.z);
        inset.rotation.y = -pose.angle;
        inset.receiveShadow = true;
        group.add(inset);

        const stripeMaterial = new THREE.MeshStandardMaterial({
          color: route.color,
          emissive: route.color,
          emissiveIntensity: 0.28,
          metalness: 0.18,
          roughness: 0.38,
        });
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(length + 0.08, 0.04, 0.14),
          stripeMaterial,
        );
        stripe.position.set(pose.x, 0.47, pose.z);
        stripe.rotation.y = -pose.angle;
        group.add(stripe);
        parts.routeStripes[routeId]?.push(stripeMaterial);

        const normalX = -Math.sin(pose.angle);
        const normalZ = Math.cos(pose.angle);
        for (const side of [-1, 1]) {
          // Leave generous breathing room at bends, forks and terminal decks.
          // Continuous rails made the readable route look like a knot of tracks.
          const railLength = Math.max(0.6, length - 1.1);
          const rail = new THREE.Mesh(
            new THREE.BoxGeometry(railLength, 0.22, 0.16),
            railMaterial.clone(),
          );
          rail.position.set(
            pose.x + normalX * side * 3.28,
            0.55,
            pose.z + normalZ * side * 3.28,
          );
          rail.rotation.y = -pose.angle;
          group.add(rail);
        }
      }

      const length = routeLength(routeId);
      const arrowCount = Math.max(2, Math.floor(length / 3.6));
      for (let index = 0; index < arrowCount; index += 1) {
        const offset = ((index + 0.5) / arrowCount) * length;
        const arrow = createDirectionArrow(route.color);
        const pose = routePose(routeId, offset / length);
        arrow.position.set(pose.x, 0.49, pose.z);
        arrow.rotation.y = -pose.angle;
        group.add(arrow);
        parts.routeMarks.push({ group: arrow, routeId, offset });
      }
    }

    // The processing campaign uses a scalar factory coordinate. Render it as
    // one unbroken, full-width production belt; the legacy route graph remains
    // in memory only for compatibility and is never shown.
    const scalarLineLength = 164;
    const scalarBelt = new THREE.Mesh(
      new THREE.BoxGeometry(scalarLineLength, 0.62, 6.8),
      beltMaterial.clone(),
    );
    scalarBelt.position.set(scalarLineLength / 2, 0.08, 0);
    scalarBelt.receiveShadow = true;
    productionLine.add(scalarBelt);
    const scalarInset = new THREE.Mesh(
      new THREE.BoxGeometry(scalarLineLength - 0.3, 0.08, 6.12),
      new THREE.MeshStandardMaterial({
        color: 0x31484d,
        metalness: 0.76,
        roughness: 0.44,
      }),
    );
    scalarInset.position.set(scalarLineLength / 2, 0.43, 0);
    scalarInset.receiveShadow = true;
    productionLine.add(scalarInset);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(scalarLineLength, 0.055, 0.17),
        railMaterial.clone(),
      );
      rail.position.set(scalarLineLength / 2, 0.52, side * 3.28);
      rail.castShadow = true;
      productionLine.add(rail);
    }
    for (let x = 1.8; x < scalarLineLength; x += 3.45) {
      const mark = createDirectionArrow(0x50e8d2);
      mark.position.set(x, 0.53, 0);
      productionLine.add(mark);
      parts.linearMarks.push({ group: mark, baseX: x });
    }

    for (const levelId of [1, 2, 3, 4, 5] as const) {
      const config = LEVEL_CONFIGS[levelId];
      const levelGroup = levelMachineGroups[levelId]!;
      for (const machineSection of config.sections) {
        if (machineSection.kind !== 'machine' || !machineSection.machineId)
          continue;
        const lane = machineSection.lane ?? 'both';
        addProcessingZone(
          levelGroup,
          parts,
          levelId,
          config,
          machineSection.machineId,
          machineSection.start,
          machineSection.end,
          lane,
        );
        if (machineSection.machineId !== 'press') continue;
        const center = (machineSection.start + machineSection.end) / 2;
        const warningZ =
          lane === 'both' ? 0 : processingLaneOffset(config, center, lane);
        const stripeCount = Math.max(
          6,
          Math.floor(machineSection.end - machineSection.start),
        );
        for (let index = 0; index < stripeCount; index += 1) {
          const x =
            machineSection.start +
            0.55 +
            (index / Math.max(1, stripeCount - 1)) *
              (machineSection.end - machineSection.start - 1.1);
          for (const side of [-1, 1]) {
            const warning = new THREE.Mesh(
              new THREE.BoxGeometry(0.7, 0.075, 0.62),
              new THREE.MeshStandardMaterial({
                color: index % 2 === 0 ? 0xffcc3f : 0x171d1e,
                emissive: index % 2 === 0 ? 0xa63b12 : 0x000000,
                emissiveIntensity: 0.34,
                metalness: 0.42,
                roughness: 0.42,
              }),
            );
            warning.position.set(x, 0.58, warningZ + side * 2.72);
            warning.rotation.y = 0.32;
            levelGroup.add(warning);
          }
        }
      }
    }

    addRouteZone(
      parts.machineGroups['fork1-b-turbine']!,
      parts,
      'turbine',
      'fork1-b-turbine',
      0.2,
      0.84,
      0x55d8ff,
    );
    addRouteZone(
      parts.machineGroups['fork2-saw']!,
      parts,
      'saw',
      'fork2-saw',
      0.28,
      0.76,
      0xff5046,
    );
    addRouteZone(
      parts.machineGroups['fork2-piston']!,
      parts,
      'piston',
      'fork2-piston',
      0.27,
      0.78,
      0xffbd3e,
    );

    for (let index = 0; index < 8; index += 1) {
      const pose = routePose('entry-press', 0.65 + index * 0.034);
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.06, 3.9),
        new THREE.MeshBasicMaterial({
          color: index % 2 === 0 ? 0xff5046 : 0xffd55c,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
        }),
      );
      stripe.position.set(pose.x, 0.53, pose.z);
      parts.machineGroups['entry-press']!.add(stripe);
    }

    for (let index = 0; index < 12; index += 1) {
      const progress = 0.23 + index * 0.05;
      const pose = routePose('fork1-b-turbine', progress);
      const normalX = -Math.sin(pose.angle);
      const normalZ = Math.cos(pose.angle);
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.08, 3.7),
        new THREE.MeshBasicMaterial({
          color: 0x75e6ff,
          transparent: true,
          opacity: 0.34,
          depthWrite: false,
        }),
      );
      band.position.set(pose.x, 1.05 + (index % 3) * 0.23, pose.z);
      band.rotation.y = -pose.angle;
      parts.machineGroups['fork1-b-turbine']!.add(band);
      parts.windBands.push({
        mesh: band,
        baseX: pose.x,
        baseZ: pose.z,
        normalX,
        normalZ,
        phase: index / 12,
      });
    }

    for (const routeId of ['fork2-saw', 'fork2-piston'] as const) {
      for (const side of [-1, 1]) {
        const pose = routePose(routeId, 0.53);
        const line = new THREE.Mesh(
          new THREE.BoxGeometry(routeLength(routeId) * 0.48, 0.045, 0.08),
          new THREE.MeshBasicMaterial({
            color: routeId === 'fork2-saw' ? 0xff8b82 : 0x78efab,
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
          }),
        );
        line.position.set(pose.x, 0.79, pose.z + side * 0.78);
        parts.machineGroups[routeId]!.add(line);
      }
    }

    const terminalColors: Record<TerminalId, number> = {
      A: 0xf0ad38,
      B: 0xaf91ff,
      C: 0x55d994,
    };
    for (const terminal of TERMINALS) {
      const color = terminalColors[terminal.id];
      const dock = new THREE.Mesh(
        new THREE.BoxGeometry(7.4, 0.56, 6.2),
        new THREE.MeshStandardMaterial({
          color: 0x1f363a,
          emissive: color,
          emissiveIntensity: 0.2,
          metalness: 0.58,
          roughness: 0.42,
        }),
      );
      dock.position.set(terminal.x, 0.14, terminal.z);
      dock.receiveShadow = true;
      parts.machineGroups[terminal.routeIds[0]]?.add(dock);
    }

    let disposed = false;
    const loader = new GLTFLoader();
    loader.load('/models/conveyor_factory_kit.glb', (gltf) => {
      if (disposed) return;
      const source = gltf.scene;

      const furnace = cloneAsset(
        source,
        'ASSET_Processing_Furnace_Tunnel',
        [0, 0, 0],
        0.96,
      );
      if (furnace) {
        furnace.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          const materials = Array.isArray(node.material)
            ? node.material
            : [node.material];
          for (const material of materials) {
            if (!(material instanceof THREE.MeshStandardMaterial)) continue;
            if (node.name.includes('Heat') || node.name.includes('Flame')) {
              material.emissive.setHex(0xff5a18);
              material.emissiveIntensity = 3.2;
              parts.furnaceGlow.push(material);
            } else if (
              node.name.includes('Shell') ||
              node.name.includes('Roof')
            ) {
              material.color.setHex(0x3e2522);
              material.metalness = 0.8;
              if (node.name.includes('Roof')) {
                material.transparent = true;
                material.opacity = 0.58;
                material.depthWrite = false;
              }
            }
          }
        });
        furnace.position.set(20.5, 0.47, 0);
        furnace.rotation.y = Math.PI / 2;
        levelOneMachines.add(furnace);

        for (const x of [17.5, 23.5]) {
          const glow = new THREE.PointLight(0xff5b19, 22, 14, 2);
          glow.position.set(x, 2.2, 0);
          levelOneMachines.add(glow);
        }
      }

      const press = cloneAsset(
        source,
        'ASSET_Processing_Line_Press',
        [0, 0, 0],
        1.06,
      );
      if (press) {
        press.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          const materials = Array.isArray(node.material)
            ? node.material
            : [node.material];
          for (const material of materials) {
            if (!(material instanceof THREE.MeshStandardMaterial)) continue;
            if (node.name.includes('Platen') || node.name.includes('Guard')) {
              material.color.setHex(0xe3a724);
              material.emissive.setHex(0xff502c);
              material.emissiveIntensity = 0.28;
            } else if (
              node.name.includes('Crown') ||
              node.name.includes('Column')
            ) {
              material.color.setHex(0x16363c);
              material.metalness = 0.88;
              if (node.name.includes('Crown')) {
                material.transparent = true;
                material.opacity = 0.68;
                material.depthWrite = false;
              }
            }
          }
        });
        press.position.set(42, 0.46, 0);
        press.rotation.y = Math.PI / 2;
        parts.pressRam = press.getObjectByName('Press_Main_Ram') ?? undefined;
        parts.pressRamY = parts.pressRam?.position.y;
        parts.pressPlate = press.getObjectByName('Press_Main_Platen') as
          | THREE.Mesh
          | undefined;
        parts.pressPlateY = parts.pressPlate?.position.y;
        parts.presses.push({
          ram: parts.pressRam,
          ramY: parts.pressRamY,
          plate: parts.pressPlate,
          plateY: parts.pressPlateY,
          level: 1,
          start: 35,
          end: 49,
          lane: 'both',
        });
        levelOneMachines.add(press);
      }

      const assetNames: Record<ProcessingMachineId, string> = {
        furnace: 'ASSET_Processing_Furnace_Tunnel',
        press: 'ASSET_Processing_Line_Press',
        rollers: 'ASSET_Shaping_Rollers',
        cooling: 'ASSET_Cooling_Arch',
        cutter: 'ASSET_Processing_Transverse_Cutter',
      };
      const assetScales: Record<ProcessingMachineId, number> = {
        furnace: 0.96,
        press: 1.06,
        rollers: 1,
        cooling: 1,
        cutter: 1.16,
      };
      let coolingPhase = 0;
      for (const levelId of [2, 3, 4, 5] as const) {
        const config = LEVEL_CONFIGS[levelId];
        const levelGroup = levelMachineGroups[levelId]!;
        for (const machineSection of config.sections) {
          if (machineSection.kind !== 'machine' || !machineSection.machineId)
            continue;
          const machineId = machineSection.machineId;
          const center = (machineSection.start + machineSection.end) / 2;
          const lane = machineSection.lane ?? 'both';
          const machineZ =
            lane === 'both' ? 0 : processingLaneOffset(config, center, lane);
          const machine = cloneAsset(
            source,
            assetNames[machineId],
            [center, 0.46, machineZ],
            assetScales[machineId],
          );
          if (!machine) continue;
          machine.rotation.y = Math.PI / 2;

          machine.traverse((node) => {
            if (!(node instanceof THREE.Mesh)) return;
            const materials = Array.isArray(node.material)
              ? node.material
              : [node.material];
            for (const material of materials) {
              if (!(material instanceof THREE.MeshStandardMaterial)) continue;
              if (
                machineId === 'furnace' &&
                (node.name.includes('Heat') || node.name.includes('Flame'))
              ) {
                material.emissive.setHex(0xff5a18);
                material.emissiveIntensity = 3.2;
                parts.furnaceGlow.push(material);
              }
              if (
                machineId === 'furnace' &&
                (node.name.includes('Shell') || node.name.includes('Roof'))
              ) {
                material.color.setHex(0x3e2522);
                material.metalness = 0.8;
                if (node.name.includes('Roof')) {
                  material.transparent = true;
                  material.opacity = 0.58;
                  material.depthWrite = false;
                }
              }
              if (
                machineId === 'press' &&
                (node.name.includes('Platen') || node.name.includes('Guard'))
              ) {
                material.color.setHex(0xe3a724);
                material.emissive.setHex(0xff502c);
                material.emissiveIntensity = 0.28;
              }
              if (machineId === 'press' && node.name.includes('Crown')) {
                material.transparent = true;
                material.opacity = 0.68;
                material.depthWrite = false;
              }
              if (machineId === 'rollers' && node.name.includes('Crossbeam')) {
                material.transparent = true;
                material.opacity = 0.38;
                material.depthWrite = false;
              }
              if (
                machineId === 'cooling' &&
                (node.name.includes('Water') || node.name.includes('Steam'))
              ) {
                material.transparent = true;
                material.depthWrite = false;
                material.opacity = node.name.includes('Steam') ? 0.4 : 0.72;
                parts.coolingEffects.push({
                  object: node,
                  material,
                  baseY: node.position.y,
                  baseScale: node.scale.clone(),
                  phase: coolingPhase,
                  steam: node.name.includes('Steam'),
                });
                coolingPhase += 0.17;
              }
            }
            if (
              machineId === 'rollers' &&
              (node.name.includes('Roller_Upper') ||
                node.name.includes('Roller_Lower'))
            ) {
              parts.rollerMeshes.push({
                object: node,
                direction: node.name.includes('Upper') ? -1 : 1,
              });
            }
          });

          if (machineId === 'press') {
            const ram = machine.getObjectByName('Press_Main_Ram');
            const plate = machine.getObjectByName('Press_Main_Platen');
            parts.presses.push({
              ram,
              ramY: ram?.position.y,
              plate,
              plateY: plate?.position.y,
              level: levelId,
              start: machineSection.start,
              end: machineSection.end,
              lane,
            });
          }
          if (machineId === 'cutter') {
            const blade = machine.getObjectByName('Cutter_Blade');
            const carriage = machine.getObjectByName('Cutter_Carriage');
            parts.cutters.push({
              blade,
              bladeX: blade?.position.x,
              carriage,
              carriageX: carriage?.position.x,
            });
          }
          if (machineId === 'furnace') {
            for (const offset of [-3, 3]) {
              const glow = new THREE.PointLight(0xff5b19, 22, 14, 2);
              glow.position.set(offset, 2.2, 0);
              machine.add(glow);
            }
          }
          levelGroup.add(machine);
          parts.processingMachines.push({
            object: machine,
            level: levelId,
            start: machineSection.start,
            end: machineSection.end,
            lane,
          });
        }
      }

      const turbine = cloneAsset(
        source,
        'ASSET_Ventilation_Turbine',
        [0, 0, 0],
        1.52,
      );
      if (turbine) {
        placeAlongRoute(turbine, 'fork1-b-turbine', 0.52, 0, Math.PI / 2, 3.25);
        turbine.traverse((node) => {
          if (node.name.startsWith('Turbine_Blade_'))
            parts.turbineBlades.push(node);
        });
        parts.machineGroups['fork1-b-turbine']!.add(turbine);
      }

      const saw = cloneAsset(source, 'ASSET_Transverse_Saw', [0, 0, 0], 1.32);
      if (saw) {
        placeAlongRoute(saw, 'fork2-saw', 0.52, -0.06);
        parts.sawBlade = saw.getObjectByName('Saw_Blade') ?? undefined;
        parts.sawBladeX = parts.sawBlade?.position.x;
        parts.machineGroups['fork2-saw']!.add(saw);
      }

      for (const [index, progress] of [0.4, 0.66].entries()) {
        const piston = cloneAsset(
          source,
          'ASSET_Industrial_Piston',
          [0, 0, 0],
          1.08,
        );
        if (!piston) continue;
        const side = index === 0 ? 1 : -1;
        placeAlongRoute(
          piston,
          'fork2-piston',
          progress,
          0.24,
          index === 0 ? 0 : Math.PI,
          side * 3.1,
        );
        const rod = piston.getObjectByName('Piston_Rod');
        if (rod)
          parts.pistonRods.push({
            object: rod,
            baseY: rod.position.y,
            phase: index * 0.5,
          });
        parts.machineGroups['fork2-piston']!.add(piston);
      }

      for (const terminal of TERMINALS) {
        const approach = terminal.routeIds[0];
        const pose = routePose(approach, 0.98);
        const normalX = -Math.sin(pose.angle);
        const normalZ = Math.cos(pose.angle);
        const terminalAsset = cloneAsset(
          source,
          'ASSET_Control_Terminal',
          [terminal.x + normalX * 1.45, 0.12, terminal.z + normalZ * 1.45],
          1.72,
        );
        if (!terminalAsset) continue;
        terminalAsset.rotation.y = Math.PI - pose.angle;
        const screen = terminalAsset.getObjectByName('Terminal_Screen');
        if (screen instanceof THREE.Mesh) {
          const material = new THREE.MeshStandardMaterial({
            color: 0x0d292a,
            emissive: terminalColors[terminal.id],
            emissiveIntensity: 2.4,
          });
          screen.material = material;
          parts.terminalLights[terminal.id] = material;
        }
        parts.machineGroups[approach]?.add(terminalAsset);
      }

      parts.exit = cloneAsset(source, 'ASSET_Exit_Gate', [60, 0.52, 0], 1.72);
      if (parts.exit) {
        parts.exit.rotation.y = Math.PI / 2;
        parts.exit.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          const materials = Array.isArray(node.material)
            ? node.material
            : [node.material];
          for (const material of materials) {
            if (material instanceof THREE.MeshStandardMaterial)
              parts.exitLights.push(material);
          }
        });
        productionLine.add(parts.exit);
      }
    });

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    for (const routeId of ROUTE_ORDER) {
      if (parts.routeGroups[routeId])
        parts.routeGroups[routeId]!.visible = false;
      if (parts.machineGroups[routeId])
        parts.machineGroups[routeId]!.visible = false;
    }

    let frame = 0;
    const clock = new THREE.Clock();
    const passageByMachine = new Map<ProcessingMachineId, number>();
    const cameraTarget = new THREE.Vector3(startPose.x + 7.2, 0.9, startPose.z);
    const desiredCamera = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();
    const coldSteel = new THREE.Color(0x82949a);
    const hotSteel = new THREE.Color(0xff7a2a);
    const whiteHot = new THREE.Color(0xffd780);
    const workpieceColor = new THREE.Color();
    const workpieceEmissive = new THREE.Color();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const time = clock.getElapsedTime();
      const run = runRef.current;
      const direction = run.elapsed < run.reverseUntil ? -1 : 1;
      const visualBoost = run.elapsed < run.overdriveUntil ? 1.55 : 1;
      const routeBoost = run.completed.A ? 1.2 : 1;
      const level = run.level;
      const levelConfig = LEVEL_CONFIGS[level];

      for (const routeId of ROUTE_ORDER) {
        if (parts.routeGroups[routeId])
          parts.routeGroups[routeId]!.visible = false;
        if (parts.machineGroups[routeId])
          parts.machineGroups[routeId]!.visible = false;
        for (const material of parts.routeStripes[routeId] ?? []) {
          material.emissiveIntensity = 0.12;
        }
      }
      parts.productionLine.visible = true;
      for (const levelId of [1, 2, 3, 4, 5] as const) {
        const levelGroup = parts.levelMachineGroups[levelId];
        if (levelGroup) {
          levelGroup.visible = levelId === level;
          levelGroup.scale.z =
            levelId === 5 && run.processingVariant === 1 ? -1 : 1;
        }
      }

      for (const mark of parts.routeMarks) {
        const route = ROUTES[mark.routeId];
        const length = routeLength(mark.routeId);
        const distance =
          (((mark.offset +
            run.machineTime *
              route.speed *
              1.45 *
              visualBoost *
              routeBoost *
              direction) %
            length) +
            length) %
          length;
        const pose = routePose(mark.routeId, distance / length);
        mark.group.position.set(pose.x, 0.51, pose.z);
        mark.group.rotation.y = -pose.angle;
      }

      for (const mark of parts.linearMarks) {
        const distance =
          (((mark.baseX +
            run.machineTime *
              levelConfig.baseBeltSpeed *
              1.45 *
              visualBoost *
              direction) %
            scalarLineLength) +
            scalarLineLength) %
          scalarLineLength;
        mark.group.position.x = distance;
      }

      const playerX = run.factoryProgress;
      const playerZ = processingLaneOffset(
        levelConfig,
        playerX,
        run.processingLane,
      );
      const effectiveLane =
        level === 5 && run.processingVariant === 1
          ? run.processingLane === 'upper'
            ? 'lower'
            : 'upper'
          : run.processingLane;

      // Before a fork the player must be able to read both alternatives. Once
      // the lane is committed, the unused machinery is visual noise: hide it
      // and keep only the chosen route plus the next nearby machine. This is
      // what stops the factory from collapsing into an overlapping "metro
      // map" on the later levels.
      for (const machine of parts.processingMachines) {
        if (machine.level !== level) {
          machine.object.visible = false;
          continue;
        }
        const center = (machine.start + machine.end) / 2;
        const owningFork = levelConfig.forks.find(
          (fork) => center >= fork.commitAt && center <= fork.mergeAt,
        );
        const routeIsCommitted =
          owningFork !== undefined &&
          run.factoryProgress >= owningFork.commitAt;
        const laneIsRelevant =
          machine.lane === 'both' ||
          !routeIsCommitted ||
          machine.lane === effectiveLane;
        const isNearby =
          center >= run.factoryProgress - 16 &&
          center <= run.factoryProgress + 24;
        machine.object.visible = laneIsRelevant && isNearby;
      }
      const suppliedState: WorkpieceProcessState =
        processStateRef.current ?? run.workpiece;
      const completedCount = Object.values(run.completed).filter(
        Boolean,
      ).length;
      const rawTemperature =
        suppliedState.temperature ??
        Math.max(run.heat / 100, completedCount === 1 ? 0.68 : 0);
      const temperature = THREE.MathUtils.clamp(
        rawTemperature > 1 ? (rawTemperature - 20) / 900 : rawTemperature,
        0,
        1,
      );
      const rawThickness = suppliedState.thickness;
      const rawWidth = suppliedState.width;
      const rawLength = suppliedState.length;
      const thickness = clamp(
        rawThickness !== undefined && rawThickness > 3
          ? rawThickness / 28
          : rawThickness,
        completedCount > 1 ? 0.72 : 1,
        0.48,
        1.35,
      );
      const width = clamp(
        rawWidth !== undefined && rawWidth > 3 ? rawWidth / 32 : rawWidth,
        completedCount > 1 ? 1.08 : 1,
        0.72,
        1.5,
      );
      const length = clamp(
        rawLength !== undefined && rawLength > 3 ? rawLength / 46 : rawLength,
        completedCount > 2 ? 1.12 : 1,
        0.62,
        1.62,
      );
      const rawCracks =
        suppliedState.cracks ??
        (suppliedState.crackRisk !== undefined
          ? suppliedState.crackRisk / 70
          : suppliedState.cracked
            ? 1
            : undefined);
      const cracks = clamp(
        rawCracks,
        Math.max(0, (3 - run.integrity) / 3),
        0,
        1,
      );
      const cut = clamp(
        suppliedState.cut ??
          (suppliedState.machineHistory?.includes('cutter') ? 1 : undefined),
        completedCount > 2 ? 1 : 0,
        0,
        1,
      );

      const pieceLength = 2.85 * length;
      const pieceThickness = 0.92 * thickness;
      const pieceWidth = 1.95 * width;
      const piece = parts.workpiece;
      piece.group.position.x = THREE.MathUtils.lerp(
        piece.group.position.x,
        playerX,
        0.24,
      );
      piece.group.position.z = THREE.MathUtils.lerp(
        piece.group.position.z,
        playerZ,
        0.24,
      );
      piece.group.position.y = 0.51 + pieceThickness / 2;
      piece.group.rotation.y = THREE.MathUtils.lerp(
        piece.group.rotation.y,
        direction < 0 ? Math.PI : 0,
        0.2,
      );
      piece.body.scale.set(pieceLength, pieceThickness, pieceWidth);
      piece.skin.scale.set(
        pieceLength * 1.015,
        pieceThickness * 1.02,
        pieceWidth * 1.015,
      );

      workpieceColor
        .copy(coldSteel)
        .lerp(hotSteel, Math.min(1, temperature * 1.35));
      if (temperature > 0.72)
        workpieceColor.lerp(whiteHot, (temperature - 0.72) / 0.28);
      workpieceEmissive.copy(hotSteel).multiplyScalar(temperature * 0.72);
      piece.body.material.color.copy(workpieceColor);
      piece.body.material.emissive.copy(workpieceEmissive);
      piece.body.material.emissiveIntensity = temperature * 1.8;
      piece.skin.material.color.copy(workpieceColor).offsetHSL(0, -0.08, 0.12);
      piece.skin.material.emissive.copy(workpieceEmissive);
      piece.skin.material.emissiveIntensity = temperature * 1.25;
      piece.heatLight.intensity = temperature * 12;

      for (const [index, rib] of piece.pressedRibs.entries()) {
        rib.visible = thickness < 0.92;
        rib.position.set(
          (index - 1) * pieceLength * 0.25,
          pieceThickness / 2 + 0.06,
          0,
        );
        rib.scale.set(1, 1, pieceWidth / 1.55);
      }
      for (const [index, crack] of piece.crackLines.entries()) {
        crack.visible = cracks > index / 3 + 0.08;
        crack.position.y = pieceThickness / 2 + 0.045;
      }
      piece.cutLine.visible = cut > 0.03;
      piece.cutLine.position.set(
        pieceLength * (0.42 - cut * 0.72),
        pieceThickness / 2 + 0.055,
        0,
      );
      piece.cutLine.scale.z = pieceWidth / 1.82;

      const forwardX = direction;
      const forwardZ = 0;
      const rightX = -forwardZ;
      const rightZ = forwardX;
      const lookAhead = 8.4;
      desiredTarget.set(
        playerX + forwardX * lookAhead,
        1.05,
        playerZ + forwardZ * lookAhead,
      );
      cameraTarget.lerp(desiredTarget, 0.085);
      desiredCamera.set(
        cameraTarget.x - forwardX * 16.5 + rightX * 4.3,
        27,
        cameraTarget.z - forwardZ * 16.5 + rightZ * 4.3,
      );
      camera.position.lerp(desiredCamera, 0.085);
      camera.lookAt(cameraTarget);

      // While the part is inside a machine, that machine's rhythm is read off
      // the passage rather than a clock of its own: three cycles from entry to
      // exit, whatever the zone's length or the belt's speed. That is what
      // makes the beats countable, so the one action the answer buys can be
      // timed against them. An idle machine keeps its old free-running look.
      passageByMachine.clear();
      for (const zone of parts.processingZones) {
        if (zone.level !== level) continue;
        if (zone.lane !== 'both' && zone.lane !== effectiveLane) continue;
        const local =
          (run.factoryProgress - zone.start) / (zone.end - zone.start);
        if (local < 0 || local > 1) continue;
        passageByMachine.set(zone.machineId, local);
      }
      const cyclePhase = (
        machineId: ProcessingMachineId,
        idleSeconds: number,
      ) => {
        const local = passageByMachine.get(machineId);
        return local === undefined
          ? (run.machineTime % idleSeconds) / idleSeconds
          : machineCyclePhase(local);
      };

      const idlePressPhase = (run.machineTime % 5.2) / 5.2;
      const idlePressStrike =
        idlePressPhase > 0.76
          ? Math.sin(Math.min(1, (idlePressPhase - 0.76) / 0.24) * Math.PI)
          : 0;
      for (const press of parts.presses) {
        const laneMatches =
          press.lane === 'both' || press.lane === effectiveLane;
        const localProgress =
          (run.factoryProgress - press.start) / (press.end - press.start);
        const rigStrike =
          press.level === level &&
          laneMatches &&
          localProgress >= 0 &&
          localProgress <= 1
            ? machineCycleStrike(localProgress, 0.075)
            : idlePressStrike;
        if (press.ram && press.ramY !== undefined)
          press.ram.position.y = press.ramY - rigStrike * 2.55;
        if (press.plate && press.plateY !== undefined)
          press.plate.position.y = press.plateY - rigStrike * 2.55;
      }

      // Rollers never slam, so their cycle reads as three surges of bite.
      const rollerBite =
        0.05 +
        ((1 - Math.cos(cyclePhase('rollers', 2.4) * Math.PI * 2)) / 2) * 0.06;
      for (const roller of parts.rollerMeshes)
        roller.object.rotateX(roller.direction * rollerBite);

      const coolingPhase = cyclePhase('cooling', 1.75);
      for (const effect of parts.coolingEffects) {
        const wave = Math.sin((coolingPhase + effect.phase) * Math.PI * 2);
        if (effect.steam) {
          effect.object.position.y =
            effect.baseY + ((coolingPhase + effect.phase) % 1) * 0.9;
          effect.object.scale
            .copy(effect.baseScale)
            .multiplyScalar(0.9 + ((wave + 1) / 2) * 0.34);
          effect.material.opacity = 0.18 + ((wave + 1) / 2) * 0.28;
        } else {
          effect.material.opacity = 0.55 + ((wave + 1) / 2) * 0.28;
        }
      }

      // Three sweeps, and the cut lands on the middle one, where the carriage
      // is crossing the part.
      const cutterTravel =
        Math.sin(cyclePhase('cutter', 3.7) * Math.PI * 2) * 2.35;
      for (const cutter of parts.cutters) {
        cutter.blade?.rotateZ(-0.22);
        if (cutter.carriage && cutter.carriageX !== undefined)
          cutter.carriage.position.x = cutter.carriageX + cutterTravel;
        if (cutter.blade && cutter.bladeX !== undefined)
          cutter.blade.position.x = cutter.bladeX + cutterTravel;
      }

      const furnaceGlow =
        2.7 + Math.sin(cyclePhase('furnace', 0.87) * Math.PI * 2) * 0.55;
      for (const material of parts.furnaceGlow)
        material.emissiveIntensity = furnaceGlow;

      const sawSpeed = run.completed.C ? 1.38 : 0.94;
      const sawOffset = Math.sin(run.machineTime * sawSpeed) * 1.42;
      if (parts.sawBlade) {
        parts.sawBlade.rotation.z -= 0.28 * sawSpeed;
        if (parts.sawBladeX !== undefined)
          parts.sawBlade.position.x = parts.sawBladeX + sawOffset;
      }

      for (const piston of parts.pistonRods) {
        const local = (run.machineTime / 5.8 + piston.phase) % 1;
        const strike =
          local > 0.72
            ? Math.sin(Math.min(1, (local - 0.72) / 0.28) * Math.PI)
            : 0;
        piston.object.position.y = piston.baseY + strike * 1.55;
      }
      for (const blade of parts.turbineBlades)
        blade.rotation.z -= 0.13 * (run.completed.B ? 1.7 : 1);

      for (const band of parts.windBands) {
        const drift = ((time * 0.85 + band.phase) % 1) * 3.2 - 1.6;
        band.mesh.position.x = band.baseX + band.normalX * drift;
        band.mesh.position.z = band.baseZ + band.normalZ * drift;
        (band.mesh.material as THREE.MeshBasicMaterial).opacity =
          0.18 + ((Math.sin(time * 5 + band.phase * 8) + 1) / 2) * 0.26;
      }

      for (const terminal of TERMINALS) {
        const material = parts.terminalLights[terminal.id];
        if (!material) continue;
        const complete = run.completed[terminal.id];
        material.emissive.setHex(
          complete ? 0x536662 : terminalColors[terminal.id],
        );
        material.emissiveIntensity = complete
          ? 0.25
          : 2 + Math.sin(time * 3 + terminal.x) * 0.45;
      }

      const exitReady = run.factoryProgress >= levelConfig.inspectionStart;
      if (parts.exit) {
        parts.exit.position.x = levelConfig.inspectionStart + 4;
        parts.exit.position.y = 0.52 + Math.sin(time * 2) * 0.05;
      }
      for (const material of parts.exitLights) {
        material.emissive.setHex(exitReady ? 0x36efc9 : 0xa22c25);
        material.emissiveIntensity = exitReady ? 2 : 0.72;
      }

      const pulse = (active: boolean, phase: number) =>
        active ? 0.28 + (Math.sin(time * 9 + phase) + 1) * 0.16 : 0.11;
      for (const [index, zone] of parts.processingZones.entries()) {
        const laneMatches = zone.lane === 'both' || zone.lane === effectiveLane;
        const approaching =
          run.factoryProgress >= zone.start - 8 &&
          run.factoryProgress <= zone.end + 1;
        const zoneProgress =
          (run.factoryProgress - zone.start) / (zone.end - zone.start);
        const beatIsLanding = machineCycleStrike(zoneProgress, 0.11) > 0;
        const machineActive =
          zone.level === level &&
          laneMatches &&
          approaching &&
          (zone.machineId !== 'press' || beatIsLanding);
        zone.mesh.material.opacity = pulse(machineActive, index * 0.7);
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry?.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const material of materials) {
            if (material instanceof THREE.MeshBasicMaterial && material.map)
              material.map.dispose();
            material.dispose();
          }
        }
        if (object instanceof THREE.Sprite) {
          object.material.map?.dispose();
          object.material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [runRef]);

  return <div ref={hostRef} className="factory-canvas" aria-hidden="true" />;
}
