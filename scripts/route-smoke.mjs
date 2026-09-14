import assert from 'node:assert/strict';

import {
  activateProcessingBonus,
  chooseProcessingBonus,
  consumeProcessingAction,
  createRun,
  resolveProcessingQuiz,
  setProcessingLevel,
} from '../lib/conveyor-game.ts';
import {
  LEVEL_CONFIGS,
  PROCESSING_LEVELS,
  applyMachineEffect,
  createProcessingState,
  evaluateProcessingState,
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

process.stdout.write('processing smoke passed\n');
