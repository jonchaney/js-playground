export const EXAMPLES: Record<string, string> = {
  blank: `function foo {

}

console.log(foo())
`,
  debug: `const user = { name: "Ada", score: 98 };
let total = 0;

for (const n of [10, 20, 30]) {
  total += n;
  debugger; // pauses here — inspect user, total, n
}

console.log("done", total);
total;
`,
  fib: `function fib(n) {
  if (n < 2) return n;
  return fib(n - 1) + fib(n - 2);
}

const results = Array.from({ length: 10 }, (_, i) => fib(i));
console.log(results);
results;
`,
  async: `const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("starting…");
  await wait(200);
  console.log("done");
  return { ok: true, at: new Date().toISOString() };
}

await main();
`,
  map: `const users = [
  { name: "Ada", score: 98 },
  { name: "Grace", score: 91 },
  { name: "Alan", score: 87 },
];

users
  .filter((u) => u.score >= 90)
  .map((u) => u.name.toUpperCase());
`,
};
