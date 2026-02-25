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

	subtasks, err := s.decompose(ctx, runID, task)
	if err != nil {
		return "", fmt.Errorf("decompose task: %w", err)
	}
	if len(subtasks) == 0 {
		subtasks = []types.Subtask{{Role: types.RoleCoder, Task: task}}
	}

	maxRounds := s.cfg.MaxOrchRounds
	if maxRounds <= 0 {
		maxRounds = 3
	}

	allResults := make([]types.SubtaskResult, 0, len(subtasks))
	for round := 1; round <= maxRounds; round++ {
		s.emit(types.Event{
			Type:      "agent_status",
			RunID:     runID,
			AgentID:   "agent-0",
			Role:      types.RoleOrchestrator,
			Status:    "plan_ready",
			Message:   fmt.Sprintf("round %d/%d: running %d subtask(s)", round, maxRounds, len(subtasks)),
			Timestamp: time.Now().UTC(),
		})

		roundResults := s.runSubtasks(ctx, runID, subtasks)
		allResults = append(allResults, roundResults...)

		decision, raw, decisionErr := s.decideNextStep(ctx, runID, task, round, maxRounds, allResults)
		if decisionErr != nil {
			return "", fmt.Errorf("decide next step: %w", decisionErr)
		}

		if decision.Action == "decompose" && len(decision.Subtasks) > 0 && round < maxRounds {
			subtasks = decision.Subtasks
			s.emit(types.Event{
				Type:      "agent_status",
				RunID:     runID,
				AgentID:   "agent-0",
				Role:      types.RoleOrchestrator,
				Status:    "refining",
				Message:   fmt.Sprintf("round %d/%d requested deeper decomposition into %d subtask(s)", round, maxRounds, len(subtasks)),
				Timestamp: time.Now().UTC(),
			})
			continue
		}

		summary := strings.TrimSpace(firstNonEmpty(decision.Summary, raw))
		if summary == "" || isDecompositionSummary(summary) {
			summary = localFallbackSummary(task, allResults)
		}
		s.emit(types.Event{
			Type:      "swarm_finished",
			RunID:     runID,
			Status:    "completed",
			Message:   summary,
			Timestamp: time.Now().UTC(),
		})
		return summary, nil
	}

	summary := localFallbackSummary(task, allResults)
	s.emit(types.Event{
		Type:      "swarm_finished",
		RunID:     runID,
		Status:    "completed",
		Message:   summary,
		Timestamp: time.Now().UTC(),
	})
	return summary, nil
}

func (s *Swarm) decompose(ctx context.Context, runID, task string) ([]types.Subtask, error) {
	plan, err := s.runner.RunTask(ctx, agent.TaskInput{
		RunID:   runID,
		AgentID: "agent-0",
		Role:    types.RoleOrchestrator,
		Task:    fmt.Sprintf("MODE: DECOMPOSE\n\nUSER_TASK:\n%s", task),
	})
	if err != nil {
		return nil, err
	}
	return parseSubtasks(firstNonEmpty(plan.Summary, plan.Raw)), nil
}

type orchestrationDecision struct {
	Action   string
	Summary  string
	Subtasks []types.Subtask
}

func (s *Swarm) decideNextStep(ctx context.Context, runID, task string, round, maxRounds int, results []types.SubtaskResult) (orchestrationDecision, string, error) {
	res, err := s.runner.RunTask(ctx, agent.TaskInput{
		RunID:   runID,
		AgentID: "agent-0",
		Role:    types.RoleOrchestrator,
		Task:    decisionPrompt(task, round, maxRounds, results),
	})
	if err != nil {
		return orchestrationDecision{}, "", err
	}
	raw := strings.TrimSpace(firstNonEmpty(res.Summary, res.Raw))
	if raw == "" {
		return orchestrationDecision{Action: "finalize", Summary: ""}, raw, nil
	}
	if d, ok := parseDecision(raw); ok {
		return d, raw, nil
	}
	if subtasks := parseSubtasks(raw); len(subtasks) > 0 {
		return orchestrationDecision{Action: "decompose", Subtasks: subtasks}, raw, nil
	}
	return orchestrationDecision{Action: "finalize", Summary: raw}, raw, nil
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

func decisionPrompt(task string, round, maxRounds int, results []types.SubtaskResult) string {
	var builder strings.Builder
	builder.WriteString("MODE: DECIDE_NEXT_STEP\n")
	builder.WriteString(fmt.Sprintf("ROUND=%d\n", round))
	builder.WriteString(fmt.Sprintf("MAX_ROUNDS=%d\n", maxRounds))
	builder.WriteString("\nUSER_TASK:\n")
	builder.WriteString(task)
	builder.WriteString("\n\nCURRENT_FINDINGS:\n")
	for i, res := range results {
		builder.WriteString(fmt.Sprintf("%d) role=%s\n", i+1, res.Subtask.Role))
		builder.WriteString("task: " + strings.TrimSpace(res.Subtask.Task) + "\n")
		if res.Error != "" {
			builder.WriteString("error: " + res.Error + "\n\n")
			continue
		}
		builder.WriteString("result: " + strings.TrimSpace(res.Summary))
		builder.WriteString("\n\n")
	}
	builder.WriteString("\nReturn via finish.")
	return builder.String()
}

func parseDecision(raw string) (orchestrationDecision, bool) {
	clean := strings.TrimSpace(raw)
	if clean == "" {
		return orchestrationDecision{}, false
	}
	clean = strings.TrimPrefix(clean, "```json")
	clean = strings.TrimPrefix(clean, "```")
	clean = strings.TrimSuffix(clean, "```")
	clean = strings.TrimSpace(clean)

	var parsed struct {
		Action   string          `json:"action"`
		Summary  string          `json:"summary"`
		Subtasks []types.Subtask `json:"subtasks"`
	}
	if err := json.Unmarshal([]byte(clean), &parsed); err != nil {
		return orchestrationDecision{}, false
	}

	action := strings.ToLower(strings.TrimSpace(parsed.Action))
	subtasks := normalizeSubtasks(parsed.Subtasks)
	summary := strings.TrimSpace(parsed.Summary)

	switch action {
	case "decompose", "refine", "delegate":
		if len(subtasks) > 0 {
			return orchestrationDecision{Action: "decompose", Subtasks: subtasks}, true
		}
	case "finalize", "finish", "summary":
		return orchestrationDecision{Action: "finalize", Summary: summary}, true
	}

	if len(subtasks) > 0 {
		return orchestrationDecision{Action: "decompose", Subtasks: subtasks}, true
	}
	if summary != "" {
		return orchestrationDecision{Action: "finalize", Summary: summary}, true
	}
	return orchestrationDecision{}, false
}

func isDecompositionSummary(summary string) bool {
	if len(parseSubtasks(summary)) > 0 {
		return true
	}
	clean := strings.TrimSpace(summary)
	lower := strings.ToLower(clean)
	return (strings.HasPrefix(clean, "{") || strings.HasPrefix(clean, "```")) && strings.Contains(lower, "\"subtasks\"")
}

func localFallbackSummary(task string, results []types.SubtaskResult) string {
	var builder strings.Builder
	builder.WriteString("Summary for: ")
	builder.WriteString(task)
	builder.WriteString("\n\n")

	okCount := 0
	errCount := 0
	for _, res := range results {
		if res.Error != "" {
			errCount++
			continue
		}
		text := strings.TrimSpace(res.Summary)
		if text == "" {
			continue
		}
		okCount++
		builder.WriteString("- ")
		builder.WriteString(text)
		builder.WriteString("\n")
	}

	if okCount == 0 {
		builder.WriteString("No reliable findings were produced.")
	}
	if errCount > 0 {
		builder.WriteString("\nSome sub-analyses failed and may affect completeness.")
	}
	return strings.TrimSpace(builder.String())
}

func (s *Swarm) emit(evt types.Event) {
	if s.events != nil {
		s.events.Emit(evt)
	}
}
