package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"backboard-swarm/be/internal/agent"
	"backboard-swarm/be/internal/config"
	"backboard-swarm/be/internal/types"
)

type EventSink interface {
	Emit(evt types.Event)
}

type TaskRunner interface {
	RunTask(ctx context.Context, in agent.TaskInput) (agent.TaskResult, error)
	EndRun(runID string)
}

type Swarm struct {
	runner TaskRunner
	cfg    config.Config
	events EventSink
}

func NewSwarm(runner TaskRunner, cfg config.Config, events EventSink) *Swarm {
	return &Swarm{runner: runner, cfg: cfg, events: events}
}

func (s *Swarm) Run(ctx context.Context, runID, task string) (string, error) {
	defer s.runner.EndRun(runID)

	s.emit(types.Event{
		Type:      "swarm_started",
		RunID:     runID,
		Message:   task,
		Timestamp: time.Now().UTC(),
	})

	decompositionPrompt := fmt.Sprintf(`Decompose this user task into independent parallel subtasks.
User task:
%s

Rules:
- Output only JSON.
- Use schema: {"subtasks":[{"role":"researcher|fact_checker|coder","task":"..."}]}
- Keep between 1 and 6 subtasks.
- Only include roles researcher, fact_checker, or coder.
- If unsure, return one coder task.
- After preparing JSON, call the finish tool with that exact JSON string in summary.`, task)

	plan, err := s.runner.RunTask(ctx, agent.TaskInput{
		RunID:   runID,
		AgentID: "agent-0",
		Role:    types.RoleOrchestrator,
		Task:    decompositionPrompt,
	})
	if err != nil {
		return "", fmt.Errorf("decompose task: %w", err)
	}

	subtasks := parseSubtasks(firstNonEmpty(plan.Summary, plan.Raw))
	if len(subtasks) == 0 {
		subtasks = []types.Subtask{{Role: types.RoleCoder, Task: task}}
	}
	s.emit(types.Event{
		Type:      "agent_status",
		RunID:     runID,
		AgentID:   "agent-0",
		Role:      types.RoleOrchestrator,
		Status:    "plan_ready",
		Message:   fmt.Sprintf("decomposed into %d subtask(s)", len(subtasks)),
		Timestamp: time.Now().UTC(),
	})

	results := s.runSubtasks(ctx, runID, subtasks)

	var builder strings.Builder
	builder.WriteString("Original task:\n")
	builder.WriteString(task)
	builder.WriteString("\n\nSubtask outputs:\n")
	for i, res := range results {
		builder.WriteString(fmt.Sprintf("%d) role=%s\n", i+1, res.Subtask.Role))
		if res.Error != "" {
			builder.WriteString("error: " + res.Error + "\n\n")
			continue
		}
		builder.WriteString(res.Summary)
		builder.WriteString("\n\n")
	}
	builder.WriteString("Synthesize a final response for the user. Then call finish tool with summary.")

	final, err := s.runner.RunTask(ctx, agent.TaskInput{
		RunID:   runID,
		AgentID: "agent-0",
		Role:    types.RoleOrchestrator,
		Task:    builder.String(),
	})
	if err != nil {
		return "", fmt.Errorf("synthesis failed: %w", err)
	}

	summary := strings.TrimSpace(firstNonEmpty(final.Summary, final.Raw))
	s.emit(types.Event{
		Type:      "swarm_finished",
		RunID:     runID,
		Status:    "completed",
		Message:   summary,
		Timestamp: time.Now().UTC(),
	})

	return summary, nil
}

func (s *Swarm) runSubtasks(ctx context.Context, runID string, subtasks []types.Subtask) []types.SubtaskResult {
	sem := make(chan struct{}, s.cfg.MaxSubagents)
	results := make([]types.SubtaskResult, len(subtasks))
	var wg sync.WaitGroup

	for i := range subtasks {
		i := i
		task := subtasks[i]
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			agentID := fmt.Sprintf("agent-%d", i+1)
			res, err := s.runner.RunTask(ctx, agent.TaskInput{
				RunID:   runID,
				AgentID: agentID,
				Role:    task.Role.Normalize(),
				Task:    task.Task,
			})
			if err != nil {
				results[i] = types.SubtaskResult{Subtask: task, Error: err.Error()}
				s.emit(types.Event{
					Type:      "agent_finished",
					RunID:     runID,
					AgentID:   agentID,
					Role:      task.Role.Normalize(),
					Status:    "failed",
					Message:   err.Error(),
					Timestamp: time.Now().UTC(),
				})
				return
			}
			results[i] = types.SubtaskResult{Subtask: task, Summary: strings.TrimSpace(firstNonEmpty(res.Summary, res.Raw))}
		}()
	}

	wg.Wait()
	return results
}

func parseSubtasks(raw string) []types.Subtask {
	clean := strings.TrimSpace(raw)
	if clean == "" {
		return nil
	}
	clean = strings.TrimPrefix(clean, "```json")
	clean = strings.TrimPrefix(clean, "```")
	clean = strings.TrimSuffix(clean, "```")
	clean = strings.TrimSpace(clean)

	var wrapped struct {
		Subtasks []types.Subtask `json:"subtasks"`
	}
	if err := json.Unmarshal([]byte(clean), &wrapped); err == nil && len(wrapped.Subtasks) > 0 {
		return normalizeSubtasks(wrapped.Subtasks)
	}

	var plain []types.Subtask
	if err := json.Unmarshal([]byte(clean), &plain); err == nil && len(plain) > 0 {
		return normalizeSubtasks(plain)
	}

	return nil
}

func normalizeSubtasks(in []types.Subtask) []types.Subtask {
	out := make([]types.Subtask, 0, len(in))
	for _, t := range in {
		task := strings.TrimSpace(t.Task)
		if task == "" {
			continue
		}
		out = append(out, types.Subtask{Role: t.Role.Normalize(), Task: task})
	}
	if len(out) > 6 {
		out = out[:6]
	}
	return out
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func (s *Swarm) emit(evt types.Event) {
	if s.events != nil {
		s.events.Emit(evt)
	}
}
