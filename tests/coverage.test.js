'use strict';

// Pure-function unit test — no DB, no app boot. Mirrors how a `deriveStatus`
// style helper is unit tested elsewhere: extract the math, test it in isolation.
const { deriveCoverage, parseAcademicYearWindow } = require('../src/modules/syllabus/services/coverage');

describe('parseAcademicYearWindow', () => {
  it('parses an Apr-Mar Indian academic year label', () => {
    const window = parseAcademicYearWindow('2024-25');
    expect(window.start.toISOString()).toBe('2024-04-01T00:00:00.000Z');
    expect(window.end.toISOString()).toBe('2025-03-31T23:59:59.999Z');
  });

  it('returns null for a malformed label', () => {
    expect(parseAcademicYearWindow('2024')).toBeNull();
    expect(parseAcademicYearWindow('')).toBeNull();
    expect(parseAcademicYearWindow(undefined)).toBeNull();
  });
});

describe('deriveCoverage', () => {
  const TOPICS = [
    { plannedPeriods: 4, status: 'completed' },
    { plannedPeriods: 5, status: 'completed' },
    { plannedPeriods: 6, status: 'not_started' },
    { plannedPeriods: 5, status: 'not_started' },
  ]; // total 20, completed 9 -> 45%

  it('computes coverage percent from planned periods, independent of the time window', () => {
    const result = deriveCoverage({
      topics: TOPICS,
      periodsPerWeek: 2,
      academicYearLabel: '2024-25',
      now: new Date('2024-06-01T00:00:00.000Z'),
    });
    expect(result.totalPlannedPeriods).toBe(20);
    expect(result.completedPlannedPeriods).toBe(9);
    expect(result.coveragePercent).toBe(45);
  });

  it('returns 0% and no crash for an empty topic list', () => {
    const result = deriveCoverage({ topics: [], periodsPerWeek: 2, academicYearLabel: '2024-25', now: new Date() });
    expect(result.coveragePercent).toBe(0);
    expect(result.totalPlannedPeriods).toBe(0);
  });

  it('flags "unknown" when the academic year label cannot be parsed', () => {
    const result = deriveCoverage({ topics: TOPICS, periodsPerWeek: 2, academicYearLabel: 'garbage', now: new Date() });
    expect(result.indicator).toBe('unknown');
    expect(result.expectedPeriodsElapsed).toBeNull();
  });

  it('flags "unknown" when there is no weekly period count for the subject', () => {
    const result = deriveCoverage({ topics: TOPICS, periodsPerWeek: 0, academicYearLabel: '2024-25', now: new Date('2024-09-01') });
    expect(result.indicator).toBe('unknown');
  });

  it('flags "behind" when completed periods trail far behind the expected pace', () => {
    // By ~5 months in (Sep 1), at 2 periods/week, expected ~= 2 * (~22 weeks) = ~44 periods.
    // Only 9 are completed -> well behind.
    const result = deriveCoverage({
      topics: TOPICS,
      periodsPerWeek: 2,
      academicYearLabel: '2024-25',
      now: new Date('2024-09-01T00:00:00.000Z'),
    });
    expect(result.indicator).toBe('behind');
  });

  it('flags "ahead" when completed periods exceed the expected pace', () => {
    // Just 1 week into the year, expected periods elapsed is tiny (~2), but 9 are done.
    const result = deriveCoverage({
      topics: TOPICS,
      periodsPerWeek: 2,
      academicYearLabel: '2024-25',
      now: new Date('2024-04-08T00:00:00.000Z'),
    });
    expect(result.indicator).toBe('ahead');
  });

  it('flags "on_track" when completed periods roughly match the expected pace', () => {
    // Choose `now` so expectedPeriodsElapsed lands close to the 9 completed periods:
    // 9 = periodsPerWeek(2) * elapsedWeeks -> elapsedWeeks = 4.5 -> ~31.5 days after Apr 1.
    const result = deriveCoverage({
      topics: TOPICS,
      periodsPerWeek: 2,
      academicYearLabel: '2024-25',
      now: new Date('2024-05-03T00:00:00.000Z'),
    });
    expect(result.indicator).toBe('on_track');
  });

  it('clamps elapsed time to the academic year window (no negative/overshoot pace)', () => {
    const beforeStart = deriveCoverage({
      topics: TOPICS,
      periodsPerWeek: 2,
      academicYearLabel: '2024-25',
      now: new Date('2024-01-01T00:00:00.000Z'),
    });
    expect(beforeStart.expectedPeriodsElapsed).toBe(0);

    const afterEnd = deriveCoverage({
      topics: TOPICS,
      periodsPerWeek: 2,
      academicYearLabel: '2024-25',
      now: new Date('2025-12-01T00:00:00.000Z'),
    });
    // Full year elapsed: ~52.14 weeks * 2 periods/week.
    expect(afterEnd.expectedPeriodsElapsed).toBeCloseTo(104.3, 1);
  });
});
