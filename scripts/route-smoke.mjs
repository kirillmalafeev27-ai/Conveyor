import assert from 'node:assert/strict';

import {
  EARNED_ACTION_DECAY_PER_SECOND,
  PROCESSING_FORWARD_SHIFT,
  QUIZ_IMPULSE_DECAY_PER_SECOND,
  activateProcessingBonus,
  chooseProcessingBonus,
  consumeProcessingAction,
  createRun,
  resolveProcessingQuiz,
  setProcessingLevel,
} from '../lib/conveyor-game.ts';
import {
  LEVEL_CONFIGS,
  MACHINE_CYCLES_PER_PASSAGE,
  MACHINE_CYCLE_STAGES,
  PROCESSING_LEVELS,
  applyMachineEffect,
  createProcessingState,
  evaluateProcessingState,
  machineCyclePhase,
  machineCycleStrike,
  simulateProcessingPlan,
} from '../lib/processing-game.ts';

const initial = setProcessingLevel(createRun(), 4);
const beforeWrong = structuredClone(initial.workpiece);
const wrong = resolveProcessingQuiz(initial, false);
assert.equal(wrong.accepted, true);
assert.equal(wrong.grantedAction, false);
assert.equal(wrong.run.actionReady, false);
assert.deepEqual(wrong.run.workpiece, beforeWrong);
assert.equal(wrong.run.bonusProgress, 0);

const correct = resolveProcessingQuiz(wrong.run, true);
assert.equal(correct.grantedAction, true);
const toggled = consumeProcessingAction(correct.run, 'toggle-lane');
assert.equal(toggled.consumed, true);
assert.equal(toggled.run.processingLane, 'lower');
assert.equal(toggled.longitudinalDelta, 0);
assert.equal(
  consumeProcessingAction(toggled.run, 'shift-forward').consumed,
  false,
  'one correct answer must never grant two actions',
);

const committed = resolveProcessingQuiz(initial, true).run;
committed.factoryProgress = 52;
const blockedLaneChange = consumeProcessingAction(committed, 'toggle-lane');
assert.equal(blockedLaneChange.consumed, false);
assert.equal(blockedLaneChange.run.processingLane, 'upper');
assert.equal(
  blockedLaneChange.run.actionReady,
  true,
  'a rejected mid-branch lane change must preserve the earned action',
);
assert.equal(
  consumeProcessingAction(blockedLaneChange.run, 'shift-forward').consumed,
  true,
);

let rewardRun = initial;
for (let index = 0; index < 3; index += 1) {
  const resolution = resolveProcessingQuiz(rewardRun, true);
  rewardRun = consumeProcessingAction(resolution.run, 'shift-backward').run;
}
assert.equal(rewardRun.bonusProgress, 3);
assert.equal(rewardRun.bonusOffer?.length, 2);
const firstChoice = rewardRun.bonusOffer[0];
let stored = chooseProcessingBonus(rewardRun, firstChoice).run;
assert.equal(stored.storedProcessingBonus, firstChoice);
assert.equal(stored.bonusOffer, null);

for (let index = 0; index < 3; index += 1) {
  const resolution = resolveProcessingQuiz(stored, true);
  stored = consumeProcessingAction(resolution.run, 'shift-forward').run;
}
assert.equal(
  stored.bonusOffer?.length,
  2,
  'a new offer must appear even while one bonus is stored',
);
const replacement =
  stored.bonusOffer.find((id) => id !== firstChoice) ?? stored.bonusOffer[0];
stored = chooseProcessingBonus(stored, replacement).run;
assert.equal(stored.storedProcessingBonus, replacement);

let boosted = structuredClone(initial);
boosted.bonusOffer = ['booster', 'damper'];
boosted = chooseProcessingBonus(boosted, 'booster').run;
boosted = activateProcessingBonus(boosted).run;
assert.equal(boosted.nextMachineMultiplier, 1.75);
assert.equal(boosted.storedProcessingBonus, null);

const cold = createProcessingState();
const hot = applyMachineEffect(cold, 'furnace').state;
assert.ok(hot.temperature > cold.temperature);
const pressed = applyMachineEffect(hot, 'press').state;
assert.ok(pressed.thickness < hot.thickness);
assert.ok(pressed.width > hot.width);
assert.equal(pressed.cracked, false);
assert.equal(
  evaluateProcessingState(pressed, PROCESSING_LEVELS[1].target).complete,
  true,
  'one hot press strike must produce an acceptable level-one part',
);
const overPressed = applyMachineEffect(pressed, 'press').state;
assert.equal(
  evaluateProcessingState(overPressed, PROCESSING_LEVELS[1].target).complete,
  false,
  'lingering for a second press strike must reject the level-one part',
);
const coldPressed = applyMachineEffect(cold, 'press').state;
assert.ok(coldPressed.crackRisk > cold.crackRisk);
const rolled = applyMachineEffect(pressed, 'rollers').state;
assert.ok(rolled.length > pressed.length);
assert.ok(rolled.width < pressed.width);
const cooled = applyMachineEffect(rolled, 'cooling').state;
assert.ok(cooled.temperature < rolled.temperature);
const cut = applyMachineEffect(cooled, 'cutter').state;
assert.ok(cut.length < cooled.length);

for (const levelId of [1, 2, 3, 4, 5]) {
  const level = PROCESSING_LEVELS[levelId];
  const config = LEVEL_CONFIGS[levelId];
  assert.ok(config.finishAt > config.startAt);
  assert.ok(config.sections.some((section) => section.kind === 'inspection'));
  assert.equal(config.forks.length, level.forks);
  for (const fork of config.forks)
    assert.ok(
      fork.prepSeconds >= 8 && fork.prepSeconds <= 12,
      `L${levelId} fork prep must be 8–12 seconds`,
    );
  for (const plan of level.viablePlans) {
    const state = simulateProcessingPlan(plan.machines);
    const quality = evaluateProcessingState(state, level.target);
    assert.ok(
      quality.score >= 80,
      `L${levelId} plan ${plan.id} should remain close to its target`,
    );
  }
}

// Every machine runs three cycles per passage, evenly spaced, and works at the
// middle of each one — the rhythm the player counts and times an action against.
assert.equal(MACHINE_CYCLES_PER_PASSAGE, 3);
assert.equal(MACHINE_CYCLE_STAGES.length, MACHINE_CYCLES_PER_PASSAGE);
for (const [index, stage] of MACHINE_CYCLE_STAGES.entries()) {
  assert.ok(stage > 0 && stage < 1, 'a beat may not land on the zone edge');
  assert.equal(
    Number(stage.toFixed(6)),
    Number(((index + 0.5) / MACHINE_CYCLES_PER_PASSAGE).toFixed(6)),
    'beats must sit at the centre of evenly spaced cycles',
  );
  assert.equal(
    machineCycleStrike(stage, 0.075),
    1,
    'a beat peaks at its stage',
  );
  assert.equal(
    Number(machineCyclePhase(stage).toFixed(6)),
    0.5,
    'the cycle is halfway through when it does its work',
  );
}
assert.equal(
  machineCycleStrike(0, 0.075),
  0,
  'entering a zone must not strike',
);
assert.equal(machineCycleStrike(1, 0.075), 0, 'leaving a zone must not strike');
assert.equal(machineCyclePhase(0), 0);
// Three cycles means the phase returns to its start twice inside the passage.
for (const boundary of [1 / 3, 2 / 3]) {
  assert.ok(
    machineCyclePhase(boundary) < 1e-9,
    `a new cycle must start at ${boundary}`,
  );
}

// What the three beats mean for the part: riding the whole press zone out is
// over-pressing, so the action exists to leave after the first one.
const hotBlank = applyMachineEffect(createProcessingState(), 'furnace').state;
const afterFirstBeat = applyMachineEffect(hotBlank, 'press').state;
const afterEveryBeat = MACHINE_CYCLE_STAGES.reduce(
  (state) => applyMachineEffect(state, 'press').state,
  hotBlank,
);
assert.equal(
  evaluateProcessingState(afterFirstBeat, PROCESSING_LEVELS[1].target).complete,
  true,
  'leaving after the first beat must still produce an acceptable part',
);
assert.equal(
  evaluateProcessingState(afterEveryBeat, PROCESSING_LEVELS[1].target).complete,
  false,
  'taking all three beats must reject the part',
);
assert.ok(
  afterEveryBeat.thickness < afterFirstBeat.thickness,
  'every beat has to bite, not just the first',
);

// The press is survivable only because one shift forward clears the beats that
// are left; a longer press zone than the shift would trap the part.
for (const [levelId, config] of Object.entries(LEVEL_CONFIGS)) {
  for (const section of config.sections) {
    if (section.kind !== 'machine' || section.machineId !== 'press') continue;
    const length = section.end - section.start;
    const firstBeatAt = section.start + length * MACHINE_CYCLE_STAGES[0];
    assert.ok(
      firstBeatAt + PROCESSING_FORWARD_SHIFT >= section.end,
      `L${levelId} press: one shift forward must clear the remaining beats`,
    );
  }
}

// Impulse burns fast enough to press the answer, and faster still once the
// action is earned and waiting to be spent.
assert.ok(
  EARNED_ACTION_DECAY_PER_SECOND > QUIZ_IMPULSE_DECAY_PER_SECOND,
  'a held action must burn faster than the question itself',
);
const answerSeconds = 100 / QUIZ_IMPULSE_DECAY_PER_SECOND;
assert.ok(
  answerSeconds > 25 && answerSeconds < 50,
  `a full charge should last 25-50s of answering, got ${answerSeconds.toFixed(1)}s`,
);

process.stdout.write('processing smoke passed\n');
