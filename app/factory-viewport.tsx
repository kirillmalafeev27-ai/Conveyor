'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  ROUTES,
  ROUTE_ORDER,
  TERMINALS,
  TRACK_NODES,
  allTerminalsComplete,
  routeLength,
  routePose,
  type ConveyorRun,
  type RouteId,
  type TerminalId,
} from '@/lib/conveyor-game';

type RouteMark = {
  group: THREE.Group;
  routeId: RouteId;
  offset: number;
};

type MovingBand = {
  mesh: THREE.Mesh;
  baseX: number;
  baseZ: number;
  normalX: number;
  normalZ: number;
  phase: number;
};

type AnimatedParts = {
  player?: THREE.Object3D;
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

function addLabelSprite(
  scene: THREE.Scene,
  text: string,
  color: string,
  x: number,
  z: number,
  width = 4.4,
  y = 4.8,
) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = 'rgba(3, 10, 12, .94)';
  context.strokeStyle = color;
  context.lineWidth = 9;
  context.roundRect(12, 12, 488, 136, 22);
  context.fill();
  context.stroke();
  context.fillStyle = color;
  context.font = '900 68px monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 256, 82);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    }),
  );
  sprite.position.set(x, y, z);
  sprite.scale.set(width, width * 0.31, 1);
  scene.add(sprite);
}

function addFloorLabel(
  scene: THREE.Scene,
  text: string,
  color: string,
  x: number,
  z: number,
  width = 5.4,
) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 220;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = 'rgba(4, 15, 17, .86)';
  context.strokeStyle = color;
  context.lineWidth = 10;
  context.roundRect(12, 12, 744, 196, 28);
  context.fill();
  context.stroke();
  context.fillStyle = color;
  context.font = '900 72px monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 384, 112);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width * 0.29),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  plane.position.set(x, 0.74, z);
  plane.rotation.x = -Math.PI / 2;
  scene.add(plane);
}

function createDirectionArrow(color: number) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const shape = new THREE.Shape();
  shape.moveTo(-1.15, -0.3);
  shape.lineTo(0.15, -0.3);
  shape.lineTo(0.15, -0.7);
  shape.lineTo(1.2, 0);
  shape.lineTo(0.15, 0.7);
  shape.lineTo(0.15, 0.3);
  shape.lineTo(-1.15, 0.3);
  shape.closePath();
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
  arrow.rotation.x = -Math.PI / 2;
  group.add(arrow);
  return group;
}

function addRouteZone(
  scene: THREE.Scene,
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
    new THREE.BoxGeometry(length, 0.055, 4.02),
    material,
  );
  zone.position.set(pose.x, 0.71, pose.z);
  zone.rotation.y = -pose.angle;
  parts.dangerZones[id] = zone;
  scene.add(zone);
}

export function FactoryViewport({
  runRef,
}: {
  runRef: { current: ConveyorRun };
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x091517);
    scene.fog = new THREE.Fog(0x091517, 34, 62);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.38;
    host.appendChild(renderer.domElement);

    const camera = new THREE.OrthographicCamera(-11, 11, 9, -9, 0.1, 100);
    const startPose = routePose(
      runRef.current.routeId,
      runRef.current.routeProgress,
    );
    camera.position.set(startPose.x + 4, 29, startPose.z + 6.4);
    camera.lookAt(startPose.x + 4, 0, startPose.z);

    scene.add(new THREE.HemisphereLight(0xd9fffa, 0x071011, 3.2));
    const key = new THREE.DirectionalLight(0xecfffc, 4.8);
    key.position.set(-7, 20, -8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -18;
    key.shadow.camera.right = 18;
    key.shadow.camera.top = 18;
    key.shadow.camera.bottom = -18;
    scene.add(key);

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(140, 0.6, 38),
      new THREE.MeshStandardMaterial({
        color: 0x102225,
        metalness: 0.65,
        roughness: 0.58,
      }),
    );
    floor.position.set(63, -0.62, 6);
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(140, 140, 0x2b6c68, 0x1b3e40);
    grid.position.set(63, -0.3, 6);
    const gridMaterials = Array.isArray(grid.material)
      ? grid.material
      : [grid.material];
    for (const material of gridMaterials) {
      material.transparent = true;
      material.opacity = 0.36;
    }
    scene.add(grid);

    const parts: AnimatedParts = {
      pistonRods: [],
      turbineBlades: [],
      terminalLights: {},
      exitLights: [],
      routeMarks: [],
      routeGroups: {},
      routeStripes: {},
      dangerZones: {},
      windBands: [],
    };
    const beltMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b4247,
      metalness: 0.7,
      roughness: 0.4,
    });
    const railMaterial = new THREE.MeshStandardMaterial({
      color: 0x839397,
      metalness: 0.72,
      roughness: 0.28,
    });

    for (const routeId of ROUTE_ORDER) {
      const route = ROUTES[routeId];
      const group = new THREE.Group();
      group.name = `ROUTE_${routeId}`;
      parts.routeGroups[routeId] = group;
      parts.routeStripes[routeId] = [];
      scene.add(group);
      for (let index = 1; index < route.points.length; index += 1) {
        const start = route.points[index - 1];
        const end = route.points[index];
        const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
        const pose = segmentPose(start, end, 0.5);
        const belt = new THREE.Mesh(
          new THREE.BoxGeometry(length + 0.22, 0.44, 4.3),
          beltMaterial.clone(),
        );
        belt.position.set(pose.x, 0, pose.z);
        belt.rotation.y = -pose.angle;
        belt.receiveShadow = true;
        group.add(belt);

        const stripeMaterial = new THREE.MeshStandardMaterial({
          color: route.color,
          emissive: route.color,
          emissiveIntensity: 0.28,
          metalness: 0.18,
          roughness: 0.38,
        });
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(length + 0.08, 0.04, 0.18),
          stripeMaterial,
        );
        stripe.position.set(pose.x, 0.66, pose.z);
        stripe.rotation.y = -pose.angle;
        group.add(stripe);
        parts.routeStripes[routeId]?.push(stripeMaterial);

        const normalX = -Math.sin(pose.angle);
        const normalZ = Math.cos(pose.angle);
        for (const side of [-1, 1]) {
          // Leave generous breathing room at bends, forks and terminal decks.
          // Continuous rails made the readable route look like a knot of tracks.
          const railLength = Math.max(0.6, length - 5.4);
          const rail = new THREE.Mesh(
            new THREE.BoxGeometry(railLength, 0.035, 0.08),
            railMaterial.clone(),
          );
          rail.position.set(
            pose.x + normalX * side * 2.08,
            0.635,
            pose.z + normalZ * side * 2.08,
          );
          rail.rotation.y = -pose.angle;
          group.add(rail);
        }
      }

      const length = routeLength(routeId);
      const arrowCount = Math.max(1, Math.floor(length / 6.2));
      for (let index = 0; index < arrowCount; index += 1) {
        const offset = ((index + 0.5) / arrowCount) * length;
        const arrow = createDirectionArrow(route.color);
        const pose = routePose(routeId, offset / length);
        arrow.position.set(pose.x, 0.78, pose.z);
        arrow.rotation.y = -pose.angle;
        group.add(arrow);
        parts.routeMarks.push({ group: arrow, routeId, offset });
      }
    }

    const junctionMaterial = new THREE.MeshStandardMaterial({
      color: 0x20393d,
      emissive: 0x47dcca,
      emissiveIntensity: 0.16,
      metalness: 0.62,
      roughness: 0.4,
    });
    for (const [x, z] of [TRACK_NODES.FORK1, TRACK_NODES.FORK2]) {
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(8.2, 0.48, 10.8),
        junctionMaterial.clone(),
      );
      deck.position.set(x, 0.12, z);
      deck.receiveShadow = true;
      scene.add(deck);
    }
    addFloorLabel(scene, 'B  ↓  ТУРБИНА', '#c7a8ff', 27.2, 3.2);
    addFloorLabel(scene, 'A  ↑  ПЕЧЬ', '#ffc35d', 27.2, -3.2);
    addFloorLabel(scene, '↓  ПОРШЕНЬ', '#72e7a7', 73.2, 3.2);
    addFloorLabel(scene, '↑  ПИЛА', '#ff8278', 73.2, -3.2);

    addRouteZone(scene, parts, 'press', 'entry-press', 0.28, 0.7, 0xff5046);
    addRouteZone(
      scene,
      parts,
      'furnace',
      'fork1-a-furnace',
      0.2,
      0.84,
      0xff8d28,
    );
    addRouteZone(
      scene,
      parts,
      'turbine',
      'fork1-b-turbine',
      0.2,
      0.84,
      0x55d8ff,
    );
    addRouteZone(scene, parts, 'saw', 'fork2-saw', 0.28, 0.76, 0xff5046);
    addRouteZone(scene, parts, 'piston', 'fork2-piston', 0.27, 0.78, 0xffbd3e);

    const pressPose = routePose('entry-press', 0.5);
    parts.pressPlate = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 0.58, 3.82),
      new THREE.MeshStandardMaterial({
        color: 0xc9362d,
        emissive: 0xff4439,
        emissiveIntensity: 0.8,
        metalness: 0.65,
        roughness: 0.28,
      }),
    );
    parts.pressPlate.position.set(pressPose.x, 5.2, pressPose.z);
    parts.pressPlate.castShadow = true;
    parts.pressPlateY = parts.pressPlate.position.y;
    scene.add(parts.pressPlate);

    for (let index = 0; index < 8; index += 1) {
      const pose = routePose('entry-press', 0.31 + index * 0.05);
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.06, 3.9),
        new THREE.MeshBasicMaterial({
          color: index % 2 === 0 ? 0xff5046 : 0xffd55c,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
        }),
      );
      stripe.position.set(pose.x, 0.8, pose.z);
      scene.add(stripe);
    }

    const furnaceMid = routePose('fork1-a-furnace', 0.54);
    const furnaceLength = routeLength('fork1-a-furnace') * 0.58;
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(furnaceLength, 2.65, 0.3),
        new THREE.MeshStandardMaterial({
          color: 0x5a2518,
          emissive: 0xff5a19,
          emissiveIntensity: 0.75,
          metalness: 0.5,
          roughness: 0.45,
        }),
      );
      wall.position.set(furnaceMid.x, 1.45, furnaceMid.z + side * 2.05);
      scene.add(wall);
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
      scene.add(band);
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
        scene.add(line);
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
      scene.add(dock);
    }

    let disposed = false;
    const loader = new GLTFLoader();
    loader.load('/models/conveyor_factory_kit.glb', (gltf) => {
      if (disposed) return;
      const source = gltf.scene;

      const press = cloneAsset(
        source,
        'ASSET_Hydraulic_Press',
        [0, 0, 0],
        1.55,
      );
      if (press) {
        press.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          const materials = Array.isArray(node.material)
            ? node.material
            : [node.material];
          for (const material of materials) {
            if (!(material instanceof THREE.MeshStandardMaterial)) continue;
            if (node.name.includes('Ram') || node.name.includes('Die')) {
              material.color.setHex(0xb62922);
              material.emissive.setHex(0xff3f34);
              material.emissiveIntensity = 0.75;
            } else if (
              node.name.includes('Crown') ||
              node.name.includes('Pillar')
            ) {
              material.color.setHex(0x18383e);
              material.metalness = 0.82;
            }
          }
        });
        placeAlongRoute(press, 'entry-press', 0.5, 0.08);
        parts.pressRam = press.getObjectByName('Press_Ram') ?? undefined;
        parts.pressRamY = parts.pressRam?.position.y;
        scene.add(press);
      }

      for (const progress of [0.31, 0.51, 0.71]) {
        const portal = cloneAsset(
          source,
          'ASSET_Furnace_Portal',
          [0, 0, 0],
          1.28,
        );
        if (!portal) continue;
        portal.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          const materials = Array.isArray(node.material)
            ? node.material
            : [node.material];
          for (const material of materials) {
            if (!(material instanceof THREE.MeshStandardMaterial)) continue;
            if (
              node.name.includes('Header') ||
              node.name.includes('Jamb') ||
              node.name.includes('Pipe')
            ) {
              material.color.setHex(0x6c2418);
              material.emissive.setHex(0xff4e1d);
              material.emissiveIntensity = 0.34;
            }
            if (
              node.name.includes('Flame') ||
              node.name.includes('Heat_Core')
            ) {
              material.emissive.setHex(0xff8a2a);
              material.emissiveIntensity = 2.4;
            }
          }
        });
        placeAlongRoute(portal, 'fork1-a-furnace', progress, 0.48);
        scene.add(portal);
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
        scene.add(turbine);
      }

      const saw = cloneAsset(source, 'ASSET_Transverse_Saw', [0, 0, 0], 1.32);
      if (saw) {
        placeAlongRoute(saw, 'fork2-saw', 0.52, -0.06);
        parts.sawBlade = saw.getObjectByName('Saw_Blade') ?? undefined;
        parts.sawBladeX = parts.sawBlade?.position.x;
        scene.add(saw);
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
        scene.add(piston);
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
        scene.add(terminalAsset);
        const labelColor = `#${terminalColors[terminal.id]
          .toString(16)
          .padStart(6, '0')}`;
        addLabelSprite(
          scene,
          `ТЕРМИНАЛ ${terminal.id}`,
          labelColor,
          terminal.x,
          terminal.z,
          5.2,
          5.2,
        );
      }

      parts.exit = cloneAsset(
        source,
        'ASSET_Exit_Gate',
        [TRACK_NODES.EXIT[0], 0.52, TRACK_NODES.EXIT[1]],
        1.58,
      );
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
        scene.add(parts.exit);
        addLabelSprite(
          scene,
          'ВЫХОД',
          '#61efa8',
          TRACK_NODES.EXIT[0],
          TRACK_NODES.EXIT[1],
          4.2,
          5.8,
        );
      }

      parts.player = cloneAsset(
        source,
        'ASSET_Hero_Worker_Drone',
        [runRef.current.playerX, 0.88, runRef.current.playerZ],
        0.88,
      );
      if (parts.player) scene.add(parts.player);
    });

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      const aspect = width / height;
      const halfWidth = 10.7;
      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = halfWidth / aspect;
      camera.bottom = -halfWidth / aspect;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const returnRoute = parts.routeGroups['exit-return'];
    if (returnRoute) returnRoute.visible = false;

    let frame = 0;
    const clock = new THREE.Clock();
    const cameraTarget = new THREE.Vector3(startPose.x + 4, 0, startPose.z);
    const desiredCamera = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const time = clock.getElapsedTime();
      const run = runRef.current;
      const direction = run.elapsed < run.reverseUntil ? -1 : 1;
      const visualBoost = run.elapsed < run.overdriveUntil ? 1.55 : 1;
      const routeBoost = run.completed.A ? 1.2 : 1;

      if (returnRoute) returnRoute.visible = run.routeId === 'exit-return';
      for (const routeId of ROUTE_ORDER) {
        for (const material of parts.routeStripes[routeId] ?? []) {
          material.emissiveIntensity = routeId === run.routeId ? 1.35 : 0.24;
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
        mark.group.position.set(pose.x, 0.78, pose.z);
        mark.group.rotation.y = -pose.angle;
      }

      const pose = routePose(run.routeId, run.routeProgress);
      const normalX = -Math.sin(pose.angle);
      const normalZ = Math.cos(pose.angle);
      const playerX = pose.x + normalX * run.lateralOffset;
      const playerZ = pose.z + normalZ * run.lateralOffset;
      if (parts.player) {
        parts.player.position.x = THREE.MathUtils.lerp(
          parts.player.position.x,
          playerX,
          0.23,
        );
        parts.player.position.z = THREE.MathUtils.lerp(
          parts.player.position.z,
          playerZ,
          0.23,
        );
        parts.player.position.y = 0.9 + Math.sin(time * 5) * 0.06;
        const facing = Math.PI / 2 - pose.angle + (direction < 0 ? Math.PI : 0);
        parts.player.rotation.y = THREE.MathUtils.lerp(
          parts.player.rotation.y,
          facing,
          0.22,
        );
      }

      const lookAhead = 4.15 * direction;
      desiredTarget.set(
        playerX + Math.cos(pose.angle) * lookAhead,
        0,
        playerZ + Math.sin(pose.angle) * lookAhead,
      );
      cameraTarget.lerp(desiredTarget, 0.075);
      desiredCamera.set(cameraTarget.x, 29, cameraTarget.z + 6.4);
      camera.position.lerp(desiredCamera, 0.075);
      camera.lookAt(cameraTarget);

      const pressCycle = run.completed.A ? 7.4 : 5.4;
      const pressPhase = (run.machineTime % pressCycle) / pressCycle;
      const strike =
        pressPhase > 0.76
          ? Math.sin(Math.min(1, (pressPhase - 0.76) / 0.24) * Math.PI)
          : 0;
      if (parts.pressRam && parts.pressRamY !== undefined)
        parts.pressRam.position.y = parts.pressRamY - strike * 2.15;
      if (parts.pressPlate && parts.pressPlateY !== undefined)
        parts.pressPlate.position.y = parts.pressPlateY - strike * 4.15;

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

      const exitReady = allTerminalsComplete(run);
      if (parts.exit) parts.exit.position.y = 0.52 + Math.sin(time * 2) * 0.05;
      for (const material of parts.exitLights) {
        material.emissive.setHex(exitReady ? 0x36efc9 : 0xa22c25);
        material.emissiveIntensity = exitReady ? 2 : 0.72;
      }

      const pulse = (active: boolean, phase: number) =>
        active ? 0.3 + (Math.sin(time * 9 + phase) + 1) * 0.18 : 0.14;
      const zones = parts.dangerZones;
      (zones.press.material as THREE.MeshBasicMaterial).opacity = pulse(
        pressPhase > 0.66,
        0,
      );
      (zones.furnace.material as THREE.MeshBasicMaterial).opacity = pulse(
        run.routeId === 'fork1-a-furnace',
        1,
      );
      (zones.turbine.material as THREE.MeshBasicMaterial).opacity = pulse(
        run.routeId === 'fork1-b-turbine',
        2,
      );
      (zones.saw.material as THREE.MeshBasicMaterial).opacity = pulse(
        run.routeId === 'fork2-saw',
        3,
      );
      (zones.piston.material as THREE.MeshBasicMaterial).opacity = pulse(
        run.routeId === 'fork2-piston',
        4,
      );

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
