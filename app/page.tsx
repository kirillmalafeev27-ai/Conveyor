'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Anchor,
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  Bot,
  Gauge,
  LoaderCircle,
  Power,
  RotateCcw,
  Settings2,
  ShieldAlert,
  Sparkles,
  Timer,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FactoryViewport } from '@/app/factory-viewport';
import { useQuestionPool } from '@/app/use-question-pool';
import {
  BONUS_DATA,
  BONUS_ORDER,
  ROUTES,
  RUN_DURATION_SECONDS,
  advanceAlongRoute,
  allTerminalsComplete,
  createRun,
  formatClock,
  getJunctionOptions,
  nearestTerminal,
  playerAtExit,
  routeActionLabel,
  routePose,
  setPlayerRoute,
  terminalAtPlayer,
  type BonusId,
  type ConveyorRun,
} from '@/lib/conveyor-game';
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
  brake: Gauge,
  overdrive: Zap,
  reverse: RotateCcw,
  anchor: Anchor,
  transfer: ArrowLeftRight,
} as const;
const BONUS_TONES: Record<BonusId, string> = {
  brake: 'cyan',
  overdrive: 'amber',
  reverse: 'violet',
  anchor: 'blue',
  transfer: 'green',
};

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

function snapshot(run: ConveyorRun): ConveyorRun {
  return {
    ...run,
    routeHistory: [...run.routeHistory],
    completed: { ...run.completed },
    terminalOrder: [...run.terminalOrder],
    bonuses: { ...run.bonuses },
    cooldowns: { ...run.cooldowns },
  };
}

function safeJsonRecord(input: unknown) {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

export default function ConveyorGame() {
  const [initialRun] = useState(createRun);
  const runRef = useRef<ConveyorRun>(initialRun);
  const [hud, setHud] = useState(() => snapshot(initialRun));
  const [settings, setSettings] = useState<LearningSettings>(
    DEFAULT_LEARNING_SETTINGS,
  );
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

  const pool = useQuestionPool(settings, hud.phase === 'playing');
  const poolRef = useRef(pool);
  const questionRef = useRef(pool.question);
  useEffect(() => {
    poolRef.current = pool;
  }, [pool]);
  useEffect(() => {
    questionRef.current = pool.question;
  }, [pool.question]);

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
    (kind: 'correct' | 'wrong' | 'action' | 'danger' | 'win') => {
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
        danger: 92,
        win: 820,
      };
      oscillator.type =
        kind === 'wrong' || kind === 'danger' ? 'sawtooth' : 'triangle';
      oscillator.frequency.setValueAtTime(notes[kind], now);
      if (kind === 'win')
        oscillator.frequency.exponentialRampToValueAtTime(1240, now + 0.22);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.075, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.22);
    },
    [audioEnabled],
  );

  const publishHud = useCallback(() => setHud(snapshot(runRef.current)), []);

  const resetQuestion = useCallback(
    (message = 'Новый вопрос. Импульс заряжен.') => {
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

  const lose = useCallback(
    (reason: string) => {
      const run = runRef.current;
      if (run.phase !== 'playing') return;
      run.phase = 'lost';
      run.lossReason = reason;
      run.objective = 'Смена окончена';
      sound('danger');
      publishHud();
    },
    [publishHud, sound],
  );

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let accumulator = 0;
    let uiClock = 0;
    const damage = (key: string, message: string) => {
      const run = runRef.current;
      if (run.elapsed < run.invulnerableUntil || run.lastHazardKey === key)
        return;
      run.lastHazardKey = key;
      run.invulnerableUntil = run.elapsed + 2.1;
      run.integrity -= 1;
      run.streak = 0;
      run.message = message;
      sound('danger');
      if (run.integrity <= 0) lose(message);
    };
    const step = (dt: number) => {
      const run = runRef.current;
      if (run.phase !== 'playing') return;
      run.elapsed += dt;
      run.timeLeft = Math.max(0, run.timeLeft - dt);
      if (run.timeLeft <= 0)
        return lose('Смена закончилась раньше, чем открылись ворота.');
      if (run.terminalDeadline !== null && run.elapsed >= run.terminalDeadline)
        return lose('Синхронизация терминалов сорвана.');
      for (const bonus of BONUS_ORDER)
        run.cooldowns[bonus] = Math.max(0, run.cooldowns[bonus] - dt);
      run.charge = Math.max(0, run.charge - dt * (run.actionReady ? 4.5 : 3.3));
      if (run.charge <= 0) {
        run.streak = 0;
        resetQuestion(
          run.actionReady
            ? 'Команда сгорела — отвечай заново.'
            : 'Импульс иссяк — новый вопрос.',
        );
      }

      const braking = run.elapsed < run.slowUntil;
      const slow = braking ? 0.5 : 1;
      const boost = run.elapsed < run.overdriveUntil ? 1.55 : 1;
      const direction = run.elapsed < run.reverseUntil ? -1 : 1;
      const anchored = run.elapsed < run.anchorUntil;
      run.machineTime += dt * (braking ? 0.3 : 1);
      const baseSpeed = ROUTES[run.routeId].speed;
      if (!anchored) {
        advanceAlongRoute(
          run,
          baseSpeed *
            (run.completed.A ? 1.2 : 1) *
            slow *
            boost *
            direction *
            dt,
        );
      }

      const inFurnace =
        run.routeId === 'fork1-a-furnace' &&
        run.routeProgress > 0.2 &&
        run.routeProgress < 0.84;
      run.heat = Math.max(
        0,
        Math.min(
          100,
          run.heat + (inFurnace ? (run.completed.B ? 5.4 : 10.8) : -13) * dt,
        ),
      );
      if (run.heat >= 100) return lose('Перегрев: вентиляция не справилась.');
      const pressCycle = run.completed.A ? 7.4 : 5.4;
      const pressPhase = (run.machineTime % pressCycle) / pressCycle;
      if (
        run.routeId === 'entry-press' &&
        run.routeProgress > 0.28 &&
        run.routeProgress < 0.7 &&
        pressPhase > 0.82 &&
        pressPhase < 0.96
      )
        damage(
          `press-${Math.floor(run.machineTime / pressCycle)}`,
          'Пресс задел корпус: целостность снижена.',
        );
      const inTurbine =
        run.routeId === 'fork1-b-turbine' &&
        run.routeProgress > 0.2 &&
        run.routeProgress < 0.84;
      if (inTurbine && !anchored) {
        run.lateralOffset += (run.completed.B ? 0.92 : 0.58) * dt;
      } else if (!inTurbine) {
        run.lateralOffset *= Math.exp(-1.45 * dt);
      }
      if (Math.abs(run.lateralOffset) > 1.72) {
        damage(
          `turbine-edge-${Math.floor(run.machineTime / 1.8)}`,
          'Воздушный поток прижал тебя к борту.',
        );
        run.lateralOffset = Math.sign(run.lateralOffset) * 0.78;
      }

      const sawSpeed = run.completed.C ? 1.38 : 0.94;
      const sawOffset = Math.sin(run.machineTime * sawSpeed) * 1.42;
      if (
        run.routeId === 'fork2-saw' &&
        run.routeProgress > 0.28 &&
        run.routeProgress < 0.76 &&
        Math.abs(run.lateralOffset - sawOffset) < 0.48
      )
        damage(
          `saw-${Math.floor((run.machineTime * sawSpeed) / 1.3)}`,
          'Лезвие пересекло твою полосу.',
        );
      const pistonCycle = 5.8;
      const pistonPhase = (run.machineTime % pistonCycle) / pistonCycle;
      const pistonIndex = Math.floor(run.machineTime / pistonCycle);
      const pistonKey = `piston-${pistonIndex}`;
      if (
        !anchored &&
        run.routeId === 'fork2-piston' &&
        run.routeProgress > 0.27 &&
        run.routeProgress < 0.78 &&
        pistonPhase > 0.78 &&
        pistonPhase < 0.93 &&
        run.lastHazardKey !== pistonKey
      ) {
        run.lastHazardKey = pistonKey;
        run.invulnerableUntil = run.elapsed + 0.9;
        run.lateralOffset = pistonIndex % 2 === 0 ? 1.28 : -1.28;
        advanceAlongRoute(run, 2.6);
        run.message = 'Поршень перебросил тебя на соседнюю полосу.';
      }
      run.lateralOffset = Math.max(-1.72, Math.min(1.72, run.lateralOffset));
      const pose = routePose(run.routeId, run.routeProgress);
      const normalX = -Math.sin(pose.angle);
      const normalZ = Math.cos(pose.angle);
      run.playerX = pose.x + normalX * run.lateralOffset;
      run.playerZ = pose.z + normalZ * run.lateralOffset;
      if (run.elapsed >= run.invulnerableUntil) run.lastHazardKey = '';
      if (run.elapsed < run.overdriveUntil) run.score += Math.round(3 * dt);
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
  }, [lose, publishHud, resetQuestion, sound]);

  const startRun = useCallback(
    (override?: Partial<LearningSettings>) => {
      if (override)
        setSettings((current) =>
          normalizeLearningSettings({ ...current, ...override }),
        );
      const next = createRun();
      next.phase = 'playing';
      next.message = 'Ответь правильно — мир уже движется.';
      runRef.current = next;
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
      publishHud();
    },
    [publishHud],
  );

  const grantBonus = useCallback(() => {
    const run = runRef.current;
    const owned = BONUS_ORDER.reduce(
      (sum, bonus) => sum + run.bonuses[bonus],
      0,
    );
    if (owned >= 2) {
      run.score += 120;
      return 'слоты бонусов заполнены · +120';
    }
    const bonus = BONUS_ORDER[run.bonusCursor % BONUS_ORDER.length];
    run.bonusCursor += 1;
    run.bonuses[bonus] += 1;
    return `получен бонус «${BONUS_DATA[bonus].label}»`;
  }, []);

  const acceptCorrect = useCallback(
    (explanation: string) => {
      const run = runRef.current;
      if (run.phase !== 'playing' || run.actionReady || answerLockedRef.current)
        return;
      answerLockedRef.current = true;
      run.actionReady = true;
      run.streak += 1;
      run.score += Math.round(160 + run.charge * 3 + run.streak * 35);
      const reward = grantBonus();
      run.message = `Верно: ${reward}. Выбери команду.`;
      setFeedback(explanation || run.message);
      sound('correct');
      publishHud();
    },
    [grantBonus, publishHud, sound],
  );

  const wrongAnswer = useCallback(
    (message: string) => {
      const run = runRef.current;
      if (run.phase !== 'playing' || run.actionReady || answerLockedRef.current)
        return;
      answerLockedRef.current = true;
      run.streak = 0;
      run.score = Math.max(0, run.score - 60);
      run.charge = Math.max(12, run.charge - 18);
      run.message = message;
      poolRef.current.releaseQuestion(questionRef.current);
      setFeedback(message);
      sound('wrong');
      publishHud();
      window.setTimeout(() => {
        if (runRef.current.phase === 'playing')
          resetQuestion('Новый вопрос — соберись.');
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
        settings.mode !== 'recognition'
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
    (action: 'left' | 'right' | 'up' | 'down' | 'context') => {
      const run = runRef.current;
      if (run.phase !== 'playing') return false;
      if (!run.actionReady) {
        run.message = 'Сначала заработай команду правильным ответом.';
        publishHud();
        return false;
      }
      const junction = getJunctionOptions(run);
      const branchTarget =
        action === 'up'
          ? junction.up
          : action === 'down'
            ? junction.down
            : null;
      const crossTrackCost = 22;
      const branchCost = run.completed.C ? 28 : 40;
      const costs = {
        left: 10,
        right: 10,
        up: branchTarget ? branchCost : crossTrackCost,
        down: branchTarget ? branchCost : crossTrackCost,
        // A correct answer is the entire terminal requirement. Docking must never
        // look broken just because the earned impulse has already decayed.
        context: 0,
      };
      const cost = costs[action];
      if (run.charge < cost) {
        run.message = `Не хватает импульса: нужно ${cost}%.`;
        publishHud();
        return false;
      }
      if (action === 'context') {
        if (playerAtExit(run)) {
          run.charge -= cost;
          run.phase = 'won';
          run.objective = 'Ворота открыты';
          run.score += Math.round(run.timeLeft * 20 + run.integrity * 500);
          run.message = 'Смена пройдена. Все системы синхронизированы.';
          sound('win');
          publishHud();
          return true;
        }
        const candidate = terminalAtPlayer(run);
        if (!candidate) {
          run.message = allTerminalsComplete(run)
            ? 'Доберись до открытых ворот и нажми SPACE.'
            : 'Доедь до дока A, B или C.';
          publishHud();
          return false;
        }
        run.charge -= cost;
        run.completed[candidate.id] = true;
        run.terminalOrder.push(candidate.id);
        const count = run.terminalOrder.length;
        run.score += 900 + count * 240;
        run.terminalDeadline =
          count === 1
            ? run.elapsed + 75
            : count === 2
              ? run.elapsed + 65
              : null;
        run.objective =
          count === 3
            ? 'Пройди финальные секции и доберись до ворот'
            : `Найди ещё ${3 - count} терминал${count === 1 ? 'а' : ''}`;
        if (candidate.id === 'A') setPlayerRoute(run, 'a-merge', 0, true);
        if (candidate.id === 'B') setPlayerRoute(run, 'b-merge', 0, true);
        if (candidate.id === 'C') setPlayerRoute(run, 'c-exit', 0, true);
        run.message = `${candidate.id} · ${candidate.label} активирован. Маршрут перестроен.`;
      } else if (action === 'left' || action === 'right') {
        run.charge -= cost;
        // One earned forward command clears the complete press strike zone.
        advanceAlongRoute(run, action === 'right' ? 12.2 : -4.8);
        run.message =
          action === 'right' ? 'Рывок по ходу ленты.' : 'Рывок против хода.';
      } else {
        run.charge -= cost;
        if (branchTarget) {
          run.queuedRouteId = branchTarget;
          run.message = `Выбрано: ${routeActionLabel(branchTarget).toLowerCase()}.`;
        } else {
          run.lateralOffset = Math.max(
            -1.65,
            Math.min(
              1.65,
              run.lateralOffset + (action === 'up' ? 1.15 : -1.15),
            ),
          );
          advanceAlongRoute(run, 0);
          run.message =
            action === 'up'
              ? 'Сместился к верхнему борту.'
              : 'Сместился к нижнему борту.';
        }
      }
      run.actionReady = false;
      sound('action');
      publishHud();
      window.setTimeout(
        () => resetQuestion('Команда выполнена. Следующий вопрос.'),
        160,
      );
      return true;
    },
    [publishHud, resetQuestion, sound],
  );

  const activateBonus = useCallback(
    (bonus: BonusId) => {
      const run = runRef.current;
      if (run.phase !== 'playing') return false;
      if (run.bonuses[bonus] <= 0) {
        run.message = `«${BONUS_DATA[bonus].label}» ещё не заработан.`;
        publishHud();
        return false;
      }
      if (run.cooldowns[bonus] > 0) {
        run.message = `«${BONUS_DATA[bonus].label}» перезаряжается.`;
        publishHud();
        return false;
      }
      run.bonuses[bonus] -= 1;
      run.cooldowns[bonus] = BONUS_DATA[bonus].cooldown;
      const now = run.elapsed;
      if (bonus === 'brake') run.slowUntil = now + 6;
      if (bonus === 'overdrive') run.overdriveUntil = now + 6;
      if (bonus === 'reverse') run.reverseUntil = now + 5;
      if (bonus === 'anchor') run.anchorUntil = now + 4;
      if (bonus === 'transfer') {
        const nearest = nearestTerminal(run);
        const approach =
          nearest?.terminal.id === 'A'
            ? 'fork1-a-furnace'
            : nearest?.terminal.id === 'B'
              ? 'fork1-b-turbine'
              : nearest?.terminal.id === 'C'
                ? 'merge-c'
                : null;
        if (approach) {
          run.routeHistory = [];
          setPlayerRoute(run, approach, 0.32);
        }
        run.transferUntil = now + 1;
      }
      run.message = BONUS_DATA[bonus].activeDetail;
      run.score += 40;
      sound('action');
      publishHud();
      return true;
    },
    [publishHud, sound],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches('input, select, textarea, button') ||
        runRef.current.phase !== 'playing'
      )
        return;
      const key = event.key.toLowerCase();
      if (settings.mode === 'recognition' && ['1', '2', '3', '4'].includes(key))
        chooseAnswer(Number(key) - 1);
      else if (key === 'a' || key === 'arrowleft') executeAction('left');
      else if (key === 'd' || key === 'arrowright') executeAction('right');
      else if (key === 'w' || key === 'arrowup') executeAction('up');
      else if (key === 's' || key === 'arrowdown') executeAction('down');
      else if (key === ' ') executeAction('context');
      else {
        const bonus = BONUS_ORDER.find(
          (id) => BONUS_DATA[id].key.toLowerCase() === key,
        );
        if (bonus) activateBonus(bonus);
      }
      if (
        ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(key)
      )
        event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activateBonus, chooseAnswer, executeAction, settings.mode]);

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
            'Read the current run, position, charge, hazards, terminal progress, and owned bonuses without changing the game.',
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
              timeLeft: Math.ceil(run.timeLeft),
              route: run.routeId,
              routeProgress: Math.round(run.routeProgress * 100),
              x: Number(run.playerX.toFixed(1)),
              charge: Math.round(run.charge),
              actionReady: run.actionReady,
              terminals: run.completed,
              bonuses: run.bonuses,
              objective: run.objective,
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
            'Start or restart the visible German-learning factory run, optionally choosing a CEFR level and practice mode.',
          inputSchema: {
            type: 'object',
            properties: {
              level: { type: 'string', enum: ['A1', 'A2', 'B1', 'B2'] },
              mode: { type: 'string', enum: ['recognition', 'recall'] },
            },
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input) {
            const source = safeJsonRecord(input);
            const level =
              typeof source.level === 'string' &&
              LANGUAGE_LEVELS.includes(
                source.level as (typeof LANGUAGE_LEVELS)[number],
              )
                ? (source.level as LearningSettings['level'])
                : undefined;
            const mode =
              source.mode === 'recognition' || source.mode === 'recall'
                ? source.mode
                : undefined;
            webActionsRef.current.startRun({
              ...(level ? { level } : {}),
              ...(mode ? { mode } : {}),
            });
            return {
              started: true,
              level: level ?? settings.level,
              mode: mode ?? settings.mode,
            };
          },
        },
        { signal: lifecycle.signal },
      );
      await context.registerTool(
        {
          name: 'answer_conveyor_question',
          title: 'Answer current Conveyor question',
          description:
            'Choose one visible multiple-choice answer by its one-based number. This changes score and may unlock one movement command.',
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
            if (runRef.current.phase !== 'playing')
              throw new Error('No active run');
            if (settings.mode !== 'recognition')
              throw new Error('The current run uses recall mode');
            webActionsRef.current.chooseAnswer(value - 1);
            return { accepted: true, answerNumber: value };
          },
        },
        { signal: lifecycle.signal },
      );
    };
    void register().catch(() => {});
    return () => lifecycle.abort();
  }, [settings.level, settings.mode]);

  const terminalSeconds =
    hud.terminalDeadline === null
      ? null
      : Math.max(0, hud.terminalDeadline - hud.elapsed);
  const completedCount = Object.values(hud.completed).filter(Boolean).length;
  const junctionOptions = getJunctionOptions(hud);
  const dockedTerminal = terminalAtPlayer(hud);
  const atExit = playerAtExit(hud);
  const branchCost = hud.completed.C ? 28 : 40;
  const upCost = junctionOptions.up ? branchCost : 22;
  const downCost = junctionOptions.down ? branchCost : 22;
  const upLabel = junctionOptions.up
    ? routeActionLabel(junctionOptions.up)
    : 'Сдвиг вверх';
  const downLabel = junctionOptions.down
    ? routeActionLabel(junctionOptions.down)
    : 'Сдвиг вниз';
  const contextLabel = atExit
    ? 'Открыть ворота'
    : dockedTerminal
      ? `Терминал ${dockedTerminal.id}`
      : 'Активировать';

  return (
    <main className="game-shell">
      <section className="play-grid" aria-label="Игровой экран Conveyor">
        <section className="world-panel">
          <FactoryViewport runRef={runRef} />
          <div className="world-vignette" />
          <div className="viewport-brand">
            <Power />
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
          <div
            className={`viewport-clock ${terminalSeconds !== null && terminalSeconds < 12 ? 'is-critical' : ''}`}
          >
            <Timer />
            <span>{terminalSeconds === null ? 'СМЕНА' : 'СИНХРО'}</span>
            <strong>{formatClock(terminalSeconds ?? hud.timeLeft)}</strong>
          </div>
          <div className="viewport-vitals">
            <span aria-label={`Целостность ${hud.integrity} из 3`}>
              {'◆'.repeat(hud.integrity)}
              {'◇'.repeat(3 - hud.integrity)}
            </span>
            {hud.heat > 1 && (
              <span className={hud.heat > 74 ? 'is-hot' : ''}>
                НАГРЕВ {Math.round(hud.heat)}%
              </span>
            )}
          </div>
          {dockedTerminal && (
            <output className="dock-prompt">
              <strong>ТЕРМИНАЛ {dockedTerminal.id}</strong>
              <span>
                {hud.actionReady
                  ? 'Нажми SPACE, чтобы активировать'
                  : 'Ответь правильно — затем нажми SPACE'}
              </span>
            </output>
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
            </div>
            <div className="question-panel">
              <p className="question-label">{pool.question.prompt}</p>
              <h1>{pool.question.context}</h1>
              <p className="translation">{pool.question.translation}</p>
            </div>
            <div className="impulse-row">
              <div>
                <span>ИМПУЛЬС</span>
                <strong>{Math.round(hud.charge)}%</strong>
              </div>
              <div className="impulse-track">
                <i style={{ width: `${hud.charge}%` }} />
              </div>
              <small>−{hud.actionReady ? '4.5' : '3.3'}%/с</small>
            </div>
            <div className="answer-slot">
              {hud.actionReady ? (
                <div className="action-panel">
                  <div className="action-title">
                    <Sparkles />
                    <div>
                      <span>ХОД ДОСТУПЕН</span>
                      <strong>Один манёвр — выбирай сейчас</strong>
                    </div>
                  </div>
                  <div className="movement-pad">
                    <Button
                      variant="outline"
                      className="lane-up"
                      onClick={() => executeAction('up')}
                      disabled={hud.charge < upCost}
                      aria-label={`${upLabel}, стоимость ${upCost}% импульса`}
                    >
                      <kbd>W</kbd>
                      <ArrowUp />
                      <span>{upLabel}</span>
                      <small>{upCost}%</small>
                    </Button>
                    <Button
                      variant="outline"
                      className="move-back"
                      onClick={() => executeAction('left')}
                      disabled={hud.charge < 10}
                      aria-label="Рывок назад, стоимость 10% импульса"
                    >
                      <kbd>A</kbd>
                      <ArrowLeft />
                      <span>Назад</span>
                      <small>10%</small>
                    </Button>
                    <Button
                      variant="outline"
                      className="context-action"
                      onClick={() => executeAction('context')}
                      disabled={!dockedTerminal && !atExit}
                      aria-label={`${contextLabel}, доступно после верного ответа`}
                    >
                      <kbd>SPACE</kbd>
                      <Power />
                      <span>{contextLabel}</span>
                      <small>ГОТОВО</small>
                    </Button>
                    <Button
                      variant="outline"
                      className="move-forward"
                      onClick={() => executeAction('right')}
                      disabled={hud.charge < 10}
                      aria-label="Рывок вперёд, стоимость 10% импульса"
                    >
                      <kbd>D</kbd>
                      <ArrowRight />
                      <span>Вперёд</span>
                      <small>10%</small>
                    </Button>
                    <Button
                      variant="outline"
                      className="lane-down"
                      onClick={() => executeAction('down')}
                      disabled={hud.charge < downCost}
                      aria-label={`${downLabel}, стоимость ${downCost}% импульса`}
                    >
                      <kbd>S</kbd>
                      <ArrowDown />
                      <span>{downLabel}</span>
                      <small>{downCost}%</small>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="answer-panel">
                  {settings.mode === 'recognition' ? (
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
                        placeholder="Введи немецкий ответ…"
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

          <section className="bonus-dock" aria-labelledby="bonus-title">
            <div className="dock-heading">
              <span id="bonus-title">БОНУСЫ</span>
            </div>
            <div className="bonus-grid">
              {BONUS_ORDER.map((bonus) => {
                const Icon = BONUS_ICONS[bonus];
                const owned = hud.bonuses[bonus];
                const cooldown = hud.cooldowns[bonus];
                const disabled =
                  hud.phase !== 'playing' || owned <= 0 || cooldown > 0;
                const reason =
                  owned <= 0
                    ? 'не заработан'
                    : cooldown > 0
                      ? `${Math.ceil(cooldown)} с`
                      : BONUS_DATA[bonus].detail;
                return (
                  <Button
                    key={bonus}
                    variant="outline"
                    className={`bonus-button tone-${BONUS_TONES[bonus]} ${owned > 0 ? 'is-owned' : ''}`}
                    disabled={disabled}
                    onClick={() => activateBonus(bonus)}
                    title={disabled ? reason : BONUS_DATA[bonus].detail}
                  >
                    <kbd>{BONUS_DATA[bonus].key}</kbd>
                    <Icon aria-hidden="true" />
                    <strong>{BONUS_DATA[bonus].label}</strong>
                    <small>{reason}</small>
                    {owned > 0 && <em>×{owned}</em>}
                  </Button>
                );
              })}
            </div>
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
              <h1 id="menu-title">Фабрика не ставится на паузу.</h1>
              <p>
                Правильный ответ даёт сгорающий импульс. Используй его сразу или
                рискни подождать лучшую геометрию.
              </p>
              <div className="setup-grid">
                <label>
                  <span>Уровень</span>
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
                  <small>создаёт импульс</small>
                </span>
                <span>
                  <b>02</b>
                  <strong>Манёвр</strong>
                  <small>тратит заряд</small>
                </span>
                <span>
                  <b>03</b>
                  <strong>A · B · C</strong>
                  <small>в любом порядке</small>
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
                <Button className="start-button" onClick={() => startRun()}>
                  <Power /> {settingsOpen ? 'Начать заново' : 'Запустить смену'}
                  <span>{RUN_DURATION_SECONDS} секунд</span>
                </Button>
              </div>
            </div>
          </div>
        </dialog>
      )}

      {(hud.phase === 'won' || hud.phase === 'lost') && (
        <dialog
          open
          className="result-overlay"
          aria-modal="true"
          aria-labelledby="result-title"
        >
          <div className={`result-card ${hud.phase}`}>
            {hud.phase === 'won' ? <Trophy /> : <ShieldAlert />}
            <span>
              {hud.phase === 'won' ? 'СМЕНА ЗАВЕРШЕНА' : 'ЛИНИЯ ОСТАНОВЛЕНА'}
            </span>
            <h1 id="result-title">
              {hud.phase === 'won'
                ? 'Система синхронизирована.'
                : hud.lossReason}
            </h1>
            <div className="result-stats">
              <span>
                <small>Счёт</small>
                <b>{hud.score}</b>
              </span>
              <span>
                <small>Терминалы</small>
                <b>{completedCount}/3</b>
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
              <Button onClick={() => startRun()}>
                <RotateCcw /> Ещё смена
              </Button>
            </div>
          </div>
        </dialog>
      )}
    </main>
  );
}
