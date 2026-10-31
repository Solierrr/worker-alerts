const encoder = new TextEncoder();

async function digest(value: string) {
  return crypto.subtle.digest("SHA-256", encoder.encode(value));
}

// Compares fixed-size digests so the comparison time does not depend on how much of the token matched
export async function hasValidToken(
  header: string | null | undefined,
  expected: string | undefined,
): Promise<boolean> {
  if (!expected || !header) return false;
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;
  const [received, wanted] = await Promise.all([
    digest(match[1]!),
    digest(expected),
  ]);
  return crypto.subtle.timingSafeEqual(received, wanted);
}
