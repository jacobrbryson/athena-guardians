/**
 * Copy for the "connecting to the Guardian Network" experience: the auth
 * connection/verification sequences and Athena's first-contact greeting.
 *
 * Tone: secret organization / mission control / the beginning of an adventure.
 * Mysterious and a little magical — never scary, never a hacker terminal.
 */

/** Shown briefly after a valid Guardian ID, before the secret step. */
export const LOCATE_MESSAGES = [
  'Guardian record located.',
  'Access node identified.',
  'Guardian profile detected.',
  'Establishing secure connection.',
  'Synchronizing Guardian Network records.',
];

/** Shown while credentials are being verified, before authentication resolves. */
export const VERIFY_MESSAGES = [
  'Verifying credentials.',
  'Contacting Athena.',
  'Establishing communication channel.',
  'Validating Guardian authorization.',
  'Synchronizing mission records.',
];

/** Shown over the loading avatar as Athena comes online. */
export const ARRIVAL_MESSAGES = [
  'Connection established.',
  'Athena online.',
  'Guardian Network synchronized.',
  'Mission records available.',
];

/** Pick a random element. */
export function sample<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** First name only, so greetings read naturally ("Welcome back, Thomas."). */
function firstName(displayName: string | null | undefined): string | null {
  if (!displayName) return null;
  const name = displayName.trim().split(/\s+/)[0];
  return name || null;
}

/**
 * Build Athena's spoken/printed greeting. Uses the Guardian's display name
 * when available; otherwise degrades gracefully (never "Guardian 12345678").
 */
export function buildGreeting(isFirstLogin: boolean, displayName: string | null | undefined): string {
  const name = firstName(displayName);

  if (isFirstLogin) {
    const withName = [
      `New Guardian detected. Welcome, ${name}. I have been expecting you.`,
      `Guardian registration confirmed. It is nice to finally meet you, ${name}.`,
      `Welcome, ${name}. I have been waiting for you.`,
    ];
    const withoutName = [
      'New Guardian detected. Welcome. I have been expecting you.',
      'Guardian registration confirmed. It is nice to finally meet you.',
      'Welcome, Guardian. I have been waiting for you.',
    ];
    return sample(name ? withName : withoutName);
  }

  const withName = [
    `Welcome back, ${name}.`,
    `Good to see you again, ${name}.`,
    `Guardian records synchronized. Welcome back, ${name}.`,
  ];
  const withoutName = [
    'Welcome back, Guardian.',
    'Good to see you again.',
    'Guardian records synchronized. Welcome back.',
  ];
  return sample(name ? withName : withoutName);
}
