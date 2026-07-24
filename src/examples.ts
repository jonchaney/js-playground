export const EXAMPLES: Record<string, string> = {
  blank: `function foo() {

}
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
  anagram: `function validAnagram(s, t) {
  if (s.length !== t.length) return false;

  const counterS = {};
  const counterT = {};

  for (let i = 0; i < s.length; i++) {
    if (!Object.hasOwn(counterS, s[i])) {
      counterS[s[i]] = 1;
    } else {
      counterS[s[i]] += 1;
    }
    if (!Object.hasOwn(counterT, t[i])) {
      counterT[t[i]] = 1;
    } else {
      counterT[t[i]] += 1;
    }
  }

  for (let property in counterS) {
    if (counterS[property] !== counterT[property]) return false;
  }

  return true;
}

console.log(validAnagram("anagram", "nagaram")); // true
console.log(validAnagram("rat", "car")); // false

/*
Interview explanation:
- Two hash maps: count each character in s and in t
- First loop builds both frequency maps in one pass → O(n)
- Second loop compares counts for each key in counterS
- That second loop is O(1) if the alphabet is fixed (≤ 26 lowercase letters);
  it does not grow with string length n
- Overall time: O(n)
- Space: O(1) for a fixed alphabet (two maps, ≤ 26 keys each); O(k) more generally
- Interview line: “Hash maps for frequencies → linear time, constant space over a fixed alphabet.”
*/
`,
};
