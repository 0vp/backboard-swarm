package types

import "time"

type Role string

const (
	RoleOrchestrator Role = "orchestrator"
	RoleResearcher   Role = "researcher"
	RoleFactChecker  Role = "fact_checker"
	RoleCoder        Role = "coder"
)

func (r Role) Normalize() Role {
	switch r {
	case RoleOrchestrator, RoleResearcher, RoleFactChecker, RoleCoder:
		return r
	default:
		return RoleCoder
	}
}

type Event struct {
	Type      string         `json:"type"`
	RunID     string         `json:"run_id,omitempty"`
	AgentID   string         `json:"agent_id,omitempty"`
	Role      Role           `json:"role,omitempty"`
	Status    string         `json:"status,omitempty"`
	Message   string         `json:"message,omitempty"`
	ToolName  string         `json:"tool_name,omitempty"`
	Timestamp time.Time      `json:"timestamp"`
	Meta      map[string]any `json:"meta,omitempty"`
}

type Subtask struct {
	Role Role   `json:"role"`
	Task string `json:"task"`
}

type SubtaskResult struct {
	Subtask Subtask `json:"subtask"`
	Summary string  `json:"summary"`
	Error   string  `json:"error,omitempty"`
}
