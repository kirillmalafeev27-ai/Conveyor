export const PROCESSING_MACHINE_IDS = [
  'furnace',
  'press',
  'rollers',
  'cooling',
  'cutter',
] as const;

export type ProcessingMachineId = (typeof PROCESSING_MACHINE_IDS)[number];
export type ProcessingLevelId = 1 | 2 | 3 | 4 | 5;
export type ProcessingLane = 'upper' | 'lower';
export type ProcessingAction =
  | 'toggle-lane'
  | 'shift-backward'
  | 'shift-forward';

export const PROCESSING_BONUS_ORDER = [
  'booster',
  'damper',
  'boost',
  'slow',
] as const;

export type ProcessingBonusId = (typeof PROCESSING_BONUS_ORDER)[number];

export type NumericRange = Readonly<{
  min: number;
  max: number;
}>;

/** The dimensions and condition that must be visible on the metal workpiece. */
export type ProcessingState = {
  temperature: number;
  thickness: number;
  width: number;
  length: number;
  crackRisk: number;
  cracked: boolean;
  machineHistory: ProcessingMachineId[];
};

export type ProcessingTarget = {
  temperature: NumericRange;
  thickness: NumericRange;
  width: NumericRange;
  length: NumericRange;
  maxCrackRisk: number;
  rejectCracked: boolean;
};

export type MachineEffect = {
  id: ProcessingMachineId;
  label: string;
  shortLabel: string;
  description: string;
  telegraph: string;
  temperatureDelta?: number;
  thicknessFactor?: number;
  widthFactor?: number;
  lengthFactor?: number;
  lengthDelta?: number;
  coolingTarget?: number;
  coolingFraction?: number;
  coldCrackThreshold?: number;
  coldCrackRisk?: number;
};

export type MachineApplication = {
  state: ProcessingState;
  machineId: ProcessingMachineId;
  effectMultiplier: number;
  exposure: number;
  crackRiskAdded: number;
  visiblyChanged: ReadonlyArray<
    'temperature' | 'thickness' | 'width' | 'length' | 'crackRisk'
  >;
};

export type ProcessingVisualState = {
  heat01: number;
  widthScale: number;
  thicknessScale: number;
  lengthScale: number;
  metalColor: string;
  glow: number;
  crackOpacity: number;
  conditionLabel: string;
};

export type ProcessingQualityReport = {
  complete: boolean;
  score: number;
  matched: Record<
    'temperature' | 'thickness' | 'width' | 'length' | 'crackRisk',
    boolean
  >;
  issues: string[];
};

export type ProcessingLevelPlan = {
  id: string;
  label: string;
  description: string;
  machines: ReadonlyArray<ProcessingMachineId>;
};

export type ProcessingLevel = {
  id: ProcessingLevelId;
  title: string;
  teaches: string;
  unlockedMachines: ReadonlyArray<ProcessingMachineId>;
  forks: 0 | 1 | 2;
  bonusesEnabled: boolean;
  procedural: boolean;
  target: ProcessingTarget;
  viablePlans: ReadonlyArray<ProcessingLevelPlan>;
};

export type GeneratedProcessingSection = {
  id: string;
  machineId: ProcessingMachineId;
  lane: 'both' | ProcessingLane;
  order: number;
  telegraphDistance: number;
};

export type GeneratedProcessingLevel = {
  level: ProcessingLevel;
  sections: ReadonlyArray<GeneratedProcessingSection>;
  viablePlans: ReadonlyArray<ProcessingLevelPlan>;
};

export type FactorySectionKind =
  | 'start'
  | 'clean'
  | 'machine'
  | 'fork'
  | 'merge'
  | 'inspection';

/**
 * Scalar world-space section. Branch sections may overlap in X because only the
 * section matching processingLane is active. This makes camera motion linear
 * and keeps route selection readable.
 */
export type FactorySection = {
  id: string;
  kind: FactorySectionKind;
  start: number;
  end: number;
  label: string;
  lane: 'both' | ProcessingLane;
  machineId?: ProcessingMachineId;
  telegraphStart?: number;
};

export type FactoryFork = {
  id: string;
  decisionStart: number;
  commitAt: number;
  mergeAt: number;
  prepSeconds: number;
  upperLabel: string;
  lowerLabel: string;
};

export type ProcessingLevelConfig = {
  levelId: ProcessingLevelId;
  length: number;
  startAt: number;
  finishAt: number;
  inspectionStart: number;
  baseBeltSpeed: number;
  sections: ReadonlyArray<FactorySection>;
  forks: ReadonlyArray<FactoryFork>;
};

export type FactoryProgress = {
  progress: number;
  stageIndex: number;
  stageProgress: number;
  section: FactorySection | null;
  finished: boolean;
};

export const INITIAL_PROCESSING_STATE: Readonly<ProcessingState> = {
  temperature: 22,
  thickness: 28,
  width: 32,
  length: 46,
  crackRisk: 0,
  cracked: false,
  machineHistory: [],
};

/**
 * Every machine runs this many work cycles while a part passes through it,
 * whatever the zone's length or the belt's speed. A fixed count is what makes a
 * machine readable: the player counts the beats and times the one action they
 * have against them, instead of guessing at a rhythm that free-runs on its own
 * clock.
 */
export const MACHINE_CYCLES_PER_PASSAGE = 3;

/**
 * Where in the passage each cycle does its work: the middle of the cycle, so
 * the beats are evenly spaced and neither the entry nor the exit of the zone
 * lands on one.
 */
export const MACHINE_CYCLE_STAGES: readonly number[] = Array.from(
  { length: MACHINE_CYCLES_PER_PASSAGE },
  (_, index) => (index + 0.5) / MACHINE_CYCLES_PER_PASSAGE,
);

/** Position inside the current cycle, 0..1, for driving an animation. */
export function machineCyclePhase(localProgress: number) {
  const cycles = localProgress * MACHINE_CYCLES_PER_PASSAGE;
  return cycles - Math.floor(cycles);
}

/**
 * How hard the nearest cycle is striking at this point of the passage, 0..1.
 * `width` is the half-length of a strike in passage units.
 */
export function machineCycleStrike(localProgress: number, width: number) {
  let strongest = 0;
  for (const stage of MACHINE_CYCLE_STAGES) {
    const closeness =
      1 - Math.abs(localProgress - stage) / Math.max(1e-6, width);
    if (closeness > strongest) strongest = closeness;
  }
  return Math.max(0, Math.min(1, strongest));
}

export const MACHINE_EFFECTS: Record<ProcessingMachineId, MachineEffect> = {
  furnace: {
    id: 'furnace',
    label: 'Печь',
    shortLabel: 'НАГРЕВ',
    description: 'Раскаляет металл. Горячая заготовка безопаснее под прессом.',
    telegraph: 'Впереди длинная раскалённая камера',
    temperatureDelta: 620,
  },
  press: {
    id: 'press',
    label: 'Пресс',
    shortLabel: 'ДАВЛЕНИЕ',
    description:
      'Уменьшает толщину и увеличивает ширину. Холодный металл может треснуть.',
    telegraph: 'Впереди огромная зона удара пресса',
    temperatureDelta: -30,
    thicknessFactor: 0.68,
    widthFactor: 1.32,
    coldCrackThreshold: 480,
    coldCrackRisk: 72,
  },
  rollers: {
    id: 'rollers',
    label: 'Вальцы',
    shortLabel: 'ПРОКАТ',
    description: 'Вытягивают заготовку и делают её уже.',
    telegraph: 'Впереди длинный коридор вращающихся валов',
    temperatureDelta: -20,
    thicknessFactor: 0.94,
    widthFactor: 0.86,
    lengthFactor: 1.28,
  },
  cooling: {
    id: 'cooling',
    label: 'Охлаждение',
    shortLabel: 'ОХЛАЖДЕНИЕ',
    description: 'Быстро отводит тепло, почти не меняя форму.',
    telegraph: 'Впереди широкая завеса охлаждения',
    coolingTarget: 80,
    coolingFraction: 0.72,
  },
  cutter: {
    id: 'cutter',
    label: 'Резак',
    shortLabel: 'РЕЗ',
    description: 'Укорачивает заготовку на заданную длину.',
    telegraph: 'Впереди поперечная линия реза',
    temperatureDelta: -5,
    lengthDelta: -10,
  },
};

export const PROCESSING_BONUS_DATA: Record<
  ProcessingBonusId,
  {
    label: string;
    detail: string;
    activeDetail: string;
    key: string;
  }
> = {
  booster: {
    label: 'Усилитель',
    detail: 'следующий станок ×1,75',
    activeDetail: 'следующий станок усилен ×1,75',
    key: 'Q',
  },
  damper: {
    label: 'Демпфер',
    detail: 'следующий станок ×0,5',
    activeDetail: 'следующий станок ослаблен ×0,5',
    key: 'E',
  },
  boost: {
    label: 'Разгон',
    detail: 'лента быстрее · 5 сек',
    activeDetail: 'разгон ленты · 5 сек',
    key: 'R',
  },
  slow: {
    label: 'Замедление',
    detail: 'лента медленнее · 5 сек',
    activeDetail: 'лента замедлена · 5 сек',
    key: 'F',
  },
};

const LEVEL_TARGETS: Record<ProcessingLevelId, ProcessingTarget> = {
  1: {
    temperature: { min: 520, max: 720 },
    thickness: { min: 17.5, max: 21 },
    width: { min: 39, max: 45 },
    length: { min: 44, max: 48 },
    maxCrackRisk: 25,
    rejectCracked: true,
  },
  2: {
    temperature: { min: 500, max: 700 },
    thickness: { min: 16.5, max: 20 },
    width: { min: 33, max: 39 },
    length: { min: 55, max: 62 },
    maxCrackRisk: 25,
    rejectCracked: true,
  },
  3: {
    temperature: { min: 150, max: 300 },
    thickness: { min: 16.5, max: 20 },
    width: { min: 33, max: 39 },
    length: { min: 55, max: 62 },
    maxCrackRisk: 25,
    rejectCracked: true,
  },
  4: {
    temperature: { min: 140, max: 300 },
    thickness: { min: 16.5, max: 20 },
    width: { min: 33, max: 39 },
    length: { min: 44, max: 52 },
    maxCrackRisk: 25,
    rejectCracked: true,
  },
  5: {
    temperature: { min: 140, max: 300 },
    thickness: { min: 16.5, max: 20 },
    width: { min: 33, max: 39 },
    length: { min: 44, max: 52 },
    maxCrackRisk: 25,
    rejectCracked: true,
  },
};

const plan = (
  id: string,
  label: string,
  description: string,
  machines: ReadonlyArray<ProcessingMachineId>,
): ProcessingLevelPlan => ({ id, label, description, machines });

export const PROCESSING_LEVELS: Record<ProcessingLevelId, ProcessingLevel> = {
  1: {
    id: 1,
    title: 'Раскалить и сплющить',
    teaches: 'Печь меняет цвет металла; холодный пресс создаёт трещины.',
    unlockedMachines: ['furnace', 'press'],
    forks: 0,
    bonusesEnabled: false,
    procedural: false,
    target: LEVEL_TARGETS[1],
    viablePlans: [
      plan(
        'heat-then-press',
        'Горячая штамповка',
        'Сначала нагреть, затем пройти пресс.',
        ['furnace', 'press'],
      ),
    ],
  },
  2: {
    id: 2,
    title: 'Вытянуть лист',
    teaches: 'Вальцы увеличивают длину, уменьшая ширину.',
    unlockedMachines: ['furnace', 'press', 'rollers'],
    forks: 0,
    bonusesEnabled: false,
    procedural: false,
    target: LEVEL_TARGETS[2],
    viablePlans: [
      plan(
        'press-then-roll',
        'Широкий прокат',
        'Нагреть, сплющить и вытянуть вальцами.',
        ['furnace', 'press', 'rollers'],
      ),
    ],
  },
  3: {
    id: 3,
    title: 'Выбрать порядок',
    teaches: 'Первая развилка и охлаждение закрепляют форму.',
    unlockedMachines: ['furnace', 'press', 'rollers', 'cooling'],
    forks: 1,
    bonusesEnabled: false,
    procedural: false,
    target: LEVEL_TARGETS[3],
    viablePlans: [
      plan(
        'wide-first',
        'Сначала пресс',
        'Печь → пресс → вальцы → охлаждение.',
        ['furnace', 'press', 'rollers', 'cooling'],
      ),
      plan(
        'long-first',
        'Сначала вальцы',
        'Печь → вальцы → пресс → охлаждение.',
        ['furnace', 'rollers', 'press', 'cooling'],
      ),
    ],
  },
  4: {
    id: 4,
    title: 'Управлять линией',
    teaches: 'Две развилки и редкие одноразовые бонусы.',
    unlockedMachines: PROCESSING_MACHINE_IDS,
    forks: 2,
    bonusesEnabled: true,
    procedural: false,
    target: LEVEL_TARGETS[4],
    viablePlans: [
      plan(
        'cut-last',
        'Рез после проката',
        'Печь → пресс → вальцы → охлаждение → резак.',
        ['furnace', 'press', 'rollers', 'cooling', 'cutter'],
      ),
      plan(
        'cut-before-roll',
        'Рез перед прокатом',
        'Печь → пресс → резак → вальцы → охлаждение.',
        ['furnace', 'press', 'cutter', 'rollers', 'cooling'],
      ),
    ],
  },
  5: {
    id: 5,
    title: 'Смена мастера',
    teaches: 'Полная процедурная линия: считывай металл, а не запоминай путь.',
    unlockedMachines: PROCESSING_MACHINE_IDS,
    forks: 2,
    bonusesEnabled: true,
    procedural: true,
    target: LEVEL_TARGETS[5],
    viablePlans: [
      plan(
        'level-five-a',
        'План A',
        'Печь → пресс → вальцы → охлаждение → резак.',
        ['furnace', 'press', 'rollers', 'cooling', 'cutter'],
      ),
      plan(
        'level-five-b',
        'План B',
        'Печь → пресс → резак → вальцы → охлаждение.',
        ['furnace', 'press', 'cutter', 'rollers', 'cooling'],
      ),
    ],
  },
};

const section = (
  id: string,
  kind: FactorySectionKind,
  start: number,
  end: number,
  label: string,
  options: Pick<FactorySection, 'lane' | 'machineId' | 'telegraphStart'> = {
    lane: 'both',
  },
): FactorySection => ({ id, kind, start, end, label, ...options });

/**
 * Exact straight-line layouts used by the camera and renderer. Every fork is
 * announced for 8–12 seconds before commit; the lane at commit selects the
 * active branch automatically. Machine zones are deliberately long enough to
 * be experienced as sections, never as small collision dots.
 */
export const LEVEL_CONFIGS: Record<ProcessingLevelId, ProcessingLevelConfig> = {
  1: {
    levelId: 1,
    length: 64,
    startAt: 0,
    finishAt: 64,
    inspectionStart: 56,
    baseBeltSpeed: 1.55,
    forks: [],
    sections: [
      section('L1-start', 'start', 0, 8, 'Подача'),
      section('L1-furnace', 'machine', 14, 27, 'Печь', {
        lane: 'both',
        machineId: 'furnace',
        telegraphStart: 0,
      }),
      section('L1-clean', 'clean', 27, 35, 'Чистый участок'),
      section('L1-press', 'machine', 35, 49, 'Пресс', {
        lane: 'both',
        machineId: 'press',
        telegraphStart: 19,
      }),
      section('L1-release', 'clean', 49, 56, 'Выход из пресса'),
      section('L1-inspection', 'inspection', 56, 64, 'Контроль качества'),
    ],
  },
  2: {
    levelId: 2,
    length: 86,
    startAt: 0,
    finishAt: 86,
    inspectionStart: 78,
    baseBeltSpeed: 1.6,
    forks: [],
    sections: [
      section('L2-start', 'start', 0, 8, 'Подача'),
      section('L2-furnace', 'machine', 14, 27, 'Печь', {
        lane: 'both',
        machineId: 'furnace',
        telegraphStart: 0,
      }),
      section('L2-clean-a', 'clean', 27, 35, 'Перед прессом'),
      section('L2-press', 'machine', 35, 49, 'Пресс', {
        lane: 'both',
        machineId: 'press',
        telegraphStart: 19,
      }),
      section('L2-clean-b', 'clean', 49, 56, 'Перед вальцами'),
      section('L2-rollers', 'machine', 56, 71, 'Вальцы', {
        lane: 'both',
        machineId: 'rollers',
        telegraphStart: 40,
      }),
      section('L2-release', 'clean', 71, 78, 'Выход из вальцов'),
      section('L2-inspection', 'inspection', 78, 86, 'Контроль качества'),
    ],
  },
  3: {
    levelId: 3,
    length: 108,
    startAt: 0,
    finishAt: 108,
    inspectionStart: 100,
    baseBeltSpeed: 1.65,
    forks: [
      {
        id: 'L3-order-fork',
        decisionStart: 29,
        commitAt: 43,
        mergeAt: 75,
        prepSeconds: 9,
        upperLabel: 'ПРЕСС → ВАЛЬЦЫ',
        lowerLabel: 'ВАЛЬЦЫ → ПРЕСС',
      },
    ],
    sections: [
      section('L3-start', 'start', 0, 7, 'Подача'),
      section('L3-furnace', 'machine', 13, 27, 'Печь', {
        lane: 'both',
        machineId: 'furnace',
        telegraphStart: 0,
      }),
      section('L3-fork', 'fork', 29, 43, 'Выбор порядка обработки'),
      section('L3-upper-press', 'machine', 45, 56, 'Пресс', {
        lane: 'upper',
        machineId: 'press',
        telegraphStart: 29,
      }),
      section('L3-upper-rollers', 'machine', 59, 72, 'Вальцы', {
        lane: 'upper',
        machineId: 'rollers',
        telegraphStart: 48,
      }),
      section('L3-lower-rollers', 'machine', 45, 58, 'Вальцы', {
        lane: 'lower',
        machineId: 'rollers',
        telegraphStart: 29,
      }),
      section('L3-lower-press', 'machine', 61, 72, 'Пресс', {
        lane: 'lower',
        machineId: 'press',
        telegraphStart: 48,
      }),
      section('L3-merge', 'merge', 72, 77, 'Слияние линий'),
      section('L3-clean', 'clean', 77, 82, 'Перед охлаждением'),
      section('L3-cooling', 'machine', 82, 96, 'Охлаждение', {
        lane: 'both',
        machineId: 'cooling',
        telegraphStart: 68,
      }),
      section('L3-release', 'clean', 96, 100, 'Выход'),
      section('L3-inspection', 'inspection', 100, 108, 'Контроль качества'),
    ],
  },
  4: {
    levelId: 4,
    length: 148,
    startAt: 0,
    finishAt: 148,
    inspectionStart: 140,
    baseBeltSpeed: 1.7,
    forks: [
      {
        id: 'L4-order-fork',
        decisionStart: 29,
        commitAt: 43,
        mergeAt: 75,
        prepSeconds: 8,
        upperLabel: 'ПРЕСС → ВАЛЬЦЫ',
        lowerLabel: 'ВАЛЬЦЫ → ПРЕСС',
      },
      {
        id: 'L4-finish-fork',
        decisionStart: 82,
        commitAt: 98,
        mergeAt: 132,
        prepSeconds: 10,
        upperLabel: 'ОХЛАДИТЬ → РЕЗАТЬ',
        lowerLabel: 'РЕЗАТЬ → ОХЛАДИТЬ',
      },
    ],
    sections: [
      section('L4-start', 'start', 0, 7, 'Подача'),
      section('L4-furnace', 'machine', 13, 27, 'Печь', {
        lane: 'both',
        machineId: 'furnace',
        telegraphStart: 0,
      }),
      section('L4-fork-a', 'fork', 29, 43, 'Первая развилка'),
      section('L4-upper-press', 'machine', 45, 56, 'Пресс', {
        lane: 'upper',
        machineId: 'press',
        telegraphStart: 29,
      }),
      section('L4-upper-rollers', 'machine', 59, 72, 'Вальцы', {
        lane: 'upper',
        machineId: 'rollers',
        telegraphStart: 48,
      }),
      section('L4-lower-rollers', 'machine', 45, 58, 'Вальцы', {
        lane: 'lower',
        machineId: 'rollers',
        telegraphStart: 29,
      }),
      section('L4-lower-press', 'machine', 61, 72, 'Пресс', {
        lane: 'lower',
        machineId: 'press',
        telegraphStart: 48,
      }),
      section('L4-merge-a', 'merge', 72, 78, 'Слияние'),
      section('L4-fork-b', 'fork', 82, 98, 'Вторая развилка'),
      section('L4-upper-cooling', 'machine', 100, 112, 'Охлаждение', {
        lane: 'upper',
        machineId: 'cooling',
        telegraphStart: 84,
      }),
      section('L4-upper-cutter', 'machine', 116, 128, 'Резак', {
        lane: 'upper',
        machineId: 'cutter',
        telegraphStart: 102,
      }),
      section('L4-lower-cutter', 'machine', 100, 112, 'Резак', {
        lane: 'lower',
        machineId: 'cutter',
        telegraphStart: 84,
      }),
      section('L4-lower-cooling', 'machine', 116, 128, 'Охлаждение', {
        lane: 'lower',
        machineId: 'cooling',
        telegraphStart: 102,
      }),
      section('L4-merge-b', 'merge', 128, 134, 'Слияние'),
      section('L4-release', 'clean', 134, 140, 'Выход'),
      section('L4-inspection', 'inspection', 140, 148, 'Контроль качества'),
    ],
  },
  5: {
    levelId: 5,
    length: 156,
    startAt: 0,
    finishAt: 156,
    inspectionStart: 148,
    baseBeltSpeed: 1.8,
    forks: [
      {
        id: 'L5-order-fork',
        decisionStart: 31,
        commitAt: 47,
        mergeAt: 81,
        prepSeconds: 9,
        upperLabel: 'ПРЕСС → ВАЛЬЦЫ',
        lowerLabel: 'ВАЛЬЦЫ → ПРЕСС',
      },
      {
        id: 'L5-finish-fork',
        decisionStart: 88,
        commitAt: 104,
        mergeAt: 139,
        prepSeconds: 9,
        upperLabel: 'ОХЛАДИТЬ → РЕЗАТЬ',
        lowerLabel: 'РЕЗАТЬ → ОХЛАДИТЬ',
      },
    ],
    sections: [
      section('L5-start', 'start', 0, 8, 'Подача'),
      section('L5-furnace', 'machine', 14, 29, 'Печь', {
        lane: 'both',
        machineId: 'furnace',
        telegraphStart: 0,
      }),
      section('L5-fork-a', 'fork', 31, 47, 'Первая развилка'),
      section('L5-upper-press', 'machine', 49, 61, 'Пресс', {
        lane: 'upper',
        machineId: 'press',
        telegraphStart: 33,
      }),
      section('L5-upper-rollers', 'machine', 65, 78, 'Вальцы', {
        lane: 'upper',
        machineId: 'rollers',
        telegraphStart: 52,
      }),
      section('L5-lower-rollers', 'machine', 49, 62, 'Вальцы', {
        lane: 'lower',
        machineId: 'rollers',
        telegraphStart: 33,
      }),
      section('L5-lower-press', 'machine', 66, 78, 'Пресс', {
        lane: 'lower',
        machineId: 'press',
        telegraphStart: 52,
      }),
      section('L5-merge-a', 'merge', 78, 84, 'Слияние'),
      section('L5-fork-b', 'fork', 88, 104, 'Вторая развилка'),
      section('L5-upper-cooling', 'machine', 106, 119, 'Охлаждение', {
        lane: 'upper',
        machineId: 'cooling',
        telegraphStart: 90,
      }),
      section('L5-upper-cutter', 'machine', 123, 135, 'Резак', {
        lane: 'upper',
        machineId: 'cutter',
        telegraphStart: 109,
      }),
      section('L5-lower-cutter', 'machine', 106, 118, 'Резак', {
        lane: 'lower',
        machineId: 'cutter',
        telegraphStart: 90,
      }),
      section('L5-lower-cooling', 'machine', 122, 135, 'Охлаждение', {
        lane: 'lower',
        machineId: 'cooling',
        telegraphStart: 108,
      }),
      section('L5-merge-b', 'merge', 135, 141, 'Слияние'),
      section('L5-release', 'clean', 141, 148, 'Выход'),
      section('L5-inspection', 'inspection', 148, 156, 'Контроль качества'),
    ],
  },
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const round = (value: number) => Math.round(value * 100) / 100;

export function createProcessingState(
  overrides: Partial<Omit<ProcessingState, 'machineHistory'>> & {
    machineHistory?: ReadonlyArray<ProcessingMachineId>;
  } = {},
): ProcessingState {
  return {
    ...INITIAL_PROCESSING_STATE,
    ...overrides,
    machineHistory: [...(overrides.machineHistory ?? [])],
  };
}

export function cloneProcessingTarget(
  target: ProcessingTarget,
): ProcessingTarget {
  return {
    temperature: { ...target.temperature },
    thickness: { ...target.thickness },
    width: { ...target.width },
    length: { ...target.length },
    maxCrackRisk: target.maxCrackRisk,
    rejectCracked: target.rejectCracked,
  };
}

function factorForExposure(factor: number | undefined, exposure: number) {
  return factor === undefined ? 1 : Math.pow(factor, exposure);
}

/**
 * Pure workpiece transformation. The modifier scales exposure, so ×1.75 makes
 * a machine stronger without incorrectly multiplying the final dimensions.
 */
export function applyMachineEffect(
  source: ProcessingState,
  machineId: ProcessingMachineId,
  options: { effectMultiplier?: number; exposure?: number } = {},
): MachineApplication {
  const effect = MACHINE_EFFECTS[machineId];
  const effectMultiplier = clamp(options.effectMultiplier ?? 1, 0.1, 2);
  const exposure = clamp(options.exposure ?? 1, 0, 1.5);
  const strength = effectMultiplier * exposure;
  const next = createProcessingState(source);
  const visiblyChanged: MachineApplication['visiblyChanged'][number][] = [];

  if (effect.temperatureDelta !== undefined) {
    next.temperature = clamp(
      next.temperature + effect.temperatureDelta * strength,
      0,
      1100,
    );
    visiblyChanged.push('temperature');
  }
  if (
    effect.coolingFraction !== undefined &&
    effect.coolingTarget !== undefined
  ) {
    if (next.temperature > effect.coolingTarget) {
      const remainingHeat = Math.pow(1 - effect.coolingFraction, strength);
      next.temperature =
        effect.coolingTarget +
        (next.temperature - effect.coolingTarget) * remainingHeat;
    }
    visiblyChanged.push('temperature');
  }
  if (effect.thicknessFactor !== undefined) {
    next.thickness *= factorForExposure(effect.thicknessFactor, strength);
    visiblyChanged.push('thickness');
  }
  if (effect.widthFactor !== undefined) {
    next.width *= factorForExposure(effect.widthFactor, strength);
    visiblyChanged.push('width');
  }
  if (effect.lengthFactor !== undefined) {
    next.length *= factorForExposure(effect.lengthFactor, strength);
    visiblyChanged.push('length');
  }
  if (effect.lengthDelta !== undefined) {
    next.length = Math.max(8, next.length + effect.lengthDelta * strength);
    visiblyChanged.push('length');
  }

  let crackRiskAdded = 0;
  if (
    effect.coldCrackThreshold !== undefined &&
    effect.coldCrackRisk !== undefined
  ) {
    const coldness = clamp(
      (effect.coldCrackThreshold - source.temperature) /
        effect.coldCrackThreshold,
      0,
      1,
    );
    crackRiskAdded = effect.coldCrackRisk * coldness * strength;
    if (crackRiskAdded > 0) {
      next.crackRisk = clamp(next.crackRisk + crackRiskAdded, 0, 100);
      visiblyChanged.push('crackRisk');
    }
  }

  next.temperature = round(next.temperature);
  next.thickness = round(next.thickness);
  next.width = round(next.width);
  next.length = round(next.length);
  next.crackRisk = round(next.crackRisk);
  next.cracked = next.cracked || next.crackRisk >= 70;
  next.machineHistory.push(machineId);

  return {
    state: next,
    machineId,
    effectMultiplier,
    exposure,
    crackRiskAdded: round(crackRiskAdded),
    visiblyChanged: [...new Set(visiblyChanged)],
  };
}

const inRange = (value: number, range: NumericRange) =>
  value >= range.min && value <= range.max;

export type ProcessingRequirementKey =
  | 'temperature'
  | 'thickness'
  | 'width'
  | 'length'
  | 'crackRisk';

/**
 * One line of the level's acceptance spec: the window a measurement has to land
 * in, where it sits right now, and both of those in words. The panel draws its
 * scales and prints its wording from this, so a target change cannot leave the
 * two disagreeing.
 */
export type ProcessingRequirement = {
  key: ProcessingRequirementKey;
  label: string;
  unit: string;
  range: NumericRange;
  value: number;
  /** The current value, already formatted for display with its unit. */
  valueText: string;
  met: boolean;
  /** What has to be achieved, as an instruction. */
  demand: string;
  /** What is wrong right now; empty once the measurement is in the window. */
  correction: string;
};

function formatMeasure(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatRange(range: NumericRange, unit: string) {
  return `${formatMeasure(range.min)}–${formatMeasure(range.max)} ${unit}`;
}

export function describeProcessingRequirements(
  state: ProcessingState,
  target: ProcessingTarget,
): ProcessingRequirement[] {
  const dimension = (
    key: Exclude<ProcessingRequirementKey, 'crackRisk'>,
    label: string,
    unit: string,
    demandVerb: string,
    tooLow: string,
    tooHigh: string,
  ): ProcessingRequirement => {
    const range = target[key];
    const value = state[key];
    return {
      key,
      label,
      unit,
      range,
      value,
      valueText: `${formatMeasure(value)} ${unit}`,
      met: inRange(value, range),
      demand: `${demandVerb} ${formatRange(range, unit)}`,
      correction: value < range.min ? tooLow : value > range.max ? tooHigh : '',
    };
  };

  const crackRange: NumericRange = { min: 0, max: target.maxCrackRisk };
  const crackMet =
    state.crackRisk <= target.maxCrackRisk &&
    (!target.rejectCracked || !state.cracked);

  return [
    dimension(
      'temperature',
      'Температура',
      '°C',
      'Разогреть до',
      'холодная — дольше в печи',
      'перегрета — нужно охлаждение',
    ),
    dimension(
      'thickness',
      'Толщина',
      'мм',
      'Сплющить до',
      'перепрессована — тоньше допуска',
      'толстая — нужен удар пресса',
    ),
    dimension(
      'width',
      'Ширина',
      'мм',
      'Раскатать в ширину',
      'узкая — нужен пресс',
      'широкая — развело сверх допуска',
    ),
    dimension(
      'length',
      'Длина',
      'мм',
      'Вытянуть в длину',
      'короткая — нужны вальцы',
      'длинная — под резак',
    ),
    {
      key: 'crackRisk',
      label: 'Трещины',
      unit: '%',
      range: crackRange,
      value: state.crackRisk,
      valueText: `${formatMeasure(state.crackRisk)} %`,
      met: crackMet,
      demand: `Удержать риск трещин до ${formatMeasure(target.maxCrackRisk)} %`,
      correction: state.cracked
        ? 'трещина пошла — деталь уже брак'
        : state.crackRisk > target.maxCrackRisk
          ? 'риск выше допуска — не бей по холодному'
          : '',
    },
  ];
}

export function evaluateProcessingState(
  state: ProcessingState,
  target: ProcessingTarget,
): ProcessingQualityReport {
  const matched = {
    temperature: inRange(state.temperature, target.temperature),
    thickness: inRange(state.thickness, target.thickness),
    width: inRange(state.width, target.width),
    length: inRange(state.length, target.length),
    crackRisk:
      state.crackRisk <= target.maxCrackRisk &&
      (!target.rejectCracked || !state.cracked),
  };
  const issues: string[] = [];
  if (!matched.temperature) issues.push('температура вне допуска');
  if (!matched.thickness) issues.push('толщина вне допуска');
  if (!matched.width) issues.push('ширина вне допуска');
  if (!matched.length) issues.push('длина вне допуска');
  if (!matched.crackRisk) issues.push('риск трещин слишком высок');
  const matchedCount = Object.values(matched).filter(Boolean).length;
  return {
    complete: matchedCount === Object.keys(matched).length,
    score: Math.round((matchedCount / Object.keys(matched).length) * 100),
    matched,
    issues,
  };
}

function mix(from: number, to: number, amount: number) {
  return Math.round(from + (to - from) * amount);
}

function colorForHeat(heat01: number) {
  const amount = clamp(heat01, 0, 1);
  const cold = [105, 122, 132];
  const hot = [255, 103, 35];
  const rgb = cold.map((channel, index) => mix(channel, hot[index], amount));
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function getProcessingVisualState(
  state: ProcessingState,
): ProcessingVisualState {
  const heat01 = clamp((state.temperature - 80) / 720, 0, 1);
  return {
    heat01,
    widthScale: state.width / INITIAL_PROCESSING_STATE.width,
    thicknessScale: state.thickness / INITIAL_PROCESSING_STATE.thickness,
    lengthScale: state.length / INITIAL_PROCESSING_STATE.length,
    metalColor: colorForHeat(heat01),
    glow: clamp((state.temperature - 420) / 380, 0, 1),
    crackOpacity: clamp(state.crackRisk / 70, 0, 1),
    conditionLabel: state.cracked
      ? 'ТРЕЩИНА'
      : state.crackRisk >= 45
        ? 'ХРУПКО'
        : state.temperature >= 480
          ? 'ПЛАСТИЧНО'
          : 'ХОЛОДНО',
  };
}

/** Small deterministic generator; every L5 layout keeps both certified plans. */
export function generateProcessingLevel(
  levelId: ProcessingLevelId,
  seed = 1,
): GeneratedProcessingLevel {
  const level = PROCESSING_LEVELS[levelId];
  const plans = level.viablePlans;
  const selectedPlan = plans[Math.abs(Math.trunc(seed)) % plans.length];
  const sections: GeneratedProcessingSection[] = selectedPlan.machines.map(
    (machineId, index) => ({
      id: `L${levelId}-${index + 1}-${machineId}`,
      machineId,
      lane:
        level.forks === 0 ||
        index === 0 ||
        index === selectedPlan.machines.length - 1
          ? 'both'
          : (index + Math.abs(Math.trunc(seed))) % 2 === 0
            ? 'upper'
            : 'lower',
      order: index,
      telegraphDistance: machineId === 'press' ? 16 : 11,
    }),
  );
  return { level, sections, viablePlans: plans };
}

export function simulateProcessingPlan(
  machines: ReadonlyArray<ProcessingMachineId>,
  initialState: ProcessingState = createProcessingState(),
) {
  return machines.reduce(
    (state, machineId) => applyMachineEffect(state, machineId).state,
    createProcessingState(initialState),
  );
}
