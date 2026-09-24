import assert from 'node:assert/strict';

import {
  AUDIO_QUALITY_RULES,
  EXERCISE_FORMATS,
  TOPIC_RULES,
  WORD_FIELDS,
  WORD_FIELD_SYNONYM_COUNT,
  WORD_FIELD_TOPIC,
  exerciseFormatFor,
  exerciseHint,
  isWordFieldTopic,
  pickWordFields,
  qualityRules,
  topicRuleFor,
  usesEveryFragment,
  wordFieldBank,
  wordFieldFor,
  wordFieldInstruction,
  wordFieldQualityRules,
  wordFieldSynonymOf,
  wordFieldsForLevel,
  wordOrderFragments,
} from '../lib/exercise-formats.ts';
import {
  GRAMMAR_TOPICS,
  GRAMMAR_TOPIC_GROUPS,
  LANGUAGE_LEVELS,
  QUESTION_MODES,
  learningPoolKey,
} from '../lib/learning-settings.ts';
import {
  WORD_FIELD_FALLBACK_QUESTIONS,
  exerciseFormatOf,
  fallbackQuestionsFor,
  normalizeQuestion,
} from '../lib/questions.ts';

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
assert.deepEqual(
  GRAMMAR_TOPICS.filter(
    (topic) => exerciseFormatFor(topic).id === 'word-field',
  ),
  [WORD_FIELD_TOPIC],
  'exactly one grammar topic may reach the synonym format',
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

// --- Wortfelder ------------------------------------------------------------

assert.ok(
  GRAMMAR_TOPIC_GROUPS.some((group) => group.topics.includes(WORD_FIELD_TOPIC)),
  'the synonym topic has to be reachable from the setup screen',
);
assert.deepEqual(
  GRAMMAR_TOPICS.filter(
    (topic) =>
      GRAMMAR_TOPIC_GROUPS.filter((group) => group.topics.includes(topic))
        .length !== 1,
  ),
  [],
  'every grammar topic belongs to exactly one group of the picker',
);
assert.ok(isWordFieldTopic(WORD_FIELD_TOPIC));
assert.ok(!isWordFieldTopic('Dativ'));
assert.ok(topicRuleFor(WORD_FIELD_TOPIC).length > 80);

const allSynonyms = [];
for (const field of WORD_FIELDS) {
  assert.equal(
    field.synonyms.length,
    WORD_FIELD_SYNONYM_COUNT,
    `${field.base} must carry exactly five synonyms`,
  );
  assert.equal(
    new Set(field.synonyms.map((entry) => entry.word)).size,
    WORD_FIELD_SYNONYM_COUNT,
    `${field.base} repeats a synonym`,
  );
  for (const entry of field.synonyms) {
    assert.ok(entry.sense.length > 8, `${entry.word} has no sense note`);
    assert.ok(
      /[А-Яа-яЁё]/u.test(entry.sense),
      `${entry.word} must explain its nuance in Russian`,
    );
    // A separable verb splits around the sentence and would need a second
    // gap, and this format promises exactly one.
    assert.ok(
      !/^(ab|an|auf|aus|ein|mit|nach|vor|zu|zurück|weg|her|hin|los)[a-zäöüß]{3,}en$/u.test(
        entry.word,
      ),
      `${entry.word} looks separable, so it cannot fill a single gap`,
    );
    allSynonyms.push(entry.word);
  }
  assert.ok(
    wordFieldFor(field.base.toUpperCase()) === field,
    'a field has to be findable however its base word is cased',
  );
  assert.deepEqual(
    wordFieldBank(field),
    field.synonyms.map((entry) => entry.word),
  );
  assert.equal(
    wordFieldSynonymOf(field, field.synonyms[2].word.toUpperCase())?.word,
    field.synonyms[2].word,
  );
  assert.equal(wordFieldSynonymOf(field, 'Nichtsynonym'), undefined);
}
assert.equal(
  new Set(allSynonyms).size,
  allSynonyms.length,
  'a synonym may belong to one field only, or a wrong option is arguable',
);
assert.equal(
  new Set(WORD_FIELDS.map((field) => field.base)).size,
  WORD_FIELDS.length,
);

for (const level of LANGUAGE_LEVELS) {
  const pool = wordFieldsForLevel(level);
  assert.ok(pool.length >= 3, `${level} has too few fields to rotate`);
  const picked = pickWordFields(level, 0, 2);
  assert.equal(picked.length, 2);
  assert.notEqual(picked[0].base, picked[1].base);
  // Ten synonyms behind a batch of eight is what lets every item drill a
  // synonym no other item in the package has used.
  assert.ok(picked.length * WORD_FIELD_SYNONYM_COUNT >= 8);
}
assert.deepEqual(
  wordFieldsForLevel('A1').map((field) => field.level),
  wordFieldsForLevel('A1').map(() => 'A1'),
  'an A1 shift may only meet the fields marked A1',
);
assert.ok(
  wordFieldsForLevel('B2').length > wordFieldsForLevel('A1').length,
  'a higher level has to unlock more fields',
);
assert.equal(
  pickWordFields('B2', 3, 2)[0],
  wordFieldsForLevel('B2')[6],
  'the rotation steps a whole package at a time',
);
{
  const pool = wordFieldsForLevel('B2');
  const seen = new Set();
  const packages = Math.ceil(pool.length / 2);
  for (let seed = 0; seed < packages; seed += 1) {
    for (const field of pickWordFields('B2', seed, 2)) seen.add(field.base);
  }
  assert.equal(
    seen.size,
    pool.length,
    'the rotation must walk the whole catalogue before it repeats a field',
  );
}

const fieldRules = wordFieldQualityRules(pickWordFields('A2', 0, 2));
assert.ok(fieldRules.length >= 8);
assert.ok(
  fieldRules.some((rule) => /Uebersetzung/u.test(rule)),
  'the translation is the giveaway this format has to close',
);

assert.equal(
  wordFieldInstruction('sagen'),
  'Вместо стёртого «sagen» вставьте точный синоним.',
);

// Reserve items are written in the form the sentence needs, so a synonym is
// recognised by the stem it shares with its dictionary form.
function nearestSynonym(field, option) {
  const fold = (value) =>
    value
      .toLocaleLowerCase('de-DE')
      .replace(/ß/gu, 'ss')
      .replace(/[^\p{Letter}]+/gu, '');
  const target = fold(option);
  let best = '';
  let bestLength = 0;
  for (const word of wordFieldBank(field)) {
    const candidate = fold(word);
    let shared = 0;
    while (
      shared < candidate.length &&
      shared < target.length &&
      candidate[shared] === target[shared]
    ) {
      shared += 1;
    }
    if (shared > bestLength) {
      best = word;
      bestLength = shared;
    }
  }
  return bestLength >= Math.min(4, target.length) ? best : '';
}

// The reserve has to answer for the format when the server cannot.
assert.ok(WORD_FIELD_FALLBACK_QUESTIONS.length >= 6);
for (const question of WORD_FIELD_FALLBACK_QUESTIONS) {
  const field = wordFieldFor(question.wordFieldBase);
  assert.ok(field, `${question.context} names no catalogued field`);
  assert.equal(question.context.split('___').length - 1, 1);
  assert.equal(question.prompt, wordFieldInstruction(field.base));
  assert.equal(exerciseFormatOf(question).id, 'word-field');
  // A generated item declares its four synonyms outright (optionBases), so the
  // server checks them by name. A hand-written reserve has no such list, and
  // its options are inflected, so here they are traced back by their stem.
  const matched = question.options.map((option) =>
    nearestSynonym(field, option),
  );
  assert.deepEqual(
    matched.filter((word) => !word),
    [],
    `${question.context}: an option belongs to no synonym of «${field.base}»`,
  );
  assert.equal(
    new Set(matched).size,
    4,
    `${question.context}: four different synonyms of one field, always`,
  );
  assert.ok(
    /[А-Яа-яЁё]/u.test(question.translation),
    'the reserve keeps a Russian translation',
  );
  assert.ok(
    !question.translation.includes(question.options[question.correct]),
    'the translation must not print the German answer',
  );
}
assert.ok(
  WORD_FIELD_FALLBACK_QUESTIONS.some((question) => question.level === 'A1'),
  'an A1 player needs reserve items too',
);
assert.equal(
  fallbackQuestionsFor({
    level: 'B2',
    lexicalTopic: 'Alltag & Routinen',
    grammarTopic: WORD_FIELD_TOPIC,
    mode: 'recognition',
  })[0].wordFieldBase !== undefined,
  true,
  'the synonym topic has to fall back to synonym items',
);
assert.equal(
  fallbackQuestionsFor({
    level: 'B2',
    lexicalTopic: 'Alltag & Routinen',
    grammarTopic: 'Dativ',
    mode: 'recognition',
  }).every((question) => question.wordFieldBase === undefined),
  true,
  'a grammar topic must never be answered with synonym items',
);

// An unknown base word is dropped rather than shown as a field the player
// cannot look up.
assert.equal(
  normalizeQuestion({
    prompt: wordFieldInstruction('sagen'),
    context: 'Das Baby schläft, deshalb ___ wir nur noch.',
    translation: 'Малыш спит, поэтому мы теперь только говорим.',
    options: ['flüstern', 'rufen', 'murmeln', 'behaupten'],
    correct: 0,
    rule: 'flüstern — очень тихо.',
    wordFieldBase: 'quatschen',
  }).wordFieldBase,
  undefined,
);
assert.equal(
  normalizeQuestion({
    prompt: wordFieldInstruction('sagen'),
    context: 'Das Baby schläft, deshalb ___ wir nur noch.',
    translation: 'Малыш спит, поэтому мы теперь только говорим.',
    options: ['flüstern', 'rufen', 'murmeln', 'behaupten'],
    correct: 0,
    rule: 'flüstern — очень тихо.',
    wordField: 'SAGEN',
  }).wordFieldBase,
  'sagen',
);

process.stdout.write('exercise format smoke passed\n');
