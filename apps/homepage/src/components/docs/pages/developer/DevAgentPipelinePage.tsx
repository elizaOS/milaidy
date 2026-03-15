import { TopicSections } from "../shared/TopicSections";

const content = `
# Agent Review Pipeline

Milady uses an automated pipeline to govern code changes, ensuring stability and security.

## Stages

1. **Analysis**: An LLM agent reads the diff and summarizes changes.
2. **Risk Assessment**: The agent scores the PR based on:
   - **Scope**: Files touched (Core vs Plugin).
   - **Complexity**: Lines of code, cyclomatic complexity.
   - **Security**: Usage of risky APIs (eval, exec, fs).
3. **Decision**:
   - **Green**: Auto-merge (docs, tests).
   - **Yellow**: Human review required (features).
   - **Red**: Reject (malicious patterns).

## Trust Score

Contributors build a "Trust Score" over time.
- **High Trust**: Faster reviews, auto-merge for minor fixes.
- **Low Trust**: Strict sandboxing and manual review.
`;

export function DevAgentPipelinePage() {
  return <TopicSections content={content} />;
}
