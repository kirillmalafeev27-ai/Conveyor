export type GamePhase = 'menu' | 'playing' | 'won' | 'lost';
export type TerminalId = 'A' | 'B' | 'C';
export type BonusId = 'brake' | 'overdrive' | 'reverse' | 'anchor' | 'transfer';

export type RouteId =
  | 'entry-press'
  | 'fork1-a-furnace'
  | 'a-merge'
  | 'fork1-b-turbine'
  | 'b-merge'
  | 'merge-fork2'
  | 'fork2-saw'
  | 'fork2-piston'
  | 'merge-c'
  | 'c-exit'
  | 'exit-return';

export type RouteDefinition = {
  id: RouteId;
  points: ReadonlyArray<readonly [number, number]>;
  speed: number;
  color: number;
  oneWay?: boolean;
  bridge?: boolean;
};

export type BonusInventory = Record<BonusId, number>;
export type BonusCooldowns = Record<BonusId, number>;

export type ConveyorRun = {
  phase: GamePhase;
  elapsed: number;
  machineTime: number;
  timeLeft: number;
  routeId: RouteId;
  routeProgress: number;
  routeHistory: RouteId[];
  queuedRouteId: RouteId | null;
  playerX: number;
  playerZ: number;
  lateralOffset: number;
  integrity: number;
  heat: number;
  score: number;
  streak: number;
  charge: number;
  actionReady: boolean;
  completed: Record<TerminalId, boolean>;
  terminalDeadline: number | null;
  terminalOrder: TerminalId[];
  bonuses: BonusInventory;
  cooldowns: BonusCooldowns;
  bonusCursor: number;
  slowUntil: number;
  overdriveUntil: number;
  reverseUntil: number;
  anchorUntil: number;
  transferUntil: number;
  invulnerableUntil: number;
  lastHazardKey: string;
  message: string;
  objective: string;
  lossReason: string;
};

const CYAN = 0x50e8d2;
const AMBER = 0xf0ad38;
const VIOLET = 0xaf91ff;

export const TRACK_NODES = {
  START: [0, 0],
  FORK1: [26, 0],
  A: [50, -7],
  B: [50, 7],
  MERGE1: [60, 0],
  FORK2: [72, 0],
  MERGE2: [96, 0],
  C: [106, 0],
  EXIT: [120, 0],
} as const;

export const ROUTE_ORDER: RouteId[] = [
  'entry-press',
  'fork1-a-furnace',
  'a-merge',
  'fork1-b-turbine',
  'b-merge',
  'merge-fork2',
  'fork2-saw',
  'fork2-piston',
  'merge-c',
  'c-exit',
  'exit-return',
];

export const ROUTES: Record<RouteId, RouteDefinition> = {
  'entry-press': {
    id: 'entry-press',
    points: [TRACK_NODES.START, TRACK_NODES.FORK1],
    speed: 1.8,
    color: CYAN,
  },
  'fork1-a-furnace': {
    id: 'fork1-a-furnace',
    points: [TRACK_NODES.FORK1, [31, -7], TRACK_NODES.A],
    speed: 2.05,
    color: AMBER,
  },
  'a-merge': {
    id: 'a-merge',
    points: [TRACK_NODES.A, [55, -7], TRACK_NODES.MERGE1],
    speed: 2.45,
    color: AMBER,
    oneWay: true,
  },
  'fork1-b-turbine': {
    id: 'fork1-b-turbine',
    points: [TRACK_NODES.FORK1, [31, 7], TRACK_NODES.B],
    speed: 1.85,
    color: VIOLET,
  },
  'b-merge': {
    id: 'b-merge',
    points: [TRACK_NODES.B, [55, 7], TRACK_NODES.MERGE1],
    speed: 2.35,
    color: VIOLET,
    oneWay: true,
  },
  'merge-fork2': {
    id: 'merge-fork2',
    points: [TRACK_NODES.MERGE1, TRACK_NODES.FORK2],
    speed: 2.25,
    color: CYAN,
  },
  'fork2-saw': {
    id: 'fork2-saw',
    points: [TRACK_NODES.FORK2, [77, -6], [91, -6], TRACK_NODES.MERGE2],
    speed: 1.9,
    color: 0xff6f63,
    oneWay: true,
  },
  'fork2-piston': {
    id: 'fork2-piston',
    points: [TRACK_NODES.FORK2, [77, 6], [91, 6], TRACK_NODES.MERGE2],
    speed: 1.95,
    color: 0x55d994,
    oneWay: true,
  },
  'merge-c': {
    id: 'merge-c',
    points: [TRACK_NODES.MERGE2, TRACK_NODES.C],
    speed: 2.1,
    color: CYAN,
  },
  'c-exit': {
    id: 'c-exit',
    points: [TRACK_NODES.C, TRACK_NODES.EXIT],
    speed: 2.65,
    color: 0x55d994,
    oneWay: true,
    bridge: true,
  },
  'exit-return': {
    id: 'exit-return',
    points: [
      TRACK_NODES.EXIT,
      [126, 0],
      [126, 15],
      [-6, 15],
      [-6, 0],
      TRACK_NODES.START,
    ],
    speed: 7.2,
    color: 0x708286,
    oneWay: true,
  },
};

export const TERMINALS: ReadonlyArray<{
  id: TerminalId;
  routeIds: ReadonlyArray<RouteId>;
  x: number;
  z: number;
  label: string;
}> = [
  {
    id: 'A',
    routeIds: ['fork1-a-furnace'],
    x: TRACK_NODES.A[0],
    z: TRACK_NODES.A[1],
    label: 'Гидравлика',
  },
  {
    id: 'B',
    routeIds: ['fork1-b-turbine'],
    x: TRACK_NODES.B[0],
    z: TRACK_NODES.B[1],
    label: 'Вентиляция',
  },
  {
    id: 'C',
    routeIds: ['merge-c'],
    x: TRACK_NODES.C[0],
    z: TRACK_NODES.C[1],
    label: 'Энергия',
  },
];

export const BONUS_ORDER: BonusId[] = [
  'brake',
  'overdrive',
  'reverse',
  'anchor',
  'transfer',
];

export const BONUS_DATA: Record<
  BonusId,
  {
    key: string;
    label: string;
    detail: string;
    activeDetail: string;
    cooldown: number;
  }
> = {
  brake: {
    key: 'Q',
    label: 'Тормоз',
    detail: 'механизмы ×0.3 · лента ×0.5',
    activeDetail: 'механизмы и лента замедлены',
    cooldown: 8,
  },
  overdrive: {
    key: 'E',
    label: 'Форсаж',
    detail: 'скорость ×1.55 · 6 сек',
    activeDetail: 'форсаж активен',
    cooldown: 9,
  },
  reverse: {
    key: 'R',
    label: 'Реверс',
    detail: 'ход назад · 5 сек',
    activeDetail: 'реверс активен',
    cooldown: 9,
  },
  anchor: {
    key: 'F',
    label: 'Якорь',
    detail: 'не сносит · 4 сек',
    activeDetail: 'позиция зафиксирована',
    cooldown: 8,
  },
  transfer: {
    key: 'C',
    label: 'Переброс',
    detail: 'к ближайшей цели',
    activeDetail: 'переброс выполнен',
    cooldown: 10,
  },
};

export const RUN_DURATION_SECONDS = 180;
export const JUNCTION_WINDOW = 0.7;

function segmentLength(
  start: readonly [number, number],
  end: readonly [number, number],
) {
  return Math.hypot(end[0] - start[0], end[1] - start[1]);
}

export function routeLength(routeId: RouteId) {
  const points = ROUTES[routeId].points;
  let length = 0;
  for (let index = 1; index < points.length; index += 1)
    length += segmentLength(points[index - 1], points[index]);
  return length;
}

export function routePose(routeId: RouteId, progress: number) {
  const points = ROUTES[routeId].points;
  const targetDistance =
    Math.max(0, Math.min(1, progress)) * routeLength(routeId);
  let traversed = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = segmentLength(start, end);
    if (targetDistance <= traversed + length || index === points.length - 1) {
      const local = Math.max(
        0,
        Math.min(1, (targetDistance - traversed) / length),
      );
      return {
        x: start[0] + (end[0] - start[0]) * local,
        z: start[1] + (end[1] - start[1]) * local,
        angle: Math.atan2(end[1] - start[1], end[0] - start[0]),
      };
    }
    traversed += length;
  }
  const end = points.at(-1) ?? [0, 0];
  return { x: end[0], z: end[1], angle: 0 };
}

export function syncPlayerPosition(run: ConveyorRun) {
  const pose = routePose(run.routeId, run.routeProgress);
  const normalX = -Math.sin(pose.angle);
  const normalZ = Math.cos(pose.angle);
  run.playerX = pose.x + normalX * run.lateralOffset;
  run.playerZ = pose.z + normalZ * run.lateralOffset;
  return pose;
}

export function setPlayerRoute(
  run: ConveyorRun,
  routeId: RouteId,
  progress = 0,
  remember = false,
) {
  if (remember) {
    run.routeHistory.push(run.routeId);
    if (run.routeHistory.length > 12) run.routeHistory.shift();
  }
  run.routeId = routeId;
  run.routeProgress = Math.max(0, Math.min(0.96, progress));
  run.queuedRouteId = null;
  syncPlayerPosition(run);
}

export function allTerminalsComplete(run: ConveyorRun) {
  return Object.values(run.completed).every(Boolean);
}

export function terminalAtPlayer(run: ConveyorRun) {
  if (run.routeProgress < 0.84) return null;
  return (
    TERMINALS.find(
      (terminal) =>
        terminal.routeIds.includes(run.routeId) && !run.completed[terminal.id],
    ) ?? null
  );
}

export function playerAtExit(run: ConveyorRun) {
  return (
    allTerminalsComplete(run) &&
    run.routeId === 'c-exit' &&
    run.routeProgress >= 0.84
  );
}

export function getJunctionOptions(run: ConveyorRun) {
  if (run.routeProgress < JUNCTION_WINDOW) return { up: null, down: null };
  const options: Partial<
    Record<RouteId, { up: RouteId | null; down: RouteId | null }>
  > = {
    'entry-press': {
      up: 'fork1-a-furnace',
      down: 'fork1-b-turbine',
    },
    'merge-fork2': { up: 'fork2-saw', down: 'fork2-piston' },
  };
  return options[run.routeId] ?? { up: null, down: null };
}

export function routeActionLabel(routeId: RouteId | null) {
  if (!routeId) return 'Нет развилки';
  const labels: Record<RouteId, string> = {
    'entry-press': 'Прессовая линия',
    'fork1-a-furnace': 'A · печь',
    'a-merge': 'После A',
    'fork1-b-turbine': 'B · турбина',
    'b-merge': 'После B',
    'merge-fork2': 'Вторая развилка',
    'fork2-saw': 'Пила',
    'fork2-piston': 'Поршень',
    'merge-c': 'Терминал C',
    'c-exit': 'К выходу',
    'exit-return': 'Рециркуляция',
  };
  return labels[routeId];
}

export function defaultNextRoute(run: ConveyorRun): RouteId | null {
  const options = getJunctionOptions(run);
  if (
    run.queuedRouteId &&
    (run.queuedRouteId === options.up || run.queuedRouteId === options.down)
  ) {
    const queued = run.queuedRouteId;
    run.queuedRouteId = null;
    return queued;
  }
  switch (run.routeId) {
    case 'entry-press':
      return run.completed.A && !run.completed.B
        ? 'fork1-b-turbine'
        : 'fork1-a-furnace';
    case 'exit-return':
      return 'entry-press';
    case 'fork1-a-furnace':
      return run.completed.A ? 'a-merge' : null;
    case 'fork1-b-turbine':
      return run.completed.B ? 'b-merge' : null;
    case 'a-merge':
    case 'b-merge':
      return 'merge-fork2';
    case 'merge-fork2':
      return 'fork2-saw';
    case 'fork2-saw':
    case 'fork2-piston':
      return 'merge-c';
    case 'merge-c':
      return run.completed.C ? 'c-exit' : null;
    case 'c-exit':
      return allTerminalsComplete(run) ? null : 'exit-return';
  }
}

export function advanceAlongRoute(run: ConveyorRun, worldDistance: number) {
  if (worldDistance < 0) {
    let remaining = -worldDistance;
    for (
      let transitions = 0;
      transitions < 5 && remaining > 0;
      transitions += 1
    ) {
      const length = routeLength(run.routeId);
      const distanceToStart = run.routeProgress * length;
      if (remaining <= distanceToStart) {
        run.routeProgress -= remaining / length;
        remaining = 0;
        break;
      }
      if (ROUTES[run.routeId].oneWay || run.routeHistory.length === 0) {
        run.routeProgress = 0;
        remaining = 0;
        break;
      }
      remaining -= distanceToStart;
      run.routeId = run.routeHistory.pop() ?? run.routeId;
      run.routeProgress = 1;
    }
    syncPlayerPosition(run);
    return;
  }

  let remaining = worldDistance;
  for (
    let transitions = 0;
    transitions < 5 && remaining > 0;
    transitions += 1
  ) {
    const length = routeLength(run.routeId);
    const distanceToEnd = (1 - run.routeProgress) * length;
    if (remaining < distanceToEnd) {
      run.routeProgress += remaining / length;
      remaining = 0;
      break;
    }
    const next = defaultNextRoute(run);
    if (!next) {
      run.routeProgress = 0.94;
      remaining = 0;
      break;
    }
    remaining -= distanceToEnd;
    run.routeHistory.push(run.routeId);
    if (run.routeHistory.length > 12) run.routeHistory.shift();
    run.routeId = next;
    run.routeProgress = 0;
  }
  syncPlayerPosition(run);
}

export function createRun(): ConveyorRun {
  return {
    phase: 'menu',
    elapsed: 0,
    machineTime: 0,
    timeLeft: RUN_DURATION_SECONDS,
    routeId: 'entry-press',
    routeProgress: 0.025,
    routeHistory: [],
    queuedRouteId: null,
    playerX: 0.65,
    playerZ: 0,
    lateralOffset: 0,
    integrity: 3,
    heat: 0,
    score: 0,
    streak: 0,
    charge: 100,
    actionReady: false,
    completed: { A: false, B: false, C: false },
    terminalDeadline: null,
    terminalOrder: [],
    bonuses: { brake: 0, overdrive: 0, reverse: 0, anchor: 0, transfer: 0 },
    cooldowns: { brake: 0, overdrive: 0, reverse: 0, anchor: 0, transfer: 0 },
    bonusCursor: 0,
    slowUntil: 0,
    overdriveUntil: 0,
    reverseUntil: 0,
    anchorUntil: 0,
    transferUntil: 0,
    invulnerableUntil: 0,
    lastHazardKey: '',
    message: 'Ответь правильно, чтобы получить команду.',
    objective: 'Активируй A, B и C в любом порядке',
    lossReason: '',
  };
}

export function nearestTerminal(run: ConveyorRun) {
  const player = routePose(run.routeId, run.routeProgress);
  return (
    TERMINALS.filter((terminal) => !run.completed[terminal.id])
      .map((terminal) => ({
        terminal,
        distance: Math.hypot(player.x - terminal.x, player.z - terminal.z),
      }))
      .sort((left, right) => left.distance - right.distance)[0] ?? null
  );
}

export function formatClock(seconds: number) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
