import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Staff password hashing.
 *
 * **scrypt**, from Node's own crypto — a real memory-hard KDF, and no new dependency on a money
 * path. Argon2id would be marginally preferable and costs a native module; scrypt is what ships in
 * the standard library and is emphatically not the thing to get exotic about when the alternative
 * on this codebase's history was a plaintext constant in a source file.
 *
 * What this replaces: two passwords compiled into `kitchen-auth.service.ts` and published in a
 * public repository. Anyone who read the repo could sign in as the owner.
 *
 * Stored as `scrypt$N$r$p$salt$hash`, all hex. The parameters travel with the hash so raising the
 * cost later re-hashes on next login instead of invalidating every existing account.
 */

/** ~64 MB, ~100 ms on a modern laptop. Tuned to hurt a cracker without stalling a login. */
const N = 16_384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

/**
 * Node caps scrypt's working memory at 32 MB by default, which is below what N=16384, r=8 needs.
 * Raising it here rather than lowering N: the memory hardness *is* the defence.
 */
const MAX_MEMORY = 128 * 1024 * 1024;

const scryptWith = (password: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scryptCb(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { N, r: R, p: P, maxmem: MAX_MEMORY },
      (error, derived) => (error !== null ? reject(error) : resolve(derived)),
    );
  });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptWith(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * Verify a candidate against a stored hash.
 *
 * Returns false rather than throwing on a malformed record: a corrupt row must read as "wrong
 * password" and not as a 500 that tells an attacker they found something interesting.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (stored === null || stored.length === 0) return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nRaw, rRaw, pRaw, saltHex, hashHex] = parts;
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  try {
    const salt = Buffer.from(saltHex!, 'hex');
    const expected = Buffer.from(hashHex!, 'hex');

    const derived = await new Promise<Buffer>((resolve, reject) => {
      scryptCb(
        password.normalize('NFKC'),
        salt,
        expected.length,
        { N: n, r, p, maxmem: MAX_MEMORY },
        (error, out) => (error !== null ? reject(error) : resolve(out)),
      );
    });

    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Silence the unused-import warning while keeping the promisified form documented above. */
void scrypt;

/**
 * Is this password strong enough to protect a shop's takings?
 *
 * Deliberately a length floor and a blocklist rather than a character-class rule. Forcing a symbol
 * and a digit reliably produces `Cook@123`, which is worse than a longer plain phrase — and the
 * passwords this has to stop are precisely the ones a hurried owner would otherwise pick.
 */
const BANNED = new Set([
  'password', 'cook123', 'owner123', 'juicestop', '12345678', 'qwerty123', 'admin123',
]);

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (password.length > 128) return 'That is too long — 128 characters maximum.';
  if (BANNED.has(password.toLowerCase())) return 'That password is too easy to guess.';
  if (/^(.)\1+$/.test(password)) return 'That password is too easy to guess.';
  return null;
}
