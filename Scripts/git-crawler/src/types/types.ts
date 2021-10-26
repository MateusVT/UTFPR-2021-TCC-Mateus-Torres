export type Repository = {
    script_execution?: { start_at?: string, finished_at?: string },
    id?: number,
    owner?: string,
    name?: string,
    url?: string,
    language?: string,
    stars?: number,
    forks?: number,
    subscribers?: number,
    watchers?: number,
    created_at?: string,
    nameconcat?: string
    labels?: string[]
    newcomer_labels?: Label[]
    has_newcomer_labels?: Boolean
    first_contribuitions?: Contribution[]
    weekly_distribuition?: WeeklyDistribution[]
    weekly_distribuition_before?: number[]
    weekly_distribuition_after?: number[]
}

export type WeeklyDistribution = { week: string, dates: string[], total: number }
export type Label = { name: string, created_at: string }
export type Contribution = { login: string, created_at: string, issue_number?: number }
export type RepositoryInfos = {
    full_name: string,
    created_at: string,
    watchers_count: number,
    language: string,
    forks: number,
    open_issues: number,
    watchers: number,
    subscribers_count: number
}