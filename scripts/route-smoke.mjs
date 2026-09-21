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
  MACHINE_CYCLES_PER_PASSAGE,
  MACHINE_CYCLE_STAGES,
  PROCESSING_MACHINE_IDS,
  TUTORIAL_LEVEL_COUNT,
  applyMachineEffect,
  createProcessingState,
  describeProcessingRequirements,
  evaluateProcessingState,
  levelConfig,
  machineCyclePhase,
  machineCycleStrike,
  processingLevel,
  returnableFork,
  simulateProcessingPlan,
} from '../lib/processing-game.ts';

// Every lesson, plus a stretch of generated shifts far enough out that the
// recipe has grown extra forks.
const SAMPLE_LEVELS = [
  ...Array.from({ length: TUTORIAL_LEVEL_COUNT }, (_, index) => index + 1),
  TUTORIAL_LEVEL_COUNT + 1,
  TUTORIAL_LEVEL_COUNT + 4,
  TUTORIAL_LEVEL_COUNT + 9,
  TUTORIAL_LEVEL_COUNT + 17,
];

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
// Park the part inside a committed branch rather than at a hand-picked number,
// so the layout can move without the test going quietly meaningless.
const branchFork = levelConfig(4).forks[0];
committed.factoryProgress = (branchFork.commitAt + branchFork.mergeAt) / 2;
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
  evaluateProcessingState(pressed, processingLevel(1).target).complete,
  true,
  'one hot press strike must produce an acceptable level-one part',
);
const overPressed = applyMachineEffect(pressed, 'press').state;
assert.equal(
  evaluateProcessingState(overPressed, processingLevel(1).target).complete,
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

for (const levelId of SAMPLE_LEVELS) {
  const level = processingLevel(levelId);
  const config = levelConfig(levelId);
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
  evaluateProcessingState(afterFirstBeat, processingLevel(1).target).complete,
  true,
  'leaving after the first beat must still produce an acceptable part',
);
assert.equal(
  evaluateProcessingState(afterEveryBeat, processingLevel(1).target).complete,
  false,
  'taking all three beats must reject the part',
);
assert.ok(
  afterEveryBeat.thickness < afterFirstBeat.thickness,
  'every beat has to bite, not just the first',
);

// The spec the player reads on the left has to say the same thing the grader
// decides, or the panel teaches the wrong lesson.
for (const levelId of SAMPLE_LEVELS) {
  const target = processingLevel(levelId).target;
  for (const state of [
    createProcessingState(),
    applyMachineEffect(createProcessingState(), 'furnace').state,
    simulateProcessingPlan(processingLevel(levelId).viablePlans[0].machines),
  ]) {
    const report = evaluateProcessingState(state, target);
    const requirements = describeProcessingRequirements(state, target);
    // Four dimensions and the crack limit are always graded; bend, holes and
    // finish only appear when the order actually asks for them.
    assert.ok(
      requirements.length >= 5 && requirements.length <= 8,
      `L${levelId}: ${requirements.length} requirement lines`,
    );
    assert.equal(
      requirements.length,
      new Set(requirements.map((requirement) => requirement.key)).size,
      'a measurement may not be graded twice',
    );
    for (const requirement of requirements) {
      assert.ok(
        requirement.label,
        'a requirement without a label is unreadable',
      );
      assert.ok(
        requirement.demand.trim(),
        'a requirement must be stated in words',
      );
      assert.ok(
        requirement.valueText.trim(),
        'the current value must be printed',
      );
      assert.equal(
        requirement.met,
        report.matched[requirement.key],
        `L${levelId} ${requirement.key}: the panel and the grader disagree`,
      );
      assert.equal(
        requirement.correction === '',
        requirement.met,
        `L${levelId} ${requirement.key}: a failing measurement must say what is wrong`,
      );
      assert.ok(
        requirement.range.max >= requirement.range.min,
        'a tolerance window cannot be inverted',
      );
    }
  }
}

// A cold blank on level one has to read as three separate problems, and the
// level's own plan has to clear every one of them.
const coldSpec = describeProcessingRequirements(
  createProcessingState(),
  processingLevel(1).target,
);
assert.deepEqual(
  coldSpec.filter((requirement) => !requirement.met).map((r) => r.key),
  ['temperature', 'thickness', 'width'],
  'a cold blank on the first lesson has to read as three separate problems',
);
const finishedSpec = describeProcessingRequirements(
  simulateProcessingPlan(processingLevel(1).viablePlans[0].machines),
  processingLevel(1).target,
);
assert.ok(
  finishedSpec.every((requirement) => requirement.met),
  'the level plan must satisfy every stated requirement',
);

// The press is survivable only because one shift forward clears the beats that
// are left; a longer press zone than the shift would trap the part.
for (const levelId of SAMPLE_LEVELS) {
  const config = levelConfig(levelId);
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

/* --- generated shifts ------------------------------------------------ */

for (const levelId of SAMPLE_LEVELS) {
  const level = processingLevel(levelId);
  const config = levelConfig(levelId);
  const label = `L${levelId}`;

  // A generated order is only fair if the line it was generated with can fill
  // it. The plan is simulated straight through, with no player skill involved.
  const finished = simulateProcessingPlan(level.viablePlans[0].machines);
  const report = evaluateProcessingState(finished, level.target);
  assert.ok(
    report.complete,
    `${label}: its own plan leaves the order unfilled (${report.issues.join('; ')})`,
  );

  // One machine per branch, and the other branch is a clean run past it. That
  // is what makes the return loop a complete repair rather than a consolation.
  assert.equal(
    config.forks.length,
    level.forks,
    `${label}: fork count disagrees with the level`,
  );
  for (const fork of config.forks) {
    const branchSections = config.sections.filter(
      (section) =>
        section.start >= fork.commitAt &&
        section.end <= fork.mergeAt &&
        section.lane !== 'both',
    );
    const onMachineLane = branchSections.filter(
      (section) => section.lane === fork.machineLane,
    );
    const onBypassLane = branchSections.filter(
      (section) => section.lane !== fork.machineLane,
    );
    assert.equal(
      onMachineLane.length,
      1,
      `${label} ${fork.id}: a branch must hold exactly one machine`,
    );
    assert.equal(onMachineLane[0].kind, 'machine');
    assert.equal(onMachineLane[0].machineId, fork.machineId);
    assert.equal(
      onBypassLane.length,
      1,
      `${label} ${fork.id}: the other branch must be a single clean run`,
    );
    assert.equal(
      onBypassLane[0].kind,
      'clean',
      `${label} ${fork.id}: a bypass may not carry a machine`,
    );
    assert.ok(
      fork.prepSeconds >= 8 && fork.prepSeconds <= 12,
      `${label} ${fork.id}: fork prep must stay 8-12 seconds`,
    );
    // The way back: a loop that starts where the branches merge.
    assert.ok(
      fork.returnEnd > fork.returnStart,
      `${label} ${fork.id}: the return loop has no length`,
    );
    assert.equal(returnableFork(levelId, fork.returnStart)?.id, fork.id);
    assert.equal(returnableFork(levelId, fork.returnEnd)?.id, fork.id);
    assert.equal(
      returnableFork(levelId, fork.decisionStart),
      null,
      `${label} ${fork.id}: the loop may not be offered before the choice`,
    );
  }

  // Sections must march forwards and finish with the inspection.
  const spine = config.sections.filter((section) => section.lane === 'both');
  for (const [index, section] of spine.entries()) {
    assert.ok(section.end > section.start, `${label}: ${section.id} is empty`);
    if (index > 0)
      assert.ok(
        section.start >= spine[index - 1].start,
        `${label}: ${section.id} runs backwards`,
      );
  }
  assert.equal(spine.at(-1)?.kind, 'inspection');
  assert.equal(config.finishAt, spine.at(-1)?.end);

  for (const machineId of level.unlockedMachines)
    assert.ok(
      PROCESSING_MACHINE_IDS.includes(machineId),
      `${label}: unknown machine ${machineId}`,
    );
}

// Generation is deterministic: the same level id always rebuilds the same shift.
assert.deepEqual(
  levelConfig(TUTORIAL_LEVEL_COUNT + 6),
  levelConfig(TUTORIAL_LEVEL_COUNT + 6),
);
assert.notDeepEqual(
  levelConfig(TUTORIAL_LEVEL_COUNT + 6).sections,
  levelConfig(TUTORIAL_LEVEL_COUNT + 7).sections,
  'two generated shifts in a row must not be the same line',
);

// Taking the bypass leaves the metal untouched, which is exactly why riding the
// return loop and entering the machine repairs the mistake completely.
const bypassLevel = TUTORIAL_LEVEL_COUNT + 2;
const bypassFork = levelConfig(bypassLevel).forks[0];
const beforeFork = simulateProcessingPlan(['furnace']);
const bypassed = simulateProcessingPlan(['furnace']);
assert.deepEqual(
  { ...bypassed, machineHistory: [] },
  { ...beforeFork, machineHistory: [] },
  'a bypass must not change the workpiece',
);
const repaired = simulateProcessingPlan(['furnace', bypassFork.machineId]);
assert.notDeepEqual(
  { ...repaired, machineHistory: [] },
  { ...bypassed, machineHistory: [] },
  'entering the machine on the second pass has to do something',
);

/* --- the way back ---------------------------------------------------- */

// The problem the loop exists for: once a lane is committed it cannot be
// switched, and the line only runs forwards. Without a way back, a branch taken
// by mistake is the end of the shift.
const loopLevel = TUTORIAL_LEVEL_COUNT + 3;
const loopFork = levelConfig(loopLevel).forks[0];
let loopRun = setProcessingLevel(createRun(), loopLevel);

loopRun.factoryProgress = (loopFork.commitAt + loopFork.mergeAt) / 2;
assert.equal(
  consumeProcessingAction(resolveProcessingQuiz(loopRun, true).run, 'toggle-lane')
    .consumed,
  false,
  'a committed branch still cannot be switched in place',
);

// Off the loop the action is refused and the earned action is kept.
loopRun.factoryProgress = loopFork.decisionStart;
const tooEarly = consumeProcessingAction(
  resolveProcessingQuiz(loopRun, true).run,
  'recirculate',
);
assert.equal(tooEarly.consumed, false);
assert.equal(tooEarly.run.actionReady, true);

// On the loop it sends the part back to the decision, lane cleared.
loopRun.factoryProgress = loopFork.returnStart + 1;
loopRun.processingLane = 'lower';
const sentBack = consumeProcessingAction(
  resolveProcessingQuiz(loopRun, true).run,
  'recirculate',
);
assert.equal(sentBack.consumed, true);
assert.equal(sentBack.rewoundTo, loopFork.decisionStart);
assert.equal(sentBack.run.factoryProgress, loopFork.decisionStart);
assert.equal(sentBack.run.playerX, loopFork.decisionStart);
assert.equal(
  sentBack.run.actionReady,
  false,
  'the loop costs the earned action like every other move',
);
assert.equal(
  returnableFork(loopLevel, sentBack.run.factoryProgress),
  null,
  'after the rewind the part is upstream of the loop again',
);
// Back at the decision the lane is free, so the fork is a real choice again.
const rechosen = consumeProcessingAction(
  resolveProcessingQuiz(sentBack.run, true).run,
  'toggle-lane',
);
assert.equal(
  rechosen.consumed,
  true,
  'the whole point of the loop is that the branch can be picked again',
);

// The metal itself is untouched: the loop costs time, not quality.
assert.deepEqual(sentBack.run.workpiece, loopRun.workpiece);

process.stdout.write('processing smoke passed\n');
