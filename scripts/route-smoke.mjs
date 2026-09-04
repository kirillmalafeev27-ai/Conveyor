import assert from 'node:assert/strict';

import {
  advanceAlongRoute,
  createRun,
  playerAtExit,
  routeLength,
  setPlayerRoute,
  terminalAtPlayer,
} from '../lib/conveyor-game.ts';

const run = createRun();
run.phase = 'playing';
run.routeProgress = 0.78;
run.queuedRouteId = 'fork1-a-furnace';
advanceAlongRoute(run, routeLength('entry-press'));
assert.equal(run.routeId, 'fork1-a-furnace');
advanceAlongRoute(run, routeLength(run.routeId) * 2);
assert.equal(terminalAtPlayer(run)?.id, 'A');

run.completed.A = true;
run.terminalOrder.push('A');
setPlayerRoute(run, 'a-merge', 0, true);
advanceAlongRoute(run, 200);
assert.equal(terminalAtPlayer(run)?.id, 'C');

run.completed.C = true;
run.terminalOrder.push('C');
setPlayerRoute(run, 'c-exit', 0, true);
advanceAlongRoute(run, 400);
assert.equal(terminalAtPlayer(run)?.id, 'B');

run.completed.B = true;
run.terminalOrder.push('B');
setPlayerRoute(run, 'b-merge', 0, true);
advanceAlongRoute(run, 200);
assert.equal(playerAtExit(run), true);

const branchRun = createRun();
branchRun.phase = 'playing';
branchRun.routeProgress = 0.78;
branchRun.queuedRouteId = 'fork1-b-turbine';
advanceAlongRoute(branchRun, routeLength('entry-press'));
assert.equal(branchRun.routeId, 'fork1-b-turbine');

process.stdout.write('route smoke passed\n');
