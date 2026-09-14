import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const port = Number(process.argv[2] ?? 9224);
const outputPath = process.argv[3] ?? 'artifacts/conveyor-visual-smoke.png';
const mode = process.argv[4] ?? 'game';
const captureControls = mode === 'controls';
const extraWait = Number(process.argv[5] ?? 0);
const factoryLevel = Math.min(5, Math.max(1, Number(process.argv[6] ?? 1)));
const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

let targets;
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) =>
      response.json(),
    );
    break;
  } catch {
    await wait(250);
  }
}

const page = targets?.find((target) => target.type === 'page');
if (!page?.webSocketDebuggerUrl)
  throw new Error('Chrome page target unavailable');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message));
  else waiter.resolve(message.result);
});

const send = (method, params = {}) => {
  const id = nextId;
  nextId += 1;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1366,
  height: 768,
  deviceScaleFactor: 1,
  mobile: false,
});
await send('Page.navigate', { url: 'http://localhost:3000/' });
await wait(3000);
let clicked = false;
for (let attempt = 0; attempt < 24; attempt += 1) {
  const launch = await send('Runtime.evaluate', {
    expression: `(() => {
      if (!document.querySelector('.menu-overlay')) return 'running';
      [...document.querySelectorAll('.factory-level-picker button')][${factoryLevel - 1}]?.click();
      const button = document.querySelector('.start-button');
      button?.click();
      return button ? 'clicked' : 'waiting';
    })()`,
    returnByValue: true,
  });
  clicked ||= launch.result.value === 'clicked';
  if (launch.result.value === 'running') break;
  await wait(500);
}
await wait(3200);
if (Number.isFinite(extraWait) && extraWait > 0) await wait(extraWait);

if (captureControls) {
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const actionReady = await send('Runtime.evaluate', {
      expression: `Boolean(document.querySelector('.quiz-card.action-mode'))`,
      returnByValue: true,
    });
    if (actionReady.result.value) break;
    await send('Runtime.evaluate', {
      expression: `(() => {
        const answers = [...document.querySelectorAll('.answer-grid button')];
        answers[${attempt} % Math.max(1, answers.length)]?.click();
      })()`,
    });
    await wait(1050);
  }
}

const state = await send('Runtime.evaluate', {
  expression: `({
    clicked: ${clicked},
    factoryLevel: ${factoryLevel},
    title: document.title,
    canvas: document.querySelector('canvas')?.getBoundingClientRect().toJSON(),
    bodyOverflow: getComputedStyle(document.body).overflow,
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: innerHeight,
    actionMode: Boolean(document.querySelector('.quiz-card.action-mode')),
    targetBlueprint: Boolean(document.querySelector('.target-blueprint')),
    answerButtons: document.querySelectorAll('.answer-grid button').length,
    laneActions: document.querySelectorAll('.lane-action').length,
    shiftActions: document.querySelectorAll('.shift-action button').length,
    legacyDockPrompt: document.querySelector('.dock-prompt')?.textContent ?? null,
    legacyVitals: document.querySelectorAll('.viewport-vitals').length,
    noScroll: document.documentElement.scrollHeight <= innerHeight
  })`,
  returnByValue: true,
});
const capture = await send('Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: false,
});
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, Buffer.from(capture.data, 'base64'));
process.stdout.write(`${JSON.stringify(state.result.value)}\n${outputPath}\n`);
socket.close();
