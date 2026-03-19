import { describe, expect, it } from "vitest";

import {
  buildIssueBody,
  desiredTitle,
  extractIssueDraftSection,
  labelsForDraft,
  MANAGED_LABEL,
  parseInlineList,
  parseIssueDrafts,
} from "./sync-dod-gap-issues-lib.mjs";

const SAMPLE_REPORT = `
# Integration Map

## 8) Integration DoD Coverage Matrix

content

## 9) GitHub Issue Drafts

### MW-01
- Title: \`Align coverage policy and CI thresholds\`
- Labels: \`priority:P0\`, \`area:DX/Tooling\`
- Owner: \`DX/Tooling\`
- Acceptance criteria:
  - \`Coverage policy docs and config match\`
  - \`Threshold check runs in CI\`
- Verification commands:
  - \`bun run test:coverage\`
  - \`bun run typecheck\`
- Risk:
  - \`Undetected regressions if policy drift continues\`
- Source:
  - \`INTEGRATION_DOD_MAP.md:530\`

## 10) Verification Commands

\`\`\`bash
bun run lint
\`\`\`
`;

describe("sync-dod-gap-issues-lib", () => {
  it("extracts issue draft section and parses MW drafts", () => {
    const section = extractIssueDraftSection(
      SAMPLE_REPORT,
      "INTEGRATION_DOD_MAP.md",
    );
    expect(section).toContain("### MW-01");
    expect(section).not.toContain("## 10) Verification Commands");

    const drafts = parseIssueDrafts(SAMPLE_REPORT, "INTEGRATION_DOD_MAP.md");
    expect(drafts).toHaveLength(1);

    const [draft] = drafts;
    expect(draft.id).toBe("MW-01");
    expect(draft.title).toBe("Align coverage policy and CI thresholds");
    expect(draft.labels).toEqual(["priority:P0", "area:DX/Tooling"]);
    expect(draft.owner).toBe("DX/Tooling");
    expect(draft.acceptanceCriteria).toEqual([
      "Coverage policy docs and config match",
      "Threshold check runs in CI",
    ]);
    expect(draft.verificationCommands).toEqual([
      "bun run test:coverage",
      "bun run typecheck",
    ]);
    expect(draft.risks).toEqual([
      "Undetected regressions if policy drift continues",
    ]);
    expect(draft.sourceRefs).toEqual(["INTEGRATION_DOD_MAP.md:530"]);
  });

  it("builds issue body with managed marker and command block", () => {
    const [draft] = parseIssueDrafts(SAMPLE_REPORT, "INTEGRATION_DOD_MAP.md");
    const body = buildIssueBody(draft);

    expect(body).toContain("<!-- integration-dod-gap-id:MW-01 -->");
    expect(body).toContain("## Acceptance Criteria");
    expect(body).toContain("```bash");
    expect(body).toContain("bun run test:coverage");
    expect(body).toContain("**Owner (area-owner):** DX/Tooling");
    expect(desiredTitle(draft)).toBe(
      "[Integration DoD][MW-01] Align coverage policy and CI thresholds",
    );
  });

  it("parses inline labels and resolves final labels from available set", () => {
    expect(parseInlineList("`priority:P1`, `area:API`")).toEqual([
      "priority:P1",
      "area:API",
    ]);
    expect(parseInlineList("priority:P2, area:Docs")).toEqual([
      "priority:P2",
      "area:Docs",
    ]);

    const [draft] = parseIssueDrafts(SAMPLE_REPORT, "INTEGRATION_DOD_MAP.md");
    const available = new Set([
      MANAGED_LABEL,
      "gap:MW-01",
      "priority:P0",
      "area:DX/Tooling",
      "owner:DX/Tooling",
    ]);

    expect(labelsForDraft(draft, available).sort()).toEqual([
      "area:DX/Tooling",
      "gap:MW-01",
      "integration-dod-gap",
      "owner:DX/Tooling",
      "priority:P0",
    ]);
  });

  it("throws when GitHub Issue Drafts section is missing", () => {
    expect(() =>
      parseIssueDrafts("# Missing section", "INTEGRATION_DOD_MAP.md"),
    ).toThrow('Could not find "## 9) GitHub Issue Drafts"');
  });
});
