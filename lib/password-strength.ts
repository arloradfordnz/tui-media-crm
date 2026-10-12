/**
 * Password strength, shared by the browser (the live meter) and the server
 * (which enforces it — the browser's opinion is a courtesy, never the lock).
 *
 * No dependencies and no network: this is a conservative estimate of how long a
 * password would survive a guessing attack, tuned to fail the passwords people
 * actually choose ("Summer2026!", "tuimedia123", "qwerty12345") rather than to
 * flatter long strings of the same few characters. The leaked-password lookup,
 * which needs the network, is separate: lib/pwned.ts.
 */

export const MIN_LENGTH = 10

export type PasswordCheck = {
  /** 0 very weak … 4 strong. */
  score: 0 | 1 | 2 | 3 | 4
  label: 'Too weak' | 'Weak' | 'Fair' | 'Good' | 'Strong'
  /** True only when the server will accept it. */
  ok: boolean
  /** The single most useful thing to say, or null when it is fine. */
  problem: string | null
  /** Live checklist for the meter. */
  rules: { label: string; met: boolean }[]
}

// The few hundred most-guessed passwords, as the *normalised* stem (lowercase,
// look-alike symbols folded to letters, digits and symbols stripped). Anything
// that normalises to one of these is rejected whatever is bolted on the end.
const COMMON_STEMS = new Set([
  'password', 'passw0rd', 'letmein', 'welcome', 'admin', 'administrator', 'login', 'master', 'monkey',
  'dragon', 'sunshine', 'princess', 'football', 'baseball', 'soccer', 'hockey', 'rugby', 'cricket',
  'iloveyou', 'trustno', 'shadow', 'superman', 'batman', 'michael', 'jordan', 'jennifer', 'hunter',
  'ranger', 'thomas', 'robert', 'daniel', 'andrew', 'joshua', 'charlie', 'maggie', 'buster', 'tigger',
  'summer', 'winter', 'spring', 'autumn', 'january', 'february', 'march', 'april', 'june', 'july',
  'august', 'september', 'october', 'november', 'december', 'monday', 'friday', 'sunday', 'qwerty',
  'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbn', 'zxcvbnm', 'abc', 'abcdef', 'abcd', 'test', 'testing',
  'guest', 'user', 'root', 'default', 'secret', 'changeme', 'newpassword', 'mypassword', 'pass',
  'whatever', 'freedom', 'starwars', 'cheese', 'computer', 'internet', 'google', 'apple', 'samsung',
  'tuimedia', 'tui', 'media', 'video', 'camera', 'studio', 'film', 'films', 'production', 'newzealand',
  'zealand', 'auckland', 'wellington', 'christchurch', 'kiwi', 'allblacks', 'aotearoa', 'hello',
  'hellothere', 'portal', 'client', 'dashboard', 'crm', 'business', 'company', 'money', 'cash',
  'lovely', 'family', 'friend', 'angel', 'purple', 'orange', 'yellow', 'silver', 'golden', 'black',
  'master', 'killer', 'ninja', 'pokemon', 'naruto', 'matrix', 'pepper', 'cookie', 'banana', 'chocolate',
])

const KEYBOARD_RUNS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890', '0987654321', 'abcdefghijklmnopqrstuvwxyz']

/** Fold look-alikes to the letter they stand in for, then keep letters only. */
function stem(pw: string): string {
  // Trim digits and symbols off both ends first: folding 0 to o inside a
  // trailing year ("...2026") would otherwise corrupt the word in front of it.
  return pw
    .replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '')
    .toLowerCase()
    .replace(/[@4]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[10!|]/g, (c) => (c === '0' ? 'o' : 'i'))
    .replace(/[$5]/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z]/g, '')
}

/** Longest stretch of the password that is a slice of a keyboard row or the alphabet. */
function isRunOfKeyboard(pw: string): boolean {
  const lower = pw.toLowerCase()
  let longest = 0
  for (const run of KEYBOARD_RUNS) {
    for (const r of [run, [...run].reverse().join('')]) {
      for (let i = 0; i < r.length; i++) {
        let n = 0
        while (i + n < r.length && lower.includes(r.slice(i, i + n + 1))) n++
        longest = Math.max(longest, n)
      }
    }
  }
  // Five in a row is a run; it only matters when it is most of the password.
  return longest >= 5 && longest >= lower.length * 0.5
}

function charPool(pw: string): number {
  let pool = 0
  if (/[a-z]/.test(pw)) pool += 26
  if (/[A-Z]/.test(pw)) pool += 26
  if (/[0-9]/.test(pw)) pool += 10
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33
  return pool || 1
}

/** Bits of guessing work, deliberately pessimistic. */
function estimateBits(pw: string): number {
  const len = pw.length
  const unique = new Set(pw).size
  let bits = len * Math.log2(charPool(pw))

  // aaaa1111bbbb is long and nothing: discount heavily when few distinct chars.
  if (unique < len * 0.6) bits *= unique / (len * 0.6)

  // The shape most people pick — a word, a year or a few digits, maybe a symbol
  // — has the entropy of the word, not of its length.
  if (/^[A-Za-z]+[0-9]{1,6}[^A-Za-z0-9]{0,2}$/.test(pw) || /^[^A-Za-z0-9]{0,2}[0-9]{1,6}[A-Za-z]+$/.test(pw)) {
    bits = Math.min(bits, 34)
  }
  // A single dictionary-shaped run of letters.
  if (/^[A-Za-z]+$/.test(pw) && len <= 14) bits = Math.min(bits, len * 3.2)
  // Digits only.
  if (/^[0-9]+$/.test(pw)) bits = Math.min(bits, len * 3.32)
  // A repeated chunk (abcabcabc, 123123123).
  if (/^(.{1,4})\1{2,}$/.test(pw)) bits = Math.min(bits, 20)

  return bits
}

export function checkPassword(pw: string, personal: (string | null | undefined)[] = []): PasswordCheck {
  const lengthOk = pw.length >= MIN_LENGTH
  const mixOk = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length >= 2 || pw.length >= 16

  const s = stem(pw)
  const base = s.replace(/(.)\1{2,}/g, '$1') // "passssword" → "pasword" is overkill; collapse long repeats only
  const common = s.length > 0 && (COMMON_STEMS.has(s) || COMMON_STEMS.has(base))

  // Pieces of who they are: the part of the email before the @ and any name.
  const tokens = personal
    .flatMap((p) => (p ?? '').toLowerCase().split(/[^a-z0-9]+/))
    .filter((t) => t.length >= 4)
  const lowerPw = pw.toLowerCase()
  const personalHit = tokens.some((t) => lowerPw.includes(t))

  const runs = isRunOfKeyboard(pw)
  const bits = estimateBits(pw)

  let score: PasswordCheck['score'] = bits < 28 ? 0 : bits < 40 ? 1 : bits < 52 ? 2 : bits < 68 ? 3 : 4
  if (common || personalHit || runs || !lengthOk) score = Math.min(score, 1) as PasswordCheck['score']
  if (pw.length === 0) score = 0

  let problem: string | null = null
  if (!lengthOk) problem = `Use at least ${MIN_LENGTH} characters.`
  else if (common) problem = 'That’s one of the most common passwords. Pick something only you would think of.'
  else if (personalHit) problem = 'Don’t use your name or email address in your password.'
  else if (runs) problem = 'Avoid keyboard patterns and runs like 12345 or qwerty.'
  else if (!mixOk) problem = 'Mix upper and lower case, numbers or symbols — or make it a longer phrase.'
  else if (score < 3) problem = 'Make it longer or less predictable. Three or four random words works well.'

  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'] as const

  return {
    score,
    label: labels[score],
    ok: problem === null && score >= 3,
    problem,
    rules: [
      { label: `At least ${MIN_LENGTH} characters`, met: lengthOk },
      { label: 'A mix of characters, or a long phrase', met: mixOk && pw.length > 0 },
      { label: 'Not a common password or pattern', met: pw.length > 0 && !common && !runs && !personalHit },
    ],
  }
}
