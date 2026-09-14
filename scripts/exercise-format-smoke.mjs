import assert from 'node:assert/strict';

import {
  EXERCISE_FORMATS,
  TOPIC_RULES,
  exerciseFormatFor,
  qualityRules,
  topicRuleFor,
  usesEveryFragment,
  wordOrderFragments,
} from '../lib/exercise-formats.ts';
import { GRAMMAR_TOPICS } from '../lib/learning-settings.ts';

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
