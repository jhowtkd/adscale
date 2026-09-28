// Mutable clock for the simulated pilot week. Implements the Equipe Clock
// port; every module/job decision reads time through it.

import type { Clock } from "../../src/server/equipe/domain";

export class MutableClock implements Clock {
  private at: Date;

  constructor(start: Date) {
    this.at = new Date(start.getTime());
  }

  now(): Date {
    return new Date(this.at.getTime());
  }

  set(at: Date): void {
    this.at = new Date(at.getTime());
  }

  advanceByMs(ms: number): void {
    this.at = new Date(this.at.getTime() + ms);
  }
}
