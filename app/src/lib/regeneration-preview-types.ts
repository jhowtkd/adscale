export type RegenerationIssueBreakdown = {
  hardFailures: Array<{ code: string; message: string }>;
  scoreIssues: string[];
  qaFailed: Array<{ criterion: string; note: string }>;
  qaWarnings: Array<{ criterion: string; note: string }>;
};
