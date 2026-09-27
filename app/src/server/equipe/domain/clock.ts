// Clock port: the only way time enters the Equipe domain.
// Production passes systemClock(); tests pass fixedClock().

export interface Clock {
  now(): Date;
}

export function systemClock(): Clock {
  return { now: () => new Date() };
}

export function fixedClock(at: Date): Clock {
  const frozen = new Date(at.getTime());
  return { now: () => new Date(frozen.getTime()) };
}
