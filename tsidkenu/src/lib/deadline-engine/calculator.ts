/**
 * @ada/deadline-engine: Procedural Calculator
 * Handles the logic for OHADA "Franc" days and jurisdictional nuances.
 */

import { addDays, isWeekend, format, isSameDay } from 'date-fns';

// Standard Cameroon Public Holidays (Fixed)
const CAMEROON_HOLIDAYS = [
  { month: 0, day: 1, name: "New Year's Day" },
  { month: 1, day: 11, name: "Youth Day" },
  { month: 4, day: 1, name: "Labour Day" },
  { month: 4, day: 20, name: "National Day" },
  { month: 7, day: 15, name: "Assumption" },
  { month: 11, day: 25, name: "Christmas" }
];

export class DeadlineCalculator {
  
  /**
   * Checks if a date is a public holiday in Cameroon.
   */
  static isHoliday(date: Date): boolean {
    return CAMEROON_HOLIDAYS.some(h => 
      h.month === date.getMonth() && h.day === date.getDate()
    );
  }

  /**
   * Calculates the expiration date based on OHADA rules.
   */
  static calculateDeadline(startDate: Date, days: number, type: 'CALENDAR' | 'WORKING' | 'FRANC'): Date {
    let resultDate = new Date(startDate);

    if (type === 'FRANC') {
      // In OHADA, "Franc" means you add +2 days to the count (don't count trigger day, don't count last day)
      resultDate = addDays(startDate, days + 2);
    } else if (type === 'CALENDAR') {
      resultDate = addDays(startDate, days);
    } else if (type === 'WORKING') {
      let added = 0;
      while (added < days) {
        resultDate = addDays(resultDate, 1);
        if (!isWeekend(resultDate) && !this.isHoliday(resultDate)) {
          added++;
        }
      }
    }

    // Procedural Rule: If the last day is a Saturday, Sunday, or Holiday, 
    // the deadline is extended to the next working day.
    while (isWeekend(resultDate) || this.isHoliday(resultDate)) {
      resultDate = addDays(resultDate, 1);
    }

    return resultDate;
  }
}
