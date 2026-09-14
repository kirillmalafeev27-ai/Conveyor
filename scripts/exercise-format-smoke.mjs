import assert from 'node:assert/strict';

import {
  AUDIO_QUALITY_RULES,
  EXERCISE_FORMATS,
  TOPIC_RULES,
  exerciseFormatFor,
  exerciseHint,
  qualityRules,
  topicRuleFor,
  usesEveryFragment,
  wordOrderFragments,
} from '../lib/exercise-formats.ts';
import {
  GRAMMAR_TOPICS,
  QUESTION_MODES,
  learningPoolKey,
} from '../lib/learning-settings.ts';

const offered = new Set(GRAMMAR_TOPICS);
assert.deepEqual(
  Object.keys(TOPIC_RULES).filter((topic) => !offered.has(topic)),
  [],
  'every topic rule must name a grammar topic the setup screen offers',
);

const praeteritum = TOPIC_RULES['Präteritum'];
assert.ok(praeteritum);
assert.equal(topicRuleFor('Präteritum'), praeteritum);
assert.equal(
  topicRuleFor('Praeteritum'),
  praeteritum,
  'ASCII umlaut spellings must reach the same rule',
);
assert.equal(topicRuleFor('Nominalisierung'), '');
assert.equal(topicRuleFor(undefined), '');

assert.deepEqual(
  GRAMMAR_TOPICS.filter(
    (topic) => exerciseFormatFor(topic).id === 'word-order',
  ),
  ['Wortstellung im Hauptsatz', 'Wortstellung im Nebensatz'],
  'only the word-order topics may leave the gap format',
);
assert.equal(exerciseFormatFor('Dativ'), EXERCISE_FORMATS.gap);

for (const topic of ['Dativ', 'Wortstellung im Hauptsatz']) {
  assert.equal(
    exerciseFormatFor(topic, 'audio'),
    EXERCISE_FORMATS.audio,
    'listening must replace the written shape whatever the grammar topic is',
  );
}
assert.equal(exerciseFormatFor('Dativ', 'recall'), EXERCISE_FORMATS.gap);
assert.ok(AUDIO_QUALITY_RULES.length >= 4);

for (const format of Object.values(EXERCISE_FORMATS)) {
  for (const mode of QUESTION_MODES) {
    assert.ok(
      exerciseHint(format, mode.id),
      `${format.id} has no hint for ${mode.id}`,
    );
  }
}

const poolBase = {
  level: 'A2',
  lexicalTopic: 'Alltag & Routinen',
  grammarTopic: 'Präsens',
};
assert.equal(
  learningPoolKey({ ...poolBase, mode: 'recognition' }),
  learningPoolKey({ ...poolBase, mode: 'recall' }),
  'the two written modes deliberately share one pool',
);
assert.notEqual(
  learningPoolKey({ ...poolBase, mode: 'audio' }),
  learningPoolKey({ ...poolBase, mode: 'recognition' }),
  'listening must keep a queue of its own',
);
assert.equal(
  learningPoolKey({ ...poolBase, mode: 'audio' }),
  learningPoolKey({ ...poolBase, grammarTopic: 'Passiv', mode: 'audio' }),
  'the grammar topic must not split the listening queue',
);

const context = 'am Wochenende / wir / besuchen / unsere Großeltern';
assert.deepEqual(wordOrderFragments(context), [
  'am Wochenende',
  'wir',
  'besuchen',
  'unsere Großeltern',
]);
assert.ok(
  usesEveryFragment(context, 'Am Wochenende besuchen wir unsere Großeltern.'),
);
assert.ok(
  !usesEveryFragment(context, 'Am Wochenende besuchen wir.'),
  'a dropped fragment must fail the word-order check',
);
assert.ok(
  !usesEveryFragment(
    context,
    'Am Wochenende besuchen wir heute unsere Großeltern.',
  ),
  'an invented word must fail the word-order check',
);

const rules = qualityRules('Reflexive Verben');
assert.equal(rules.length, 10);
assert.ok(rules.some((rule) => rule.includes('"Reflexive Verben"')));

process.stdout.write('exercise format smoke passed\n');
