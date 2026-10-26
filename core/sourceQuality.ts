export type SourceType = "official" | "source-code" | "paper" | "issue-tracker" | "technical-article" | "community-post" | "social-post" | "model-output";

export interface ResearchSource {
  id: string;
  type: SourceType;
  url?: string;
  publishedAt?: string;
  accessedAt?: string;
  directlySupportsClaim: boolean;
  independentlyCorroborated: boolean;
  limitations: string[];
}

export interface SourceAssessment {
  sourceId: string;
  score: number;
  strengths: string[];
  cautions: string[];
}

const baseScores: Record<SourceType, number> = {
  official: 35,
  "source-code": 35,
  paper: 30,
  "issue-tracker": 25,
  "technical-article": 20,
  "community-post": 12,
  "social-post": 8,
  "model-output": 0
};

export function assessSource(source: ResearchSource): SourceAssessment {
  const strengths: string[] = [];
  const cautions = [...source.limitations];
  let score = baseScores[source.type];

  if (source.url) strengths.push("Source location is recorded");
  else cautions.push("No source URL was recorded");
  if (source.directlySupportsClaim) {
    score += 25;
    strengths.push("Source directly supports the claim");
  } else {
    cautions.push("Direct support for the claim is not established");
  }
  if (source.independentlyCorroborated) {
    score += 20;
    strengths.push("Claim has independent corroboration");
  } else {
    cautions.push("Independent corroboration is missing");
  }
  if (!source.publishedAt) cautions.push("Publication date is unknown");
  if (!source.accessedAt) cautions.push("Access date is unknown");

  return { sourceId: source.id, score: Math.min(100, score), strengths, cautions };
}

export function rankSources(sources: readonly ResearchSource[]): SourceAssessment[] {
  return sources.map(assessSource).sort((a, b) => b.score - a.score);
}
