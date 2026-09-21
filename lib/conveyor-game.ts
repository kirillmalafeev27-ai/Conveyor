import {
  PROCESSING_BONUS_DATA,
  applyMachineEffect,
  cloneProcessingTarget,
  createProcessingState,
  getProcessingVisualState,
  levelConfig,
  processingLevel,
  returnableFork,
  type ProcessingAction,
  type ProcessingBonusId,
  type ProcessingLane,
  type ProcessingLevelId,
  type ProcessingMachineId,
  type ProcessingState,
  type ProcessingTarget,
} from './processing-game.ts';

export * from './processing-game.ts';

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
  /** New metal-processing campaign state. Legacy route fields remain during UI migration. */
  level: ProcessingLevelId;
  factoryProgress: number;
  stageIndex: number;
  stageProgress: number;
  processingLane: ProcessingLane;
  processingVariant: 0 | 1;
  workpiece: ProcessingState;
  target: ProcessingTarget;
  correctAnswers: number;
  wrongAnswers: number;
  bonusProgress: number;
  bonusOffer: readonly [ProcessingBonusId, ProcessingBonusId] | null;
  storedProcessingBonus: ProcessingBonusId | null;
  nextMachineMultiplier: number;
  lastMachineId: ProcessingMachineId | null;
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
export const QUIZ_IMPULSE_DECAY_PER_SECOND = 2.475;
export const EARNED_ACTION_DECAY_PER_SECOND = 3.375;
export const PROCESSING_BONUS_CORRECT_ANSWERS = 3;
export const PROCESSING_BONUS_DURATION_SECONDS = 5;
export const PROCESSING_FORWARD_SHIFT = 12;
export const PROCESSING_BACKWARD_SHIFT = -6;

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
    level: 1,
    factoryProgress: levelConfig(1).startAt,
    stageIndex: 0,
    stageProgress: 0,
    processingLane: 'upper',
    processingVariant: 0,
    workpiece: createProcessingState(),
    target: cloneProcessingTarget(processingLevel(1).target),
    correctAnswers: 0,
    wrongAnswers: 0,
    bonusProgress: 0,
    bonusOffer: null,
    storedProcessingBonus: null,
    nextMachineMultiplier: 1,
    lastMachineId: null,
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

export type ProcessingQuizResolution = {
  run: ConveyorRun;
  accepted: boolean;
  correct: boolean;
  grantedAction: boolean;
  bonusEarned: boolean;
};

export type ProcessingActionResolution = {
  run: ConveyorRun;
  consumed: boolean;
  action: ProcessingAction;
  longitudinalDelta: number;
  /**
   * Set when the part was sent back up the line. Everything already applied
   * past this point has to be forgotten, or the re-entered machines would not
   * work the metal a second time.
   */
  rewoundTo?: number;
  reason: string;
};

export type ProcessingBonusResolution = {
  run: ConveyorRun;
  activated: boolean;
  bonusId: ProcessingBonusId | null;
  reason: string;
};

export type ProcessingMachineResolution = {
  run: ConveyorRun;
  machineId: ProcessingMachineId;
  effectMultiplier: number;
  crackRiskAdded: number;
};

/** Deep-enough clone for every field changed by the pure processing helpers. */
export function cloneConveyorRun(run: ConveyorRun): ConveyorRun {
  return {
    ...run,
    routeHistory: [...run.routeHistory],
    completed: { ...run.completed },
    terminalOrder: [...run.terminalOrder],
    bonuses: { ...run.bonuses },
    cooldowns: { ...run.cooldowns },
    workpiece: createProcessingState(run.workpiece),
    target: cloneProcessingTarget(run.target),
    bonusOffer: run.bonusOffer ? [...run.bonusOffer] : null,
  };
}

const BONUS_OFFER_ROTATION: ReadonlyArray<
  readonly [ProcessingBonusId, ProcessingBonusId]
> = [
  ['booster', 'damper'],
  ['boost', 'slow'],
  ['booster', 'slow'],
  ['damper', 'boost'],
];

function releaseEarnedBonusOffer(run: ConveyorRun) {
  if (
    !processingLevel(run.level).bonusesEnabled ||
    run.bonusProgress < PROCESSING_BONUS_CORRECT_ANSWERS ||
    run.bonusOffer
  ) {
    return false;
  }
  const rewardIndex = Math.max(
    0,
    Math.floor(run.correctAnswers / PROCESSING_BONUS_CORRECT_ANSWERS) - 1,
  );
  const pair = BONUS_OFFER_ROTATION[rewardIndex % BONUS_OFFER_ROTATION.length];
  run.bonusOffer = [pair[0], pair[1]];
  return true;
}

/**
 * Pure quiz reducer. A correct answer can hold one action, never a stack.
 * Every third correct answer unlocks a two-card bonus choice from level 4.
 */
export function resolveProcessingQuiz(
  source: ConveyorRun,
  correct: boolean,
): ProcessingQuizResolution {
  const run = cloneConveyorRun(source);
  if (run.actionReady) {
    return {
      run,
      accepted: false,
      correct,
      grantedAction: false,
      bonusEarned: false,
    };
  }

  if (!correct) {
    run.actionReady = false;
    run.streak = 0;
    run.wrongAnswers += 1;
    run.message = 'Неверно. Команда не выдана.';
    return {
      run,
      accepted: true,
      correct: false,
      grantedAction: false,
      bonusEarned: false,
    };
  }

  run.actionReady = true;
  run.streak += 1;
  run.correctAnswers += 1;
  if (processingLevel(run.level).bonusesEnabled) {
    run.bonusProgress = Math.min(
      PROCESSING_BONUS_CORRECT_ANSWERS,
      run.bonusProgress + 1,
    );
  }
  const bonusEarned = releaseEarnedBonusOffer(run);
  run.message = bonusEarned
    ? 'Верно. Выбери одно действие и один из двух бонусов.'
    : 'Верно. Доступно ровно одно действие.';
  return {
    run,
    accepted: true,
    correct: true,
    grantedAction: true,
    bonusEarned,
  };
}

/** Impulse burns slowly while answering and slightly faster after it is earned. */
export function decayProcessingImpulse(
  source: ConveyorRun,
  deltaSeconds: number,
): ConveyorRun {
  const run = cloneConveyorRun(source);
  const rate = run.actionReady
    ? EARNED_ACTION_DECAY_PER_SECOND
    : QUIZ_IMPULSE_DECAY_PER_SECOND;
  run.charge = Math.max(0, run.charge - Math.max(0, deltaSeconds) * rate);
  if (run.charge <= 0 && run.actionReady) {
    run.actionReady = false;
    run.message = 'Импульс погас. Нужен новый правильный ответ.';
  }
  return run;
}

/**
 * Consumes one answer-earned action. Route movement is returned as a delta so
 * page.tsx can animate it; lane selection itself is resolved here.
 */
export function consumeProcessingAction(
  source: ConveyorRun,
  action: ProcessingAction,
): ProcessingActionResolution {
  const run = cloneConveyorRun(source);
  if (!run.actionReady || run.charge <= 0) {
    return {
      run,
      consumed: false,
      action,
      longitudinalDelta: 0,
      reason: 'Сначала ответь правильно, пока не погас импульс.',
    };
  }

  if (action === 'recirculate') {
    const fork = returnableFork(run.level, run.factoryProgress);
    if (!fork) {
      run.message = 'Возврат доступен только на петле сразу после развилки.';
      return {
        run,
        consumed: false,
        action,
        longitudinalDelta: 0,
        reason: run.message,
      };
    }
    // The part rides the loop back to the decision zone with its lane cleared,
    // so the fork is a free choice again. Nothing about the metal changes: the
    // cost is the run clock, which is the only currency that matters here.
    const rewoundTo = fork.decisionStart;
    run.factoryProgress = rewoundTo;
    run.playerX = rewoundTo;
    run.processingLane = 'upper';
    run.actionReady = false;
    run.message = 'Заготовка ушла на петлю возврата — развилка снова открыта.';
    return {
      run,
      consumed: true,
      action,
      longitudinalDelta: 0,
      rewoundTo,
      reason: run.message,
    };
  }

  const committedFork = levelConfig(run.level).forks.find(
    (fork) =>
      run.factoryProgress >= fork.commitAt &&
      run.factoryProgress < fork.mergeAt,
  );
  if (action === 'toggle-lane' && committedFork) {
    run.message = 'Ветка уже выбрана. Используй сдвиг назад или вперёд.';
    return {
      run,
      consumed: false,
      action,
      longitudinalDelta: 0,
      reason: run.message,
    };
  }

  let longitudinalDelta = 0;
  if (action === 'toggle-lane') {
    run.processingLane = run.processingLane === 'upper' ? 'lower' : 'upper';
    run.message =
      run.processingLane === 'upper'
        ? 'Выбрана верхняя линия.'
        : 'Выбрана нижняя линия.';
  } else {
    longitudinalDelta =
      action === 'shift-forward'
        ? PROCESSING_FORWARD_SHIFT
        : PROCESSING_BACKWARD_SHIFT;
    run.message =
      action === 'shift-forward' ? 'Рывок вперёд.' : 'Смещение назад.';
  }
  run.actionReady = false;
  return {
    run,
    consumed: true,
    action,
    longitudinalDelta,
    reason: run.message,
  };
}

/** Stores or replaces the single saved bonus with one of the current offers. */
export function chooseProcessingBonus(
  source: ConveyorRun,
  bonusId: ProcessingBonusId,
): ProcessingBonusResolution {
  const run = cloneConveyorRun(source);
  if (!run.bonusOffer?.includes(bonusId)) {
    return {
      run,
      activated: false,
      bonusId,
      reason: 'Этот бонус сейчас не предложен.',
    };
  }
  run.storedProcessingBonus = bonusId;
  run.bonusOffer = null;
  run.bonusProgress = 0;
  run.message = `Сохранён бонус «${PROCESSING_BONUS_DATA[bonusId].label}».`;
  return { run, activated: true, bonusId, reason: run.message };
}

/** Keeps the old stored bonus when a fresh two-card offer appears. */
export function dismissProcessingBonusOffer(source: ConveyorRun): ConveyorRun {
  const run = cloneConveyorRun(source);
  run.bonusOffer = null;
  run.bonusProgress = 0;
  run.message = run.storedProcessingBonus
    ? `Сохранён прежний бонус «${PROCESSING_BONUS_DATA[run.storedProcessingBonus].label}».`
    : 'Предложение бонуса пропущено.';
  return run;
}

/** Activates the single stored bonus; machine modifiers wait for zone entry. */
export function activateProcessingBonus(
  source: ConveyorRun,
  now = source.elapsed,
): ProcessingBonusResolution {
  const run = cloneConveyorRun(source);
  const bonusId = run.storedProcessingBonus;
  if (!bonusId) {
    return {
      run,
      activated: false,
      bonusId: null,
      reason: 'Сохранённого бонуса нет.',
    };
  }
  if (
    (bonusId === 'booster' || bonusId === 'damper') &&
    run.nextMachineMultiplier !== 1
  ) {
    return {
      run,
      activated: false,
      bonusId,
      reason: 'Модификатор следующего станка уже заряжен.',
    };
  }

  if (bonusId === 'booster') run.nextMachineMultiplier = 1.75;
  if (bonusId === 'damper') run.nextMachineMultiplier = 0.5;
  if (bonusId === 'boost')
    run.overdriveUntil = now + PROCESSING_BONUS_DURATION_SECONDS;
  if (bonusId === 'slow')
    run.slowUntil = now + PROCESSING_BONUS_DURATION_SECONDS;
  run.storedProcessingBonus = null;
  run.message = PROCESSING_BONUS_DATA[bonusId].activeDetail;
  releaseEarnedBonusOffer(run);
  return { run, activated: true, bonusId, reason: run.message };
}

export function processingTransportMultiplier(
  run: ConveyorRun,
  now = run.elapsed,
) {
  const boost = now < run.overdriveUntil ? 1.55 : 1;
  const slow = now < run.slowUntil ? 0.5 : 1;
  return boost * slow;
}

/** Applies a visible machine transformation and consumes a queued modifier. */
export function applyProcessingMachine(
  source: ConveyorRun,
  machineId: ProcessingMachineId,
  exposure = 1,
): ProcessingMachineResolution {
  const run = cloneConveyorRun(source);
  const effectMultiplier = run.nextMachineMultiplier;
  const application = applyMachineEffect(run.workpiece, machineId, {
    effectMultiplier,
    exposure,
  });
  run.workpiece = application.state;
  run.nextMachineMultiplier = 1;
  run.lastMachineId = machineId;
  run.heat = getProcessingVisualState(run.workpiece).heat01 * 100;
  run.message = `${PROCESSING_BONUS_DATA.booster.label === '' ? '' : ''}${application.state.cracked ? 'Металл треснул' : `Пройден станок «${machineId}»`}.`;
  return {
    run,
    machineId,
    effectMultiplier,
    crackRiskAdded: application.crackRiskAdded,
  };
}

export function setProcessingLevel(
  source: ConveyorRun,
  level: ProcessingLevelId,
): ConveyorRun {
  const run = cloneConveyorRun(source);
  const config = levelConfig(level);
  run.level = level;
  run.factoryProgress = config.startAt;
  run.stageIndex = 0;
  run.stageProgress = 0;
  run.processingLane = 'upper';
  run.processingVariant = 0;
  run.workpiece = createProcessingState();
  run.target = cloneProcessingTarget(processingLevel(level).target);
  run.actionReady = false;
  run.charge = 100;
  run.correctAnswers = 0;
  run.wrongAnswers = 0;
  run.bonusProgress = 0;
  run.bonusOffer = null;
  run.storedProcessingBonus = null;
  run.nextMachineMultiplier = 1;
  run.lastMachineId = null;
  run.slowUntil = 0;
  run.overdriveUntil = 0;
  run.message = `${processingLevel(level).title}: обработай заготовку по допускам.`;
  run.objective = 'Доставь металл в контроль качества';
  return run;
}
