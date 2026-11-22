// kestrel-sitegen-speed driver: reads /input/cases.json, answers each case independently via solve.js run(), writes /output/answers.json.

import { closeSync, openSync, readFileSync, writeSync } from 'node:fs';
import { setFlagsFromString } from 'node:v8';
import { run } from './solve.js';

setFlagsFromString(
  '--no-incremental-marking --semi-space-growth-factor=16 --no-parallel-scavenge --no-minor-gc-task ' +
  '--always-sparkplug --no-concurrent-sparkplug ' +
  '--no-turbo-inlining --no-turbo-escape --no-turbo-load-elimination --no-turbo-loop-peeling --no-turbo-loop-rotation --no-turbo-store-elimination ' +
  '--turbo-filter=tf_* --invocation-count-for-turbofan=200 --invocation-count-for-osr=50'
);

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(`${INPUT_DIR}/cases.json`).toString('utf8'));
const fd = openSync(`${OUTPUT_DIR}/answers.json`, 'w');
writeSync(fd, '[');
for (let i = 0; i < cases.length; i++) {
  if (i > 0) writeSync(fd, ',');
  writeSync(fd, JSON.stringify(run(cases[i].input)));
  cases[i] = null;
}
writeSync(fd, ']');
closeSync(fd);
