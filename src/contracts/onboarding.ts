/**
 * Shared onboarding contracts.
 */

export interface StylePreset {
  catchphrase: string;
  hint: string;
  bio: string[];
  system: string;
  adjectives: string[];
  topics: string[];
  style: {
    all: string[];
    chat: string[];
    post: string[];
  };
  postExamples: string[];
  postExamples_zhCN?: string[];
  messageExamples: Array<
    Array<{
      user: string;
      content: { text: string };
    }>
  >;
}
