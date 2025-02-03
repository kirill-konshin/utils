import { execSync } from 'child_process';

const toSeconds = (ms) => (ms / 1000).toFixed(1);

function run(cmd) {
  const t1 = performance.now();
  execSync(`time  (${cmd})`, { stdio: 'ignore' }); // inherit
  return performance.now() - t1;
}

function sleep(s) {
  const waitTill = performance.now() + s * 1000;
  while (waitTill > performance.now()) {
    // do nothing
  }
}

const mean = (arr) => arr.reduce((sum, num) => sum + num, 0) / arr.length;

const geometricMean = (arr) =>
  Math.pow(
    arr.reduce((prod, num) => prod * num, 1),
    1 / arr.length,
  );

const harmonicMean = (arr) => arr.length / arr.reduce((sum, num) => sum + 1 / num, 0);

const quadraticMean = (arr) => Math.sqrt(arr.reduce((sum, num) => sum + num ** 2, 0) / arr.length);

function perf(cmd, n = 5) {
  const res = [];
  for (let i = 0; i < n; i++) {
    res.push(run(cmd));
    console.log('Iteration', i, toSeconds(res.at(-1)), cmd);
    sleep(1);
  }
  const avg = toSeconds(harmonicMean(res));
  console.log();
  console.log('Average', avg, cmd);
  console.log();
  return avg;
}

const cmds = [
  // 'yarn build:index && yarn build:bare   && yarn build:exports',
  // 'yarn build:index && yarn build:vite   && yarn build:exports',
  // 'yarn build:index && yarn build:rollup && yarn build:exports',
  // 'yarn build:index && yarn build:tsup   && yarn build:exports',
  // 'yarn build:bare',
  // 'yarn build:vite',
  // 'yarn build:rollup',
  // 'yarn build:tsup',
  // 'yarn build:unbuild',
  'yarn build:rslib',
];

let results = {};

for (const cmd of cmds) {
  results[cmd] = perf(cmd, 3);
}

console.log(results);
