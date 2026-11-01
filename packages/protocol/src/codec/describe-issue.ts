import type { z } from 'zod';

/**
 * One line naming the first problem: where it is and what kind it is. The sender's own text is
 * left out on purpose, so logs and error replies cannot be used to echo input back (review G7).
 */
export function describeIssue(error: z.ZodError): string {
  const [issue] = error.issues;
  if (issue === undefined) return 'invalid message';
  const where = issue.path.length > 0 ? issue.path.map(String).join('.') : 'message';
  // Custom refinements carry a fixed message written in this repo, never the sender's text.
  const reason = issue.code === 'custom' ? `custom, ${issue.message}` : issue.code;
  return `${where}: ${reason}`;
}
