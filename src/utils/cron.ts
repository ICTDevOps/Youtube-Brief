import CronExpressionParser from "cron-parser";
import { validate } from "node-cron";

export function isCronExpressionValid(expression: string): boolean {
  return validate(expression);
}

export function computeNextExecutionISO(
  expression: string,
  fromDate: Date = new Date(),
  timezone?: string,
): string | null {
  try {
    const cronExpression = CronExpressionParser.parse(expression, {
      currentDate: fromDate,
      tz: timezone,
    });
    const next = cronExpression.next().toDate();
    return next.toISOString();
  } catch (error) {
    return null;
  }
}

