// kestrel-sitegen-speed driver: configures V8 flags and runs solve.js streaming CLI over /input/cases.json -> /output/answers.json.
import { setFlagsFromString } from 'node:v8';
import { runCli } from './solve.js';
setFlagsFromString('--no-incremental-marking --semi-space-growth-factor=16 --no-parallel-scavenge --no-minor-gc-task --always-sparkplug --no-concurrent-sparkplug --no-turbo-inlining --no-turbo-escape --no-turbo-load-elimination --no-turbo-loop-peeling --no-turbo-loop-rotation --no-turbo-store-elimination --turbo-filter=tf_* --invocation-count-for-turbofan=50 --no-use-osr');
runCli();
