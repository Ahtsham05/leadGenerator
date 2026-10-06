import type { Lead } from '@lead/shared';

/** What JSON.stringify does to a type: Dates become ISO strings. */
export type Wire<T> = T extends Date
  ? string
  : T extends ReadonlyArray<infer U>
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;

export type LeadDto = Wire<Lead>;
