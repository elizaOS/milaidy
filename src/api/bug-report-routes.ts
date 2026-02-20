import os from "node:os";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers";

export const BUG_REPORT_REPO = "milady-ai/milady";
const GITHUB_ISSUES_URL = `https://api.github.com/repos/${BUG_REPORT_REPO}/issues`;
const GITHUB_NEW_ISSUE_URL = `https://github.com/${BUG_REPORT_REPO}/issues/new?template=bug_report.yml`;

export interface BugReportRouteContext extends RouteRequestMeta, RouteHelpers {}

interface BugReportBody {
  description: string;
  stepsToReproduce: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  environment?: string;
  nodeVersion?: string;
  modelProvider?: string;
  logs?: string;
  screenshot?: string;
}

/**
 * Strip HTML tags and limit length to prevent markdown injection.
 * GitHub's renderer already sanitizes HTML, but we defensively strip
 * tags and cap field length to reduce abuse surface.
 */
export function sanitize(input: string, maxLen = 10_000): string {
  return input.replace(/<[^>]*>/g, "").slice(0, maxLen);
}

function formatIssueBody(body: BugReportBody, screenshot?: string): string {
  const sections: string[] = [];
  sections.push(`### Description\n\n${sanitize(body.description)}`);
  sections.push(`### Steps to Reproduce\n\n${sanitize(body.stepsToReproduce)}`);
  if (body.expectedBehavior)
    sections.push(
      `### Expected Behavior\n\n${sanitize(body.expectedBehavior)}`,
    );
  if (body.actualBehavior)
    sections.push(`### Actual Behavior\n\n${sanitize(body.actualBehavior)}`);
  if (body.environment)
    sections.push(`### Environment\n\n${sanitize(body.environment, 200)}`);
  if (body.nodeVersion)
    sections.push(`### Node Version\n\n${sanitize(body.nodeVersion, 200)}`);
  if (body.modelProvider)
    sections.push(`### Model Provider\n\n${sanitize(body.modelProvider, 200)}`);
  if (body.logs)
    sections.push(`### Logs\n\n\`\`\`\n${sanitize(body.logs, 50_000)}\n\`\`\``);
  if (screenshot)
    sections.push(
      `### Screenshots\n\n<details><summary>Screenshot</summary>\n\n![screenshot](${screenshot})\n\n</details>`,
    );
  return sections.join("\n\n");
}

export async function handleBugReportRoutes(
  ctx: BugReportRouteContext,
): Promise<boolean> {
  const { req, res, method, pathname, json, error, readJsonBody } = ctx;

  // GET /api/bug-report/info — returns env info only, no token state
  if (method === "GET" && pathname === "/api/bug-report/info") {
    json(res, {
      nodeVersion: process.version,
      platform: os.platform(),
    });
    return true;
  }

  // POST /api/bug-report
  if (method === "POST" && pathname === "/api/bug-report") {
    const body = await readJsonBody<BugReportBody>(req, res);
    if (!body) return true;

    if (!body.description?.trim() || !body.stepsToReproduce?.trim()) {
      error(res, "description and stepsToReproduce are required", 400);
      return true;
    }

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      // Fallback: return pre-filled GitHub issue URL
      json(res, { fallback: GITHUB_NEW_ISSUE_URL });
      return true;
    }

    try {
      // If screenshot provided, include as inline data URI (GitHub renders
      // images from data URIs in issue bodies). Cap at ~1MB base64 to stay
      // within GitHub's issue body size limits.
      let screenshotDataUri: string | undefined;
      if (body.screenshot) {
        const raw = body.screenshot.startsWith("data:")
          ? body.screenshot
          : `data:image/jpeg;base64,${body.screenshot}`;
        if (raw.length <= 1_500_000) {
          screenshotDataUri = raw;
        }
      }

      const sanitizedTitle = sanitize(body.description, 80).replace(
        /[\r\n]+/g,
        " ",
      );
      const issueBody = formatIssueBody(body, screenshotDataUri);
      const issueRes = await fetch(GITHUB_ISSUES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: `[Bug] ${sanitizedTitle}`,
          body: issueBody,
          labels: ["bug", "triage", "user-reported"],
        }),
      });

      if (!issueRes.ok) {
        const errText = await issueRes.text();
        error(res, `GitHub API error (${issueRes.status}): ${errText}`, 502);
        return true;
      }

      const issueData = (await issueRes.json()) as { html_url?: string };
      json(res, { url: issueData.html_url });
    } catch (err) {
      error(
        res,
        err instanceof Error ? err.message : "Failed to create issue",
        500,
      );
    }
    return true;
  }

  return false;
}
