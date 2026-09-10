export type Exposure = 'Low' | 'Moderate' | 'High' | 'Very high';
export interface Task { id: string; text: string; date: string; source: string }
export interface Role { code: string; title: string; description: string; tasks: Task[]; source: string; broader: boolean }
export interface Occupation { code: string; title: string; exposure: Exposure | null; growth: number | null; annualOpenings: number | null; startYear: number; endYear: number; roles: Role[]; sourceRow: number; source: string; mappingSource: string }
export interface Release { id: string; bls: string; onet: string; retrieved: string; startYear: number; endYear: number; sources: Record<string,string> }
export interface Snapshot { release: Release; occupations: Occupation[] }
export interface Alias { title: string; code: string; onetCode: string | null }
export interface Lexicon { release: string; aliases: Alias[] }
export interface Candidate { code: string; roleCode?: string; excerpt?: string; excerptKind?: 'description' | 'task'; taskId?: string; source?: string; reason?: string }
export interface SearchOutcome { state: 'candidates' | 'clarify' | 'none'; candidates: Candidate[]; message: string; exact: boolean }
export interface SemanticEvidence { code: string; score: number; excerpt?: string; source?: string }
