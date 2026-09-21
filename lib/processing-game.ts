export const PROCESSING_MACHINE_IDS = [
  // The five the tutorial levels are built on.
  'furnace',
  'press',
  'rollers',
  'cooling',
  'cutter',
  // Unlocked past the tutorial run: these reach the shape properties the first
  // five machines cannot touch at all.
  'hammer',
  'upsetter',
  'trimmer',
  'bender',
  'straightener',
  'punch',
  'polisher',
  'quench',
] as const;

export type ProcessingMachineId = (typeof PROCESSING_MACHINE_IDS)[number];

/**
 * Levels run without an upper bound: the hand-authored ones are numbered first
 * and everything past them is generated. See TUTORIAL_LEVEL_COUNT.
 */
export type ProcessingLevelId = number;
export type ProcessingLane = 'upper' | 'lower';
export type ProcessingAction =
  | 'toggle-lane'
  | 'shift-backward'
  | 'shift-forward'
  /**
   * Sends the part round the return conveyor to the last fork. Without it a
   * branch taken by mistake — or a decision the belt carried the player past —
   * is unrecoverable, because a committed lane cannot be switched and the line
   * only runs forwards.
   */
  | 'recirculate';

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
  /** Angle the part is bent to, in degrees. 0 is flat stock. */
  bend: number;
  /** Punched holes, counted. */
  holes: number;
  /** Surface finish, 0 is as-rolled scale and 100 is mirror. */
  polish: number;
  crackRisk: number;
  cracked: boolean;
  machineHistory: ProcessingMachineId[];
};

/**
 * The acceptance spec. Only the properties a level actually cares about are
 * listed: an order for flat stock simply never mentions a bend, so neither the
 * grader nor the panel invents a requirement for one.
 */
export type ProcessingTarget = {
  temperature: NumericRange;
  thickness: NumericRange;
  width: NumericRange;
  length: NumericRange;
  bend?: NumericRange;
  holes?: NumericRange;
  polish?: NumericRange;
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
  bendDelta?: number;
  /** Pulls the bend back towards flat by this fraction of what is there. */
  bendRelief?: number;
  holesDelta?: number;
  polishDelta?: number;
  /** Takes this much crack risk back out of the metal. */
  crackRelief?: number;
};

export type MachineApplication = {
  state: ProcessingState;
  machineId: ProcessingMachineId;
  effectMultiplier: number;
  exposure: number;
  crackRiskAdded: number;
  visiblyChanged: ReadonlyArray<
    | 'temperature'
    | 'thickness'
    | 'width'
    | 'length'
    | 'bend'
    | 'holes'
    | 'polish'
    | 'crackRisk'
  >;
};

export type ProcessingVisualState = {
  heat01: number;
  widthScale: number;
  thicknessScale: number;
  lengthScale: number;
  bendDegrees: number;
  holes: number;
  polish01: number;
  metalColor: string;
  glow: number;
  crackOpacity: number;
  conditionLabel: string;
};

export type ProcessingQualityReport = {
  complete: boolean;
  score: number;
  /** Only the properties the target actually asked for appear here. */
  matched: Partial<Record<ProcessingRequirementKey, boolean>>;
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
  forks: number;
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
  /**
   * Where the return conveyor picks the part up. Inside this stretch the player
   * can spend their action to run the fork again, which is the way out of a
   * branch that turned out to be the wrong one.
   */
  returnStart: number;
  returnEnd: number;
  /** Which lane carries the machine; the other one is a clean bypass. */
  machineLane: ProcessingLane;
  machineId: ProcessingMachineId;
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
  bend: 0,
  holes: 0,
  polish: 12,
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
  hammer: {
    id: 'hammer',
    label: 'Молот',
    shortLabel: 'КОВКА',
    description:
      'Бьёт узко и глубоко: сильно уменьшает толщину и вытягивает в длину.',
    telegraph: 'Впереди ковочный молот',
    temperatureDelta: -45,
    thicknessFactor: 0.58,
    lengthFactor: 1.22,
    widthFactor: 1.08,
    coldCrackThreshold: 540,
    coldCrackRisk: 86,
  },
  upsetter: {
    id: 'upsetter',
    label: 'Осадка',
    shortLabel: 'ОСАДКА',
    description: 'Сжимает вдоль: заготовка становится короче и толще.',
    telegraph: 'Впереди осадочная машина',
    temperatureDelta: -25,
    thicknessFactor: 1.34,
    lengthFactor: 0.78,
    coldCrackThreshold: 500,
    coldCrackRisk: 58,
  },
  trimmer: {
    id: 'trimmer',
    label: 'Обрезка кромки',
    shortLabel: 'КРОМКА',
    description: 'Срезает боковой облой — заготовка становится уже.',
    telegraph: 'Впереди кромкообрезные ножи',
    temperatureDelta: -10,
    widthFactor: 0.79,
  },
  bender: {
    id: 'bender',
    label: 'Гибочный',
    shortLabel: 'ГИБКА',
    description: 'Загибает заготовку на угол. Холодная гибка даёт трещины.',
    telegraph: 'Впереди гибочный пресс',
    temperatureDelta: -15,
    bendDelta: 32,
    coldCrackThreshold: 460,
    coldCrackRisk: 52,
  },
  straightener: {
    id: 'straightener',
    label: 'Правка',
    shortLabel: 'ПРАВКА',
    description: 'Выправляет изгиб и снимает часть напряжений.',
    telegraph: 'Впереди правильная машина',
    temperatureDelta: -12,
    bendRelief: 0.72,
    crackRelief: 18,
  },
  punch: {
    id: 'punch',
    label: 'Пробивной',
    shortLabel: 'ПРОБИВКА',
    description: 'Пробивает отверстия. По холодному металлу рискованно.',
    telegraph: 'Впереди пробивной штамп',
    temperatureDelta: -18,
    holesDelta: 2,
    coldCrackThreshold: 420,
    coldCrackRisk: 40,
  },
  polisher: {
    id: 'polisher',
    label: 'Шлифовка',
    shortLabel: 'ШЛИФ',
    description: 'Снимает окалину: поверхность чище, толщина чуть меньше.',
    telegraph: 'Впереди шлифовальная линия',
    temperatureDelta: -30,
    thicknessFactor: 0.97,
    polishDelta: 38,
  },
  quench: {
    id: 'quench',
    label: 'Закалка',
    shortLabel: 'ЗАКАЛКА',
    description:
      'Резко сбрасывает температуру. Быстрее охлаждения, но металл грубеет.',
    telegraph: 'Впереди закалочный бак',
    coolingTarget: 40,
    coolingFraction: 0.93,
    polishDelta: -14,
    crackRelief: -12,
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
    ...(target.bend ? { bend: { ...target.bend } } : {}),
    ...(target.holes ? { holes: { ...target.holes } } : {}),
    ...(target.polish ? { polish: { ...target.polish } } : {}),
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

  if (effect.bendDelta !== undefined) {
    next.bend = clamp(next.bend + effect.bendDelta * strength, 0, 150);
    visiblyChanged.push('bend');
  }
  if (effect.bendRelief !== undefined) {
    next.bend = Math.max(
      0,
      next.bend * Math.pow(1 - clamp(effect.bendRelief, 0, 1), strength),
    );
    visiblyChanged.push('bend');
  }
  if (effect.holesDelta !== undefined) {
    // Holes are countable, so a partial pass either punches one or does not.
    next.holes = Math.max(
      0,
      next.holes + Math.round(effect.holesDelta * strength),
    );
    visiblyChanged.push('holes');
  }
  if (effect.polishDelta !== undefined) {
    next.polish = clamp(next.polish + effect.polishDelta * strength, 0, 100);
    visiblyChanged.push('polish');
  }

  let crackRiskAdded = 0;
  if (effect.crackRelief !== undefined) {
    // A negative relief is a machine that roughs the metal up instead.
    next.crackRisk = clamp(
      next.crackRisk - effect.crackRelief * strength,
      0,
      100,
    );
    crackRiskAdded = -effect.crackRelief * strength;
    visiblyChanged.push('crackRisk');
  }
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
    crackRiskAdded += effect.coldCrackRisk * coldness * strength;
    if (effect.coldCrackRisk * coldness * strength > 0) {
      next.crackRisk = clamp(next.crackRisk + crackRiskAdded, 0, 100);
      visiblyChanged.push('crackRisk');
    }
  }

  next.temperature = round(next.temperature);
  next.thickness = round(next.thickness);
  next.width = round(next.width);
  next.length = round(next.length);
  next.bend = round(next.bend);
  next.polish = round(next.polish);
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
  | 'bend'
  | 'holes'
  | 'polish'
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
  return range.min === range.max
    ? `${formatMeasure(range.min)} ${unit}`
    : `${formatMeasure(range.min)}–${formatMeasure(range.max)} ${unit}`;
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
    explicitRange?: NumericRange,
  ): ProcessingRequirement => {
    const range = explicitRange ?? (target[key] as NumericRange);
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

  const optional: ProcessingRequirement[] = [];
  if (target.bend) {
    optional.push(
      dimension(
        'bend',
        'Изгиб',
        '°',
        'Загнуть на',
        'недогнута — ещё раз в гибочный',
        'перегнута — нужна правка',
        target.bend,
      ),
    );
  }
  if (target.holes) {
    optional.push(
      dimension(
        'holes',
        'Отверстия',
        'шт',
        'Пробить',
        'отверстий не хватает',
        'отверстий больше нормы',
        target.holes,
      ),
    );
  }
  if (target.polish) {
    optional.push(
      dimension(
        'polish',
        'Поверхность',
        '%',
        'Довести чистоту до',
        'окалина — нужна шлифовка',
        'перешлифована',
        target.polish,
      ),
    );
  }

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
    ...optional,
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
  // The spec drives both the grade and the panel, so a property the level never
  // asked for is simply absent from both.
  const requirements = describeProcessingRequirements(state, target);
  const matched = {} as ProcessingQualityReport['matched'];
  const issues: string[] = [];
  for (const requirement of requirements) {
    matched[requirement.key] = requirement.met;
    if (!requirement.met) {
      issues.push(
        `${requirement.label.toLocaleLowerCase('ru-RU')}: ${requirement.correction}`,
      );
    }
  }
  const matchedCount = requirements.filter(
    (requirement) => requirement.met,
  ).length;
  return {
    complete: matchedCount === requirements.length,
    score: Math.round((matchedCount / Math.max(1, requirements.length)) * 100),
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
    bendDegrees: state.bend,
    holes: state.holes,
    polish01: clamp(state.polish / 100, 0, 1),
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

/* ------------------------------------------------------------------ *
 * Procedural shifts
 *
 * Past the tutorial run the factory is built rather than authored. A shift is
 * generated from a recipe: pick a plan the roster can actually execute, lay the
 * line out around it, and derive the acceptance spec by simulating that plan —
 * so a generated order is solvable by construction, never by luck.
 *
 * Every fork offers one machine against one bypass. That keeps the choice
 * readable (enter the machine, or run past it) and it is what makes the return
 * loop a complete repair: a bypass leaves the metal untouched, so coming back
 * round and entering the machine costs time and nothing else.
 * ------------------------------------------------------------------ */

/** Levels up to this number are hand-tuned lessons; past it, everything is generated. */
export const TUTORIAL_LEVEL_COUNT = 9;

/** Deterministic PRNG, so a level id always rebuilds the exact same shift. */
function makeRandom(seed: number) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

type LevelRecipe = {
  title: string;
  teaches: string;
  /** Machines that run on the main line, before any choice is offered. */
  opening: ReadonlyArray<ProcessingMachineId>;
  /** Machines offered at a fork, each against a bypass. */
  choices: ReadonlyArray<ProcessingMachineId>;
  /** Which of those choices the order actually needs; the rest are bypassed. */
  needed: ReadonlyArray<ProcessingMachineId>;
  bonusesEnabled: boolean;
  procedural: boolean;
};

const TUTORIAL_RECIPES: Record<number, LevelRecipe> = {
  1: {
    title: 'Раскалить и сплющить',
    teaches: 'Печь меняет цвет металла; холодный пресс создаёт трещины.',
    opening: ['furnace', 'press'],
    choices: [],
    needed: [],
    bonusesEnabled: false,
    procedural: false,
  },
  2: {
    title: 'Вытянуть лист',
    teaches: 'Вальцы увеличивают длину, уменьшая ширину.',
    opening: ['furnace', 'press', 'rollers'],
    choices: [],
    needed: [],
    bonusesEnabled: false,
    procedural: false,
  },
  3: {
    title: 'Войти или пройти мимо',
    teaches:
      'На развилке один станок против обвода: входи, только если он нужен.',
    opening: ['furnace', 'press'],
    choices: ['rollers', 'cooling'],
    needed: ['cooling'],
    bonusesEnabled: false,
    procedural: false,
  },
  4: {
    title: 'Две развилки подряд',
    teaches: 'Спецификация слева говорит, в какую ветку заходить.',
    opening: ['furnace', 'press'],
    choices: ['rollers', 'cutter'],
    needed: ['rollers', 'cutter'],
    bonusesEnabled: true,
    procedural: false,
  },
  5: {
    title: 'Смена мастера',
    teaches:
      'Полная линия из пяти станков: считывай металл, а не запоминай путь.',
    opening: ['furnace', 'press'],
    choices: ['rollers', 'cooling', 'cutter'],
    needed: ['rollers', 'cooling'],
    bonusesEnabled: true,
    procedural: false,
  },
  6: {
    title: 'Ковка и осадка',
    teaches: 'Молот тянет и утончает, осадка делает короче и толще.',
    opening: ['furnace'],
    choices: ['hammer', 'upsetter', 'cooling'],
    needed: ['hammer', 'cooling'],
    bonusesEnabled: true,
    procedural: false,
  },
  7: {
    title: 'Гибка и правка',
    teaches: 'Появился угол изгиба. Гибочный задаёт его, правка убирает.',
    opening: ['furnace', 'press'],
    choices: ['bender', 'straightener', 'cooling'],
    needed: ['bender', 'cooling'],
    bonusesEnabled: true,
    procedural: false,
  },
  8: {
    title: 'Отверстия и кромка',
    teaches:
      'Пробивной штамп считает отверстия, обрезка снимает лишнюю ширину.',
    opening: ['furnace', 'press'],
    choices: ['punch', 'trimmer', 'cooling'],
    needed: ['punch', 'trimmer'],
    bonusesEnabled: true,
    procedural: false,
  },
  9: {
    title: 'Чистота и закалка',
    teaches:
      'Шлифовка поднимает чистоту, закалка сбрасывает тепло и грубит металл.',
    opening: ['furnace', 'press'],
    choices: ['polisher', 'quench', 'trimmer'],
    needed: ['polisher', 'quench'],
    bonusesEnabled: true,
    procedural: false,
  },
};

/** Machines a generated shift may hand out, with the opening heat kept separate. */
const GENERATED_CHOICE_MACHINES: ReadonlyArray<ProcessingMachineId> = [
  'press',
  'rollers',
  'cutter',
  'cooling',
  'hammer',
  'upsetter',
  'trimmer',
  'bender',
  'straightener',
  'punch',
  'polisher',
  'quench',
];

function pickDistinct<T>(
  pool: ReadonlyArray<T>,
  count: number,
  random: () => number,
): T[] {
  const remaining = [...pool];
  const picked: T[] = [];
  while (picked.length < count && remaining.length) {
    picked.push(
      remaining.splice(Math.floor(random() * remaining.length), 1)[0],
    );
  }
  return picked;
}

function proceduralRecipe(levelId: number, random: () => number): LevelRecipe {
  const beyond = levelId - TUTORIAL_LEVEL_COUNT;
  const choiceCount = clamp(2 + Math.floor(beyond / 3), 2, 4);
  const choices = pickDistinct(GENERATED_CHOICE_MACHINES, choiceCount, random);
  // At least one branch is entered and at least one is bypassed, or the fork
  // would not be a decision at all.
  const neededCount = clamp(
    1 + Math.floor(random() * (choices.length - 1)),
    1,
    choices.length - 1,
  );
  return {
    title: `Смена ${levelId}`,
    teaches: 'Линия собрана заново: читай спецификацию слева.',
    opening: ['furnace'],
    choices,
    needed: choices.slice(0, neededCount),
    bonusesEnabled: true,
    procedural: true,
  };
}

function recipeFor(levelId: number, random: () => number): LevelRecipe {
  return TUTORIAL_RECIPES[levelId] ?? proceduralRecipe(levelId, random);
}

/**
 * Widen a measured value into an acceptance window. The tolerance is relative
 * so a 600 °C reading and a 2 mm one both get a window a player can hit.
 */
function windowAround(value: number, fraction: number, floor: number) {
  const half = Math.max(Math.abs(value) * fraction, floor);
  return { min: round(value - half), max: round(value + half) };
}

/** The spec of a finished part, derived from the plan that produced it. */
export function targetFromPlan(
  machines: ReadonlyArray<ProcessingMachineId>,
  options: {
    requireBend?: boolean;
    requireHoles?: boolean;
    requirePolish?: boolean;
  } = {},
): ProcessingTarget {
  const finished = simulateProcessingPlan(machines);
  const touched = new Set(machines);
  const shapesBend =
    options.requireBend ??
    (touched.has('bender') || touched.has('straightener'));
  const punches = options.requireHoles ?? touched.has('punch');
  const finishes =
    options.requirePolish ?? (touched.has('polisher') || touched.has('quench'));
  return {
    temperature: windowAround(finished.temperature, 0.16, 45),
    thickness: windowAround(finished.thickness, 0.1, 1.2),
    width: windowAround(finished.width, 0.09, 1.5),
    length: windowAround(finished.length, 0.07, 1.5),
    ...(shapesBend
      ? { bend: windowAround(Math.max(finished.bend, 0), 0.2, 6) }
      : {}),
    ...(punches ? { holes: { min: finished.holes, max: finished.holes } } : {}),
    ...(finishes ? { polish: windowAround(finished.polish, 0.22, 8) } : {}),
    maxCrackRisk: Math.max(25, Math.ceil(finished.crackRisk + 12)),
    rejectCracked: true,
  };
}

const BYPASS_LABEL = 'ОБВОД';

/** Zone lengths, tuned so one forward shift always clears a machine's beats. */
const MACHINE_ZONE = 12;
const OPENING_GAP = 6;
const FORK_DECISION = 16;
const BRANCH_GAP = 3;
const RETURN_RUN = 10;

export type BuiltProcessingLevel = {
  level: ProcessingLevel;
  config: ProcessingLevelConfig;
};

function buildLevel(levelId: number): BuiltProcessingLevel {
  const random = makeRandom(levelId * 2654435761);
  const recipe = recipeFor(levelId, random);
  const sections: FactorySection[] = [];
  const forks: FactoryFork[] = [];
  const plan: ProcessingMachineId[] = [];

  let cursor = 0;
  sections.push(section(`L${levelId}-start`, 'start', 0, 8, 'Подача'));
  cursor = 8;

  for (const [index, machineId] of recipe.opening.entries()) {
    const start = cursor + OPENING_GAP;
    const end = start + MACHINE_ZONE + 2;
    sections.push(
      section(
        `L${levelId}-open-${index}-${machineId}`,
        'machine',
        start,
        end,
        MACHINE_EFFECTS[machineId].label,
        {
          lane: 'both',
          machineId,
          telegraphStart: Math.max(0, start - 14),
        },
      ),
    );
    plan.push(machineId);
    cursor = end;
  }

  const needed = new Set(recipe.needed);
  for (const [index, machineId] of recipe.choices.entries()) {
    const decisionStart = cursor + OPENING_GAP;
    const commitAt = decisionStart + FORK_DECISION;
    const branchStart = commitAt + BRANCH_GAP;
    const branchEnd = branchStart + MACHINE_ZONE;
    const mergeAt = branchEnd + BRANCH_GAP;
    const machineLane: ProcessingLane = random() < 0.5 ? 'upper' : 'lower';
    const bypassLane: ProcessingLane =
      machineLane === 'upper' ? 'lower' : 'upper';
    const forkId = `L${levelId}-fork-${index}`;

    sections.push(
      section(forkId, 'fork', decisionStart, commitAt, 'Развилка'),
      // Exactly one machine on the branch, and nothing at all on the other.
      section(
        `${forkId}-machine`,
        'machine',
        branchStart,
        branchEnd,
        MACHINE_EFFECTS[machineId].label,
        {
          lane: machineLane,
          machineId,
          telegraphStart: decisionStart,
        },
      ),
      section(
        `${forkId}-bypass`,
        'clean',
        branchStart,
        branchEnd,
        BYPASS_LABEL,
        {
          lane: bypassLane,
        },
      ),
      section(`${forkId}-merge`, 'merge', branchEnd, mergeAt, 'Слияние'),
    );

    forks.push({
      id: forkId,
      decisionStart,
      commitAt,
      mergeAt,
      prepSeconds: 9,
      upperLabel:
        machineLane === 'upper'
          ? MACHINE_EFFECTS[machineId].shortLabel
          : BYPASS_LABEL,
      lowerLabel:
        machineLane === 'lower'
          ? MACHINE_EFFECTS[machineId].shortLabel
          : BYPASS_LABEL,
      returnStart: mergeAt,
      returnEnd: mergeAt + RETURN_RUN,
      machineLane,
      machineId,
    });

    if (needed.has(machineId)) plan.push(machineId);
    cursor = mergeAt + RETURN_RUN;
  }

  const releaseEnd = cursor + 7;
  const inspectionEnd = releaseEnd + 8;
  sections.push(
    section(`L${levelId}-release`, 'clean', cursor, releaseEnd, 'Выход'),
    section(
      `L${levelId}-inspection`,
      'inspection',
      releaseEnd,
      inspectionEnd,
      'Контроль качества',
    ),
  );

  const level: ProcessingLevel = {
    id: levelId,
    title: recipe.title,
    teaches: recipe.teaches,
    unlockedMachines: [...new Set([...recipe.opening, ...recipe.choices])],
    forks: recipe.choices.length,
    bonusesEnabled: recipe.bonusesEnabled,
    procedural: recipe.procedural,
    target: targetFromPlan(plan),
    viablePlans: [
      {
        id: `L${levelId}-plan`,
        label: 'Маршрут смены',
        description: plan
          .map((machineId) => MACHINE_EFFECTS[machineId].label)
          .join(' → '),
        machines: plan,
      },
    ],
  };

  return {
    level,
    config: {
      levelId,
      length: inspectionEnd,
      startAt: 0,
      finishAt: inspectionEnd,
      inspectionStart: releaseEnd,
      baseBeltSpeed: 1.5 + Math.min(0.5, levelId * 0.05),
      sections,
      forks,
    },
  };
}

const builtLevels = new Map<number, BuiltProcessingLevel>();

function builtLevel(levelId: ProcessingLevelId): BuiltProcessingLevel {
  const id = Math.max(1, Math.trunc(levelId) || 1);
  let built = builtLevels.get(id);
  if (!built) {
    built = buildLevel(id);
    builtLevels.set(id, built);
  }
  return built;
}

export function processingLevel(levelId: ProcessingLevelId): ProcessingLevel {
  return builtLevel(levelId).level;
}

export function levelConfig(levelId: ProcessingLevelId): ProcessingLevelConfig {
  return builtLevel(levelId).config;
}

/** The fork whose return conveyor currently has the part, if any. */
export function returnableFork(
  levelId: ProcessingLevelId,
  progress: number,
): FactoryFork | null {
  return (
    levelConfig(levelId).forks.find(
      (fork) => progress >= fork.returnStart && progress <= fork.returnEnd,
    ) ?? null
  );
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
