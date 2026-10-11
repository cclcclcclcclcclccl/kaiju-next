import type { Economy, SearchResult } from './model.ts';
export type Run = {
  id: string;
  createdAt: string;
  modelHash: string;
  model: Economy;
  result: SearchResult;
};
export type RunSummary = {
  id: string;
  createdAt: string;
  title: string;
  status: SearchResult['status'];
  modelHash: string;
};
export type Project = { id: string; title: string; updatedAt: string; model: Economy };
export type Candidate = {
  status: 'candidate';
  model: Economy;
  evidence: { path: string; quote: string }[];
  notes: string[];
};
export type Clarification = { status: 'needs-clarification'; questions: string[] };
