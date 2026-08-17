'use strict';

/**
 * Pure math for the syllabus tracker's ahead/behind indicator. Kept free of
 * DB access and Date.now() (the caller injects `now`) so it can be unit
 * tested directly — mirrors how the fee service isolates `deriveStatus`.
 */

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const YEAR_LABEL_RE = /^(\d{4})-(\d{2})$/;

/**
 * Parse an Indian-school-style academic year label ("2024-25") into its
 * Apr 1 -> Mar 31 date window. Returns null if the label doesn't match.
 */
function parseAcademicYearWindow(label) {
  const match = YEAR_LABEL_RE.exec(String(label || ''));
  if (!match) return null;
  const startYear = Number(match[1]);
  // Month is 0-indexed: 3 = April.
  const start = new Date(Date.UTC(startYear, 3, 1));
  const end = new Date(Date.UTC(startYear + 1, 2, 31, 23, 59, 59, 999));
  return { start, end };
}

/**
 * @param {object} args
 * @param {Array<{plannedPeriods:number, status:string}>} args.topics
 * @param {number} args.periodsPerWeek  weekly period count for this subject/class/section
 * @param {string} args.academicYearLabel  e.g. "2024-25"
 * @param {Date}   args.now
 * @returns {{coveragePercent:number, totalPlannedPeriods:number, completedPlannedPeriods:number, expectedPeriodsElapsed:number|null, indicator:'ahead'|'behind'|'on_track'|'unknown'}}
 */
function deriveCoverage({ topics = [], periodsPerWeek = 0, academicYearLabel, now }) {
  const totalPlannedPeriods = topics.reduce((sum, t) => sum + (t.plannedPeriods || 0), 0);
  const completedPlannedPeriods = topics
    .filter((t) => t.status === 'completed')
    .reduce((sum, t) => sum + (t.plannedPeriods || 0), 0);
  const coveragePercent = totalPlannedPeriods > 0
    ? Math.round((completedPlannedPeriods / totalPlannedPeriods) * 100)
    : 0;

  const window = parseAcademicYearWindow(academicYearLabel);
  if (!window || !periodsPerWeek || !(now instanceof Date) || Number.isNaN(now.getTime())) {
    return {
      coveragePercent,
      totalPlannedPeriods,
      completedPlannedPeriods,
      expectedPeriodsElapsed: null,
      indicator: 'unknown',
    };
  }

  const clampedNow = now < window.start ? window.start : now > window.end ? window.end : now;
  const elapsedWeeks = (clampedNow - window.start) / MS_PER_WEEK;
  const expectedPeriodsElapsed = Math.round(periodsPerWeek * elapsedWeeks * 10) / 10;

  let indicator;
  if (expectedPeriodsElapsed <= 0) {
    indicator = completedPlannedPeriods > 0 ? 'ahead' : 'on_track';
  } else {
    const ratio = completedPlannedPeriods / expectedPeriodsElapsed;
    if (ratio >= 1.05) indicator = 'ahead';
    else if (ratio <= 0.95) indicator = 'behind';
    else indicator = 'on_track';
  }

  return { coveragePercent, totalPlannedPeriods, completedPlannedPeriods, expectedPeriodsElapsed, indicator };
}

module.exports = { deriveCoverage, parseAcademicYearWindow };
