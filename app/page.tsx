'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Bot,
  Factory,
  Gauge,
  LoaderCircle,
  PackageCheck,
  Power,
  RotateCcw,
  Settings2,
  Sparkles,
  Target,
  Timer,
  Trophy,
  Volume2,
  VolumeX,
  Wrench,
  Zap,
} from 'lucide-react';

import { FactoryViewport } from '@/app/factory-viewport';
import { useQuestionPool } from '@/app/use-question-pool';
import { Button } from '@/components/ui/button';
import {
  RUN_DURATION_SECONDS,
  PROCESSING_BONUS_CORRECT_ANSWERS,
  activateProcessingBonus,
  chooseProcessingBonus,
  cloneConveyorRun,
  consumeProcessingAction,
  createRun,
  decayProcessingImpulse,
  dismissProcessingBonusOffer,
  formatClock,
  processingTransportMultiplier,
  resolveProcessingQuiz,
  setProcessingLevel,
  type ConveyorRun,
} from '@/lib/conveyor-game';
import {
  LEVEL_CONFIGS,
  PROCESSING_BONUS_DATA,
  PROCESSING_LEVELS,
  applyMachineEffect,
  evaluateProcessingState,
  getProcessingVisualState,
  type FactorySection,
  type ProcessingAction,
  type ProcessingBonusId,
  type ProcessingLevelId,
  type ProcessingMachineId,
  type ProcessingState,
  type ProcessingTarget,
} from '@/lib/processing-game';
import { exerciseFormatOf, exerciseHint } from '@/lib/questions';

import { playQuestionAudio, stopQuestionAudio } from './question-audio';
import {
  DEFAULT_LEARNING_SETTINGS,
  GRAMMAR_TOPIC_GROUPS,
  LANGUAGE_LEVELS,
  LEARNING_SETTINGS_STORAGE_KEY,
  LEXICAL_TOPIC_GROUPS,
  QUESTION_MODES,
  normalizeLearningSettings,
  type LearningSettings,
} from '@/lib/learning-settings';

const BONUS_ICONS = {
  booster: Wrench,
  damper: Gauge,
  boost: Zap,
  slow: Timer,
} as const;

const FACTORY_LEVELS = [1, 2, 3, 4, 5] as const;

type WebMcpContext = {
  registerTool: (
    tool: {
      name: string;
      title?: string;
      description: string;
      inputSchema: object;
      annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
      execute: (input: unknown) => unknown;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

declare global {
  interface Document {
    readonly modelContext?: WebMcpContext;
  }
}

type MachineRuntime = {
  sectionId: string;
  machineId: ProcessingMachineId;
  multiplier: number;
};

const PRESS_HIT_STAGES = [0.3, 0.74] as const;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

function safeJsonRecord(input: unknown) {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function sectionFor(
  run: ConveyorRun,
  predicate?: (section: FactorySection) => boolean,
) {
  const config = LEVEL_CONFIGS[run.level];
  const effectiveLane =
    run.level === 5 && run.processingVariant === 1
      ? run.processingLane === 'upper'
        ? 'lower'
        : 'upper'
      : run.processingLane;
  return (
    config.sections.find(
      (section) =>
        run.factoryProgress >= section.start &&
        run.factoryProgress < section.end &&
        (section.lane === 'both' || section.lane === effectiveLane) &&
        (!predicate || predicate(section)),
    ) ?? null
  );
}

function committedForkFor(run: ConveyorRun) {
  return (
    LEVEL_CONFIGS[run.level].forks.find(
      (fork) =>
        run.factoryProgress >= fork.commitAt &&
        run.factoryProgress < fork.mergeAt,
    ) ?? null
  );
}

function targetState(target: ProcessingTarget): ProcessingState {
  const middle = (range: { min: number; max: number }) =>
    (range.min + range.max) / 2;
  return {
    temperature: middle(target.temperature),
    thickness: middle(target.thickness),
    width: middle(target.width),
    length: middle(target.length),
    crackRisk: 0,
    cracked: false,
    machineHistory: [],
  };
}

function PieceGlyph({
  state,
  ghost = false,
}: {
  state: ProcessingState;
  ghost?: boolean;
}) {
  const visual = getProcessingVisualState(state);
  const style = {
    '--piece-length': clamp(visual.lengthScale, 0.62, 1.62),
    '--piece-width': clamp(visual.widthScale, 0.7, 1.5),
    '--piece-thickness': clamp(visual.thicknessScale, 0.48, 1.35),
    '--piece-color': ghost ? '#77f4df' : visual.metalColor,
    '--piece-glow': ghost ? 0.24 : visual.glow,
  } as CSSProperties;
  return (
    <span
      className={`piece-glyph ${ghost ? 'is-ghost' : ''} ${state.cracked ? 'is-cracked' : ''}`}
      style={style}
      aria-hidden="true"
    />
  );
}

export default function ConveyorGame() {
  const [initialRun] = useState(createRun);
  const runRef = useRef<ConveyorRun>(initialRun);
  const [hud, setHud] = useState(() => cloneConveyorRun(initialRun));
  const [settings, setSettings] = useState<LearningSettings>(
    DEFAULT_LEARNING_SETTINGS,
  );
  const [selectedFactoryLevel, setSelectedFactoryLevel] =
    useState<ProcessingLevelId>(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [recallAnswer, setRecallAnswer] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const nextLockedRef = useRef(false);
  const answerLockedRef = useRef(false);
  const questionEpochRef = useRef(0);
  const recallAbortRef = useRef<AbortController | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const machineRuntimeRef = useRef<MachineRuntime | null>(null);
  const processedCyclesRef = useRef(new Set<string>());
  const visitedSectionsRef = useRef(new Set<string>());

  const pool = useQuestionPool(settings, hud.phase === 'playing');
  const questionFormat = exerciseFormatOf(pool.question, settings.mode);
  const isListening = questionFormat.id === 'audio';
  const poolRef = useRef(pool);
  const questionRef = useRef(pool.question);
  useEffect(() => {
    poolRef.current = pool;
  }, [pool]);
  useEffect(() => {
    questionRef.current = pool.question;
  }, [pool.question]);

  // A listening task is heard, not read, so it speaks as soon as it appears and
  // falls silent the moment the run moves on.
  useEffect(() => {
    const spoken = pool.question.audioText;
    if (hud.phase !== 'playing' || hud.actionReady || !spoken) {
      stopQuestionAudio();
      return;
    }
    void playQuestionAudio(spoken);
    return () => stopQuestionAudio();
  }, [hud.actionReady, hud.phase, pool.question.audioText, pool.question.id]);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(
          LEARNING_SETTINGS_STORAGE_KEY,
        );
        if (stored) setSettings(normalizeLearningSettings(JSON.parse(stored)));
      } catch {
        /* storage is optional */
      }
    }, 0);
    fetch('/api/questions/status', { cache: 'no-store' })
      .then(async (response) =>
        response.ok ? safeJsonRecord(await response.json()) : { ready: false },
      )
      .then((data) => setAiReady(Boolean(data.ready)))
      .catch(() => setAiReady(false));
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        LEARNING_SETTINGS_STORAGE_KEY,
        JSON.stringify(settings),
      );
    } catch {
      /* storage is optional */
    }
  }, [settings]);

  useEffect(
    () => () => {
      recallAbortRef.current?.abort();
    },
    [],
  );

  const sound = useCallback(
    (kind: 'correct' | 'wrong' | 'action' | 'machine' | 'win') => {
      if (!audioEnabled) return;
      const context = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = context;
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const notes = {
        correct: 660,
        wrong: 154,
        action: 330,
        machine: 92,
        win: 820,
      };
      oscillator.type =
        kind === 'wrong' || kind === 'machine' ? 'sawtooth' : 'triangle';
      oscillator.frequency.setValueAtTime(notes[kind], now);
      if (kind === 'win')
        oscillator.frequency.exponentialRampToValueAtTime(1240, now + 0.22);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.07, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.22);
    },
    [audioEnabled],
  );

  const publishHud = useCallback(
    () => setHud(cloneConveyorRun(runRef.current)),
    [],
  );

  const resetQuestion = useCallback(
    (message = 'Новый вопрос. Фабрика продолжает работать.') => {
      if (nextLockedRef.current) return;
      nextLockedRef.current = true;
      questionEpochRef.current += 1;
      recallAbortRef.current?.abort();
      recallAbortRef.current = null;
      const run = runRef.current;
      run.charge = 100;
      run.actionReady = false;
      run.message = message;
      setFeedback('');
      setRecallAnswer('');
      setEvaluating(false);
      poolRef.current.nextQuestion();
      window.setTimeout(() => {
        answerLockedRef.current = false;
        nextLockedRef.current = false;
      }, 120);
      publishHud();
    },
    [publishHud],
  );

  const finishRun = useCallback(() => {
    const run = runRef.current;
    if (run.phase !== 'playing') return;
    const report = evaluateProcessingState(run.workpiece, run.target);
    run.score += report.score * 12 + Math.round(run.timeLeft * 5);
    if (report.complete) {
      run.phase = 'won';
      run.objective = 'Деталь принята контролем качества';
      run.message = 'Форма и состояние металла совпали с эталоном.';
      sound('win');
    } else {
      run.phase = 'lost';
      run.lossReason = `Брак: ${report.issues.join(', ')}.`;
      run.objective = 'Деталь отклонена';
      sound('wrong');
    }
    publishHud();
  }, [publishHud, sound]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let accumulator = 0;
    let uiClock = 0;

    const finishPreviousMachine = () => {
      const previous = machineRuntimeRef.current;
      if (!previous || visitedSectionsRef.current.has(previous.sectionId))
        return;
      visitedSectionsRef.current.add(previous.sectionId);
      runRef.current.workpiece.machineHistory.push(previous.machineId);
      machineRuntimeRef.current = null;
    };

    const applyContinuousMachine = (
      run: ConveyorRun,
      machine: ProcessingMachineId,
      multiplier: number,
      exposure: number,
    ) => {
      const history = [...run.workpiece.machineHistory];
      const application = applyMachineEffect(run.workpiece, machine, {
        effectMultiplier: multiplier,
        exposure,
      });
      application.state.machineHistory = history;
      run.workpiece = application.state;
      run.lastMachineId = machine;
      run.heat = getProcessingVisualState(run.workpiece).heat01 * 100;
    };

    const step = (dt: number) => {
      let run = runRef.current;
      if (run.phase !== 'playing') return;
      run.elapsed += dt;
      run.machineTime += dt;
      run.timeLeft = Math.max(0, run.timeLeft - dt);
      if (run.timeLeft <= 0) {
        run.phase = 'lost';
        run.lossReason = 'Смена закончилась до контроля качества.';
        run.objective = 'Линия остановлена';
        sound('wrong');
        publishHud();
        return;
      }

      const chargeBefore = run.charge;
      run = decayProcessingImpulse(run, dt);
      runRef.current = run;
      if (chargeBefore > 0 && run.charge <= 0) {
        resetQuestion(
          run.actionReady
            ? 'Команда сгорела — нужен новый ответ.'
            : 'Импульс иссяк — новый вопрос.',
        );
        return;
      }

      const config = LEVEL_CONFIGS[run.level];
      const speed =
        config.baseBeltSpeed * processingTransportMultiplier(run, run.elapsed);
      run.factoryProgress = Math.min(
        config.finishAt,
        run.factoryProgress + speed * dt,
      );
      // The renderer keeps the proven straight conveyor coordinate system while
      // the production model advances in world metres.
      run.routeId = 'entry-press';
      run.routeProgress = clamp(
        run.factoryProgress / Math.max(1, config.finishAt),
        0,
        0.99,
      );
      const laneTarget = run.processingLane === 'upper' ? -1.28 : 1.28;
      run.lateralOffset +=
        (laneTarget - run.lateralOffset) * (1 - Math.exp(-dt * 5.4));
      run.playerX = run.factoryProgress;
      run.playerZ = run.lateralOffset;

      const stage = sectionFor(run);
      run.stageIndex = stage ? config.sections.indexOf(stage) : 0;
      run.stageProgress = stage
        ? clamp(
            (run.factoryProgress - stage.start) / (stage.end - stage.start),
            0,
            1,
          )
        : 0;

      const machineSection = sectionFor(
        run,
        (section) => section.kind === 'machine' && Boolean(section.machineId),
      );
      if (!machineSection?.machineId) {
        finishPreviousMachine();
      } else {
        if (machineRuntimeRef.current?.sectionId !== machineSection.id) {
          finishPreviousMachine();
          machineRuntimeRef.current = {
            sectionId: machineSection.id,
            machineId: machineSection.machineId,
            multiplier: run.nextMachineMultiplier,
          };
          run.nextMachineMultiplier = 1;
          run.message = `Заготовка вошла в станок: ${machineSection.label}.`;
        }
        const runtime = machineRuntimeRef.current;
        const zoneSeconds =
          (machineSection.end - machineSection.start) / config.baseBeltSpeed;
        if (runtime && runtime.machineId === machineSection.machineId) {
          if (
            runtime.machineId === 'furnace' ||
            runtime.machineId === 'rollers' ||
            runtime.machineId === 'cooling'
          ) {
            applyContinuousMachine(
              run,
              runtime.machineId,
              runtime.multiplier,
              dt / Math.max(1, zoneSeconds),
            );
          } else if (runtime.machineId === 'press') {
            for (const [hitIndex, hitStage] of PRESS_HIT_STAGES.entries()) {
              const key = `${runtime.sectionId}:press:${hitIndex}`;
              if (
                run.stageProgress >= hitStage &&
                !processedCyclesRef.current.has(key)
              ) {
                processedCyclesRef.current.add(key);
                applyContinuousMachine(run, 'press', runtime.multiplier, 1);
                sound('machine');
              }
            }
          } else if (runtime.machineId === 'cutter') {
            const key = `${runtime.sectionId}:cut`;
            if (
              run.stageProgress > 0.48 &&
              !processedCyclesRef.current.has(key)
            ) {
              processedCyclesRef.current.add(key);
              applyContinuousMachine(run, 'cutter', runtime.multiplier, 1);
              sound('machine');
            }
          }
        }
      }

      if (run.factoryProgress >= config.finishAt) {
        finishPreviousMachine();
        finishRun();
        return;
      }
    };

    const tick = (now: number) => {
      const delta = Math.min(0.08, (now - last) / 1000);
      last = now;
      accumulator += delta;
      while (accumulator >= 1 / 60) {
        step(1 / 60);
        accumulator -= 1 / 60;
      }
      uiClock += delta;
      if (uiClock >= 0.1) {
        uiClock = 0;
        publishHud();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [finishRun, publishHud, resetQuestion, sound]);

  const startRun = useCallback(
    (
      override?: Partial<LearningSettings>,
      factoryLevel: ProcessingLevelId = selectedFactoryLevel,
    ) => {
      if (override)
        setSettings((current) =>
          normalizeLearningSettings({ ...current, ...override }),
        );
      let next = createRun();
      next = setProcessingLevel(next, factoryLevel);
      next.processingVariant =
        factoryLevel === 5 && Math.random() >= 0.5 ? 1 : 0;
      next.phase = 'playing';
      next.timeLeft = RUN_DURATION_SECONDS;
      next.message = 'Фабрика уже движется. Изготовь деталь по эталону.';
      runRef.current = next;
      machineRuntimeRef.current = null;
      processedCyclesRef.current.clear();
      visitedSectionsRef.current.clear();
      questionEpochRef.current += 1;
      recallAbortRef.current?.abort();
      recallAbortRef.current = null;
      nextLockedRef.current = false;
      answerLockedRef.current = false;
      poolRef.current.restartQuestions();
      setFeedback('');
      setRecallAnswer('');
      setEvaluating(false);
      setSettingsOpen(false);
      setSelectedFactoryLevel(factoryLevel);
      publishHud();
    },
    [publishHud, selectedFactoryLevel],
  );

  const acceptCorrect = useCallback(
    (explanation: string) => {
      const current = runRef.current;
      if (
        current.phase !== 'playing' ||
        current.actionReady ||
        answerLockedRef.current
      )
        return;
      answerLockedRef.current = true;
      const resolution = resolveProcessingQuiz(current, true);
      resolution.run.score += Math.round(
        150 + resolution.run.charge * 2 + resolution.run.streak * 28,
      );
      runRef.current = resolution.run;
      setFeedback(explanation || resolution.run.message);
      sound('correct');
      publishHud();
    },
    [publishHud, sound],
  );

  const wrongAnswer = useCallback(
    (message: string) => {
      const current = runRef.current;
      if (
        current.phase !== 'playing' ||
        current.actionReady ||
        answerLockedRef.current
      )
        return;
      answerLockedRef.current = true;
      const resolution = resolveProcessingQuiz(current, false);
      runRef.current = resolution.run;
      poolRef.current.releaseQuestion(questionRef.current);
      setFeedback(message);
      sound('wrong');
      publishHud();
      window.setTimeout(() => {
        if (runRef.current.phase === 'playing')
          resetQuestion('Новый вопрос. Производство не останавливалось.');
      }, 780);
    },
    [publishHud, resetQuestion, sound],
  );

  const chooseAnswer = useCallback(
    (index: number) => {
      const run = runRef.current;
      if (
        run.phase !== 'playing' ||
        run.actionReady ||
        answerLockedRef.current ||
        settings.mode === 'recall'
      )
        return;
      const question = questionRef.current;
      if (index === question.correct) acceptCorrect(question.rule);
      else wrongAnswer(`Неверно. ${question.rule}`);
    },
    [acceptCorrect, settings.mode, wrongAnswer],
  );

  const submitRecall = useCallback(
    async (event?: { preventDefault(): void }) => {
      event?.preventDefault();
      const run = runRef.current;
      const answer = recallAnswer.trim();
      if (
        run.phase !== 'playing' ||
        run.actionReady ||
        answerLockedRef.current ||
        evaluating ||
        !answer
      )
        return;
      answerLockedRef.current = true;
      setEvaluating(true);
      const question = questionRef.current;
      const questionEpoch = questionEpochRef.current;
      const controller = new AbortController();
      recallAbortRef.current?.abort();
      recallAbortRef.current = controller;
      const isCurrentAttempt = () =>
        runRef.current === run &&
        run.phase === 'playing' &&
        questionEpochRef.current === questionEpoch &&
        questionRef.current.id === question.id &&
        recallAbortRef.current === controller;
      try {
        const response = await fetch('/api/questions/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            userAnswer: answer,
            expectedAnswer: question.options[question.correct],
            prompt: question.prompt,
            context: question.context,
            translation: question.translation,
            level: settings.level,
            lexicalTopic: settings.lexicalTopic,
            grammarTopic: settings.grammarTopic,
          }),
        });
        const result = response.ok
          ? ((await response.json()) as {
              correct?: boolean;
              explanation?: string;
              correctAnswer?: string;
            })
          : { correct: false, explanation: 'Проверка недоступна.' };
        if (!isCurrentAttempt()) return;
        answerLockedRef.current = false;
        if (result.correct) acceptCorrect(result.explanation ?? question.rule);
        else
          wrongAnswer(
            `${result.explanation ?? 'Пока не совпало.'} Ответ: ${result.correctAnswer ?? question.options[question.correct]}`,
          );
      } catch {
        if (controller.signal.aborted || !isCurrentAttempt()) return;
        answerLockedRef.current = false;
        const expected = question.options[question.correct]
          .trim()
          .toLocaleLowerCase('de-DE');
        if (answer.toLocaleLowerCase('de-DE') === expected)
          acceptCorrect(question.rule);
        else
          wrongAnswer(
            `Пока не совпало. Ответ: ${question.options[question.correct]}`,
          );
      } finally {
        if (recallAbortRef.current === controller) {
          recallAbortRef.current = null;
          setEvaluating(false);
        }
      }
    },
    [acceptCorrect, evaluating, recallAnswer, settings, wrongAnswer],
  );

  const executeAction = useCallback(
    (action: ProcessingAction) => {
      if (action === 'toggle-lane' && committedForkFor(runRef.current)) {
        runRef.current.message =
          'Ветка уже выбрана. Используй сдвиг назад или вперёд.';
        setFeedback(runRef.current.message);
        publishHud();
        return false;
      }
      const resolution = consumeProcessingAction(runRef.current, action);
      runRef.current = resolution.run;
      if (!resolution.consumed) {
        publishHud();
        return false;
      }
      if (resolution.longitudinalDelta !== 0) {
        const config = LEVEL_CONFIGS[resolution.run.level];
        const previousProgress = resolution.run.factoryProgress;
        resolution.run.factoryProgress = clamp(
          resolution.run.factoryProgress + resolution.longitudinalDelta,
          config.startAt,
          config.finishAt,
        );
        resolution.run.routeId = 'entry-press';
        resolution.run.routeProgress = clamp(
          resolution.run.factoryProgress / Math.max(1, config.finishAt),
          0,
          0.99,
        );
        resolution.run.playerX = resolution.run.factoryProgress;
        if (resolution.longitudinalDelta > 0) {
          for (const section of config.sections) {
            if (section.kind !== 'machine' || section.machineId !== 'press')
              continue;
            for (const [hitIndex, hitStage] of PRESS_HIT_STAGES.entries()) {
              const hitAt =
                section.start + (section.end - section.start) * hitStage;
              if (
                previousProgress < hitAt &&
                resolution.run.factoryProgress >= hitAt
              ) {
                processedCyclesRef.current.add(
                  `${section.id}:press:${hitIndex}`,
                );
              }
            }
          }
        }
      }
      sound('action');
      publishHud();
      window.setTimeout(
        () => resetQuestion('Манёвр выполнен. Следующий вопрос.'),
        160,
      );
      return true;
    },
    [publishHud, resetQuestion, sound],
  );

  const selectBonus = useCallback(
    (bonus: ProcessingBonusId) => {
      const resolution = chooseProcessingBonus(runRef.current, bonus);
      runRef.current = resolution.run;
      if (resolution.activated) sound('action');
      setFeedback(resolution.reason);
      publishHud();
    },
    [publishHud, sound],
  );

  const keepStoredBonus = useCallback(() => {
    runRef.current = dismissProcessingBonusOffer(runRef.current);
    setFeedback(runRef.current.message);
    publishHud();
  }, [publishHud]);

  const useStoredBonus = useCallback(() => {
    const resolution = activateProcessingBonus(runRef.current);
    runRef.current = resolution.run;
    if (resolution.activated) sound('action');
    setFeedback(resolution.reason);
    publishHud();
  }, [publishHud, sound]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const key = event.key.toLowerCase();
      if (
        target?.matches('input, select, textarea, [contenteditable="true"]') ||
        (target?.matches('button') && (key === ' ' || key === 'enter')) ||
        runRef.current.phase !== 'playing'
      )
        return;
      if (settings.mode !== 'recall' && ['1', '2', '3', '4'].includes(key))
        chooseAnswer(Number(key) - 1);
      else if (key === 'a' || key === 'arrowleft')
        executeAction('shift-backward');
      else if (key === 'd' || key === 'arrowright')
        executeAction('shift-forward');
      else if (key === 'w' || key === 'arrowup' || key === ' ')
        executeAction('toggle-lane');
      else if (key === 'q') useStoredBonus();
      if (['arrowleft', 'arrowright', 'arrowup', ' '].includes(key))
        event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [chooseAnswer, executeAction, settings.mode, useStoredBonus]);

  const webActionsRef = useRef({ startRun, chooseAnswer });
  useEffect(() => {
    webActionsRef.current = { startRun, chooseAnswer };
  }, [chooseAnswer, startRun]);
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool(
        {
          name: 'read_conveyor_status',
          title: 'Read Conveyor status',
          description:
            'Read the active manufacturing level, workpiece, impulse and target-match status without changing the game.',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute() {
            const run = runRef.current;
            return {
              phase: run.phase,
              factoryLevel: run.level,
              progress: Math.round(run.factoryProgress),
              lane: run.processingLane,
              layoutVariant: run.processingVariant,
              impulse: Math.round(run.charge),
              actionReady: run.actionReady,
              nextMachineMultiplier: run.nextMachineMultiplier,
              transportMultiplier: processingTransportMultiplier(
                run,
                run.elapsed,
              ),
              workpiece: run.workpiece,
              quality: evaluateProcessingState(run.workpiece, run.target),
              storedBonus: run.storedProcessingBonus,
            };
          },
        },
        { signal: lifecycle.signal },
      );
      await context.registerTool(
        {
          name: 'start_conveyor_run',
          title: 'Start Conveyor run',
          description:
            'Start the visible German-learning factory, optionally choosing CEFR and factory levels.',
          inputSchema: {
            type: 'object',
            properties: {
              level: { type: 'string', enum: ['A1', 'A2', 'B1', 'B2'] },
              factoryLevel: { type: 'integer', minimum: 1, maximum: 5 },
            },
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input) {
            const source = safeJsonRecord(input);
            const languageLevel =
              typeof source.level === 'string' &&
              LANGUAGE_LEVELS.includes(
                source.level as (typeof LANGUAGE_LEVELS)[number],
              )
                ? (source.level as LearningSettings['level'])
                : undefined;
            const requested = Number(source.factoryLevel);
            const factoryLevel =
              Number.isInteger(requested) && requested >= 1 && requested <= 5
                ? (requested as ProcessingLevelId)
                : selectedFactoryLevel;
            webActionsRef.current.startRun(
              languageLevel ? { level: languageLevel } : undefined,
              factoryLevel,
            );
            return { started: true, factoryLevel };
          },
        },
        { signal: lifecycle.signal },
      );
      await context.registerTool(
        {
          name: 'answer_conveyor_question',
          title: 'Answer current Conveyor question',
          description:
            'Choose one visible multiple-choice answer by its one-based number.',
          inputSchema: {
            type: 'object',
            properties: {
              answerNumber: { type: 'integer', minimum: 1, maximum: 4 },
            },
            required: ['answerNumber'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input) {
            const value = Number(safeJsonRecord(input).answerNumber);
            if (!Number.isInteger(value) || value < 1 || value > 4)
              throw new Error('answerNumber must be an integer from 1 to 4');
            webActionsRef.current.chooseAnswer(value - 1);
            return { accepted: true, answerNumber: value };
          },
        },
        { signal: lifecycle.signal },
      );
    };
    void register().catch(() => {});
    return () => lifecycle.abort();
  }, [selectedFactoryLevel]);

  const gameLevel = PROCESSING_LEVELS[hud.level];
  const quality = evaluateProcessingState(hud.workpiece, hud.target);
  const currentSection = sectionFor(hud);
  const laneLocked = Boolean(committedForkFor(hud));
  const targetPiece = targetState(hud.target);
  const storedBonus = hud.storedProcessingBonus;
  const storedBonusData = storedBonus
    ? PROCESSING_BONUS_DATA[storedBonus]
    : null;
  const activeBonus =
    hud.nextMachineMultiplier > 1
      ? {
          label: 'УСИЛИТЕЛЬ ЗАРЯЖЕН',
          detail: 'сработает на следующем станке',
          icon: Wrench,
        }
      : hud.nextMachineMultiplier < 1
        ? {
            label: 'ДЕМПФЕР ЗАРЯЖЕН',
            detail: 'сработает на следующем станке',
            icon: Gauge,
          }
        : hud.elapsed < hud.overdriveUntil
          ? {
              label: 'РАЗГОН АКТИВЕН',
              detail: 'лента ускорена',
              icon: Zap,
            }
          : hud.elapsed < hud.slowUntil
            ? {
                label: 'ЗАМЕДЛЕНИЕ АКТИВНО',
                detail: 'лента замедлена',
                icon: Timer,
              }
            : null;
  const StoredBonusIcon = storedBonus
    ? BONUS_ICONS[storedBonus]
    : (activeBonus?.icon ?? PackageCheck);

  return (
    <main className="game-shell">
      <section className="play-grid" aria-label="Игровой экран Conveyor">
        <section className="world-panel">
          <FactoryViewport runRef={runRef} />
          <div className="world-vignette" />
          <div className="viewport-brand">
            <Factory />
            <span>CONVEYOR</span>
          </div>
          <div className="viewport-buttons">
            <Button
              variant="ghost"
              onClick={() => setSettingsOpen(true)}
              aria-label="Настройки"
            >
              <Settings2 />
            </Button>
            <Button
              variant="ghost"
              onClick={() => setAudioEnabled((value) => !value)}
              aria-label={audioEnabled ? 'Выключить звук' : 'Включить звук'}
            >
              {audioEnabled ? <Volume2 /> : <VolumeX />}
            </Button>
          </div>
          <div className="viewport-clock">
            <Timer />
            <span>УРОВЕНЬ {hud.level} · СМЕНА</span>
            <strong>{formatClock(hud.timeLeft)}</strong>
          </div>
          <div className="target-blueprint" aria-label="Эталон детали">
            <div className="target-heading">
              <Target />
              <span>ЭТАЛОН</span>
            </div>
            <PieceGlyph state={targetPiece} ghost />
            <small>{gameLevel.title}</small>
          </div>
          {currentSection?.kind === 'fork' && (
            <div className="fork-cue" aria-live="polite">
              <span>РАЗВИЛКА ВПЕРЕДИ</span>
              <strong>
                Текущая линия —{' '}
                {hud.processingLane === 'upper' ? 'верхняя' : 'нижняя'}
              </strong>
            </div>
          )}
        </section>

        <aside className="control-rail">
          <section
            className={`quiz-card ${hud.actionReady ? 'action-mode' : ''}`}
          >
            <div className="quiz-meta">
              <span>
                {settings.level} ·{' '}
                {settings.grammarTopic.toLocaleUpperCase('de-DE')}
              </span>
              <span className="factory-progress-label">
                {currentSection?.label ??
                  (hud.factoryProgress < 8 ? 'Подача' : 'Между станками')}
              </span>
            </div>
            <div className="question-panel">
              <p className="question-label">{pool.question.prompt}</p>
              <h1>{pool.question.context}</h1>
              {isListening && pool.question.audioText ? (
                <button
                  type="button"
                  className="audio-replay"
                  onClick={() =>
                    void playQuestionAudio(pool.question.audioText!)
                  }
                  aria-label="Прослушать немецкую фразу ещё раз"
                >
                  <Volume2 />
                  ПОВТОРИТЬ
                </button>
              ) : (
                <p className="translation">{pool.question.translation}</p>
              )}
            </div>
            <div className="impulse-row">
              <div>
                <span>ИМПУЛЬС</span>
                <strong>{Math.round(hud.charge)}%</strong>
              </div>
              <div className="impulse-track">
                <i style={{ width: `${hud.charge}%` }} />
              </div>
              <small>сгорает постоянно</small>
            </div>

            <div className="answer-slot">
              {hud.actionReady ? (
                <div className="action-panel">
                  <div className="action-title">
                    <Sparkles />
                    <div>
                      <span>ОДНО ДЕЙСТВИЕ ДОСТУПНО</span>
                      <strong>Выбери траекторию или момент</strong>
                    </div>
                  </div>
                  <div className="processing-actions">
                    <Button
                      variant="outline"
                      className="lane-action"
                      disabled={laneLocked}
                      onClick={() => executeAction('toggle-lane')}
                    >
                      <kbd>W</kbd>
                      <ArrowLeftRight />
                      <span>
                        <strong>СМЕНИТЬ ЛИНИЮ</strong>
                        <small>
                          {laneLocked
                            ? 'ветка уже выбрана'
                            : hud.processingLane === 'upper'
                              ? 'верхняя → нижняя'
                              : 'нижняя → верхняя'}
                        </small>
                      </span>
                    </Button>
                    <div
                      className="shift-action"
                      role="group"
                      aria-label="Сдвиг по ленте"
                    >
                      <Button
                        variant="outline"
                        onClick={() => executeAction('shift-backward')}
                      >
                        <kbd>A</kbd>
                        <ArrowLeft />
                        <span>
                          <strong>НАЗАД</strong>
                          <small>дольше под машиной</small>
                        </span>
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => executeAction('shift-forward')}
                      >
                        <span>
                          <strong>ВПЕРЁД</strong>
                          <small>быстрее из зоны</small>
                        </span>
                        <ArrowRight />
                        <kbd>D</kbd>
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="answer-panel">
                  <p className="answer-hint">
                    {exerciseHint(questionFormat, settings.mode)}
                  </p>
                  {settings.mode !== 'recall' ? (
                    <div className="answer-grid">
                      {pool.question.options.map((answer, index) => (
                        <Button
                          key={`${pool.question.id}-${answer}`}
                          variant="outline"
                          onClick={() => chooseAnswer(index)}
                        >
                          <kbd>{index + 1}</kbd>
                          <span>{answer}</span>
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <form className="recall-form" onSubmit={submitRecall}>
                      <input
                        value={recallAnswer}
                        onChange={(event) =>
                          setRecallAnswer(event.target.value)
                        }
                        placeholder={questionFormat.recallPlaceholder}
                        autoComplete="off"
                        spellCheck="false"
                        aria-label="Ответ на немецком"
                      />
                      <Button
                        type="submit"
                        disabled={!recallAnswer.trim() || evaluating}
                      >
                        {evaluating ? (
                          <LoaderCircle className="spin" />
                        ) : (
                          <ArrowRight />
                        )}{' '}
                        Проверить
                      </Button>
                    </form>
                  )}
                </div>
              )}
            </div>
            <div
              className={`feedback-line ${feedback ? 'is-visible' : ''}`}
              aria-live="polite"
            >
              {feedback}
            </div>
          </section>

          <section
            className="bonus-dock processing-bonus"
            aria-labelledby="bonus-title"
          >
            <div className="bonus-meter-row">
              <span id="bonus-title">
                {gameLevel.bonusesEnabled
                  ? 'СТРАТЕГИЧЕСКИЙ БОНУС'
                  : 'БОНУСЫ С УРОВНЯ 4'}
              </span>
              {activeBonus && (
                <em className="active-bonus-chip">{activeBonus.label}</em>
              )}
              <div
                className="bonus-meter"
                aria-label={`Верных ответов до бонуса: ${hud.bonusProgress} из ${PROCESSING_BONUS_CORRECT_ANSWERS}`}
              >
                {Array.from({ length: PROCESSING_BONUS_CORRECT_ANSWERS }).map(
                  (_, index) => (
                    <i
                      key={index}
                      className={index < hud.bonusProgress ? 'is-filled' : ''}
                    />
                  ),
                )}
              </div>
            </div>

            {hud.bonusOffer ? (
              <div className="bonus-offer">
                <span>Выбери один. Мир не остановлен.</span>
                <div>
                  {hud.bonusOffer.map((bonus) => {
                    const Icon = BONUS_ICONS[bonus];
                    const data = PROCESSING_BONUS_DATA[bonus];
                    return (
                      <Button
                        key={bonus}
                        variant="outline"
                        onClick={() => selectBonus(bonus)}
                      >
                        <Icon />
                        <strong>{data.label}</strong>
                        <small>{data.detail}</small>
                      </Button>
                    );
                  })}
                </div>
                {storedBonus && (
                  <Button
                    variant="ghost"
                    className="keep-bonus"
                    onClick={keepStoredBonus}
                  >
                    Оставить «{storedBonusData?.label}»
                  </Button>
                )}
              </div>
            ) : (
              <Button
                variant="outline"
                className={`stored-bonus ${storedBonus || activeBonus ? 'is-ready' : ''}`}
                disabled={!storedBonus || hud.phase !== 'playing'}
                onClick={useStoredBonus}
              >
                <kbd>Q</kbd>
                <StoredBonusIcon />
                <span>
                  <strong>
                    {storedBonusData?.label ??
                      activeBonus?.label ??
                      'Слот пуст'}
                  </strong>
                  <small>
                    {storedBonusData?.detail ??
                      activeBonus?.detail ??
                      (gameLevel.bonusesEnabled
                        ? 'три верных ответа откроют выбор'
                        : 'сначала освой обработку металла')}
                  </small>
                </span>
                {storedBonus ? (
                  <em>ПРИМЕНИТЬ</em>
                ) : activeBonus ? (
                  <em>АКТИВНО</em>
                ) : null}
              </Button>
            )}
          </section>
        </aside>
      </section>

      {(hud.phase === 'menu' || settingsOpen) && (
        <dialog
          open
          className="menu-overlay"
          aria-modal="true"
          aria-labelledby="menu-title"
        >
          <div className="menu-card">
            <div className="menu-art" aria-hidden="true">
              <span>CONVEYOR</span>
              <small>DEUTSCH UNTER DRUCK</small>
            </div>
            <div className="menu-content">
              <div className="menu-kicker">
                <Bot /> НЕМЕЦКИЙ В ДВИЖЕНИИ{' '}
                <span className={aiReady ? 'is-online' : ''}>
                  {aiReady === null
                    ? 'проверка пула'
                    : aiReady
                      ? 'AI-пул активен'
                      : 'умный резерв активен'}
                </span>
              </div>
              <h1 id="menu-title">Ты — металлическая заготовка.</h1>
              <p>
                Фабрика непрерывно меняет тебя. Немецкие ответы дают редкие
                вмешательства — довези до контроля деталь нужной формы.
              </p>
              <div
                className="factory-level-picker"
                aria-label="Уровень фабрики"
              >
                {FACTORY_LEVELS.map((level) => (
                  <Button
                    key={level}
                    type="button"
                    variant="outline"
                    className={
                      selectedFactoryLevel === level ? 'is-selected' : ''
                    }
                    onClick={() => setSelectedFactoryLevel(level)}
                  >
                    <b>{level}</b>
                    <span>{PROCESSING_LEVELS[level].title}</span>
                  </Button>
                ))}
              </div>
              <div className="setup-grid">
                <label>
                  <span>Немецкий</span>
                  <select
                    value={settings.level}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        level: event.target.value as LearningSettings['level'],
                      }))
                    }
                  >
                    {LANGUAGE_LEVELS.map((level) => (
                      <option key={level}>{level}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Режим</span>
                  <select
                    value={settings.mode}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        mode: event.target.value as LearningSettings['mode'],
                      }))
                    }
                  >
                    {QUESTION_MODES.map((mode) => (
                      <option key={mode.id} value={mode.id}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Лексика</span>
                  <select
                    value={settings.lexicalTopic}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        lexicalTopic: event.target
                          .value as LearningSettings['lexicalTopic'],
                      }))
                    }
                  >
                    {LEXICAL_TOPIC_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.topics.map((topic) => (
                          <option key={topic}>{topic}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Грамматика</span>
                  <select
                    value={settings.grammarTopic}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        grammarTopic: event.target
                          .value as LearningSettings['grammarTopic'],
                      }))
                    }
                  >
                    {GRAMMAR_TOPIC_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.topics.map((topic) => (
                          <option key={topic}>{topic}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              </div>
              <div className="rule-strip">
                <span>
                  <b>01</b>
                  <strong>Ответ</strong>
                  <small>даёт одно действие</small>
                </span>
                <span>
                  <b>02</b>
                  <strong>Манёвр</strong>
                  <small>линия или сдвиг</small>
                </span>
                <span>
                  <b>03</b>
                  <strong>Контроль</strong>
                  <small>сравнит с эталоном</small>
                </span>
              </div>
              <div className="menu-actions">
                {settingsOpen && (
                  <Button
                    variant="ghost"
                    onClick={() => setSettingsOpen(false)}
                  >
                    Вернуться
                  </Button>
                )}
                <Button
                  className="start-button"
                  onClick={() => startRun(undefined, selectedFactoryLevel)}
                >
                  <Power /> {settingsOpen ? 'Начать заново' : 'Запустить линию'}
                  <span>{RUN_DURATION_SECONDS} секунд</span>
                </Button>
              </div>
            </div>
          </div>
        </dialog>
      )}

      {(hud.phase === 'won' || hud.phase === 'lost') && !settingsOpen && (
        <dialog
          open
          className="result-overlay"
          aria-modal="true"
          aria-labelledby="result-title"
        >
          <div className={`result-card ${hud.phase}`}>
            {hud.phase === 'won' ? <Trophy /> : <PackageCheck />}
            <span>
              {hud.phase === 'won' ? 'КОНТРОЛЬ ПРОЙДЕН' : 'ДЕТАЛЬ ОТКЛОНЕНА'}
            </span>
            <h1 id="result-title">
              {hud.phase === 'won'
                ? 'Заготовка совпала с эталоном.'
                : hud.lossReason}
            </h1>
            <div className="result-piece-compare">
              <span>
                <small>ТВОЯ ДЕТАЛЬ</small>
                <PieceGlyph state={hud.workpiece} />
              </span>
              <ArrowRight />
              <span>
                <small>ЭТАЛОН</small>
                <PieceGlyph state={targetPiece} ghost />
              </span>
            </div>
            <div className="result-stats">
              <span>
                <small>Качество</small>
                <b>{quality.score}%</b>
              </span>
              <span>
                <small>Верно</small>
                <b>{hud.correctAnswers}</b>
              </span>
              <span>
                <small>Время</small>
                <b>{formatClock(hud.timeLeft)}</b>
              </span>
            </div>
            <div className="result-actions">
              <Button variant="outline" onClick={() => setSettingsOpen(true)}>
                <Settings2 /> Настройки
              </Button>
              <Button
                onClick={() => {
                  const nextLevel =
                    hud.phase === 'won' && hud.level < 5
                      ? ((hud.level + 1) as ProcessingLevelId)
                      : hud.level;
                  startRun(undefined, nextLevel);
                }}
              >
                {hud.phase === 'won' && hud.level < 5 ? (
                  <PackageCheck />
                ) : (
                  <RotateCcw />
                )}{' '}
                {hud.phase === 'won' && hud.level < 5
                  ? `Уровень ${hud.level + 1}`
                  : 'Повторить'}
              </Button>
            </div>
          </div>
        </dialog>
      )}
    </main>
  );
}
