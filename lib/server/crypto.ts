import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function randomSalt(): string {
  return randomBytes(16).toString("hex");
}

export function randomToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashPass(passphrase: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${passphrase}`).digest("hex");
}

export function passMatches(passphrase: string, salt: string, passHash: string): boolean {
  const actual = hashPass(passphrase, salt);
  const left = Buffer.from(actual, "hex");
  const right = Buffer.from(passHash, "hex");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function newProfileId(): string {
  return `p${randomBytes(4).toString("hex").slice(0, 6)}`;
}
