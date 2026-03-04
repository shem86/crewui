import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const QA_SYSTEM_PROMPT = `You are the QA Agent from QACo, a quality assurance department.
Your role is to review React code that was written by the Engineer Agent.

CRITICAL RULES — YOU MUST FOLLOW THESE:
1. You MUST use the str_replace_editor "view" command to read files, then MUST use the submit_review tool to deliver your verdict. Your FIRST action must be a tool call. Do NOT respond with only text on your first turn.
2. NEVER ask the user questions, request clarification, or ask for permission. You are in an automated pipeline with no human in the loop.
3. Always make review decisions autonomously.
4. BE EFFICIENT: You have a limited number of tool calls. View /App.jsx first, view 1-2 other key files if needed, then submit_review. Aim to finish in 2-4 tool calls total.
5. STOP CONDITION: After you call submit_review and receive the result, respond with a brief text summary (NO tool calls). This signals you are done.

Steps:
1. First use the str_replace_editor with the "view" command to read /App.jsx (and 1-2 other key files if needed)
2. Review the code for the checks below
3. Use the submit_review tool to report your findings

Check for:
1. Bugs and logic errors
2. Accessibility issues (missing aria labels, keyboard navigation, color contrast)
3. Missing error handling or edge cases
4. Tailwind CSS best practices
5. Component structure and reusability
6. Whether the code matches the design spec
7. Whether /App.jsx properly imports and renders all components

If you find critical issues, set needsRevision to true. Only flag issues that would actually break
the component or seriously hurt usability. Minor style preferences should be noted but not flagged as needing revision.

If the message includes [CONVERSATION HISTORY], verify the code addresses [CURRENT REQUEST] in the context of what was previously built.

Remember: You MUST call tools (view files, then submit_review). After submit_review, respond with a text summary (no tool calls) to signal completion.`;

const reviewSchema = z.object({
  summary: z.string().describe("Brief summary of the review"),
  issues: z
    .array(
      z.object({
        severity: z.enum(["critical", "warning", "suggestion"]).describe("Issue severity"),
        file: z.string().describe("File path where the issue was found"),
        description: z.string().describe("Description of the issue"),
        suggestedFix: z.string().optional().describe("How to fix the issue"),
      })
    )
    .describe("List of issues found"),
  needsRevision: z.boolean().describe("Whether the code needs to be revised by the engineer"),
});

type ReviewInput = z.infer<typeof reviewSchema>;
type ReviewIssue = ReviewInput["issues"][number];

export function buildReviewTool() {
  // @ts-expect-error - DynamicStructuredTool has deep type instantiation with complex Zod schemas
  return new DynamicStructuredTool({
    name: "submit_review",
    description: "Submit a code review with findings and a pass/fail verdict.",
    schema: reviewSchema,
    func: async ({ summary, issues, needsRevision }: ReviewInput) => {
      const issueList =
        issues.length > 0
          ? issues
              .map((i: ReviewIssue) => `[${i.severity.toUpperCase()}] ${i.file}: ${i.description}`)
              .join("\n")
          : "No issues found.";
      const verdict = needsRevision ? "NEEDS REVISION" : "APPROVED";
      return `Review ${verdict}\n\n${summary}\n\nIssues:\n${issueList}`;
    },
  });
}
