package orchestrator

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"backboard-swarm/be/internal/agent"
	"backboard-swarm/be/internal/config"
	"backboard-swarm/be/internal/types"
)

func TestParseSubtasks(t *testing.T) {
	raw := "```json\n{\"subtasks\":[{\"role\":\"researcher\",\"task\":\"find docs\"},{\"role\":\"coder\",\"task\":\"implement API\"}]}\n```"
	subtasks := parseSubtasks(raw)
	if len(subtasks) != 2 {
		t.Fatalf("expected 2 subtasks, got %d", len(subtasks))
	}
	if subtasks[0].Role != types.RoleResearcher {
		t.Fatalf("expected first role researcher, got %s", subtasks[0].Role)
	}
}

func TestRunSubtasksParallel(t *testing.T) {
	runner := &fakeRunner{sleep: 150 * time.Millisecond}
	s := NewSwarm(runner, config.Config{MaxSubagents: 3}, nil)

	tasks := []types.Subtask{
		{Role: types.RoleResearcher, Task: "a"},
		{Role: types.RoleFactChecker, Task: "b"},
		{Role: types.RoleCoder, Task: "c"},
	}

	start := time.Now()
	results := s.runSubtasks(context.Background(), "run-1", tasks)
	elapsed := time.Since(start)

	if len(results) != 3 {
		t.Fatalf("expected 3 results, got %d", len(results))
	}
	if elapsed > 320*time.Millisecond {
		t.Fatalf("expected parallel execution, elapsed=%s", elapsed)
	}
}

func TestRunRetriesWhenSynthesisReturnsPlan(t *testing.T) {
	runner := &scriptedRunner{}
	s := NewSwarm(runner, config.Config{MaxSubagents: 3}, nil)

	summary, err := s.Run(context.Background(), "run-1", "Who is Justin Trudeau dating?")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if strings.Contains(strings.ToLower(summary), "\"subtasks\"") {
		t.Fatalf("expected final summary, got decomposition json: %s", summary)
	}
	if !strings.Contains(strings.ToLower(summary), "justin trudeau") {
		t.Fatalf("expected synthesized findings, got: %s", summary)
	}
}

type fakeRunner struct {
	mu    sync.Mutex
	sleep time.Duration
	count int
}

func (f *fakeRunner) RunTask(_ context.Context, in agent.TaskInput) (agent.TaskResult, error) {
	time.Sleep(f.sleep)
	f.mu.Lock()
	f.count++
	f.mu.Unlock()
	return agent.TaskResult{Summary: fmt.Sprintf("done-%s", in.Task)}, nil
}

func (f *fakeRunner) EndRun(_ string) {}

type scriptedRunner struct {
	mu sync.Mutex
}

func (s *scriptedRunner) RunTask(_ context.Context, in agent.TaskInput) (agent.TaskResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if strings.Contains(in.Task, "MODE: DECOMPOSE") {
		return agent.TaskResult{Summary: `{"subtasks":[{"role":"researcher","task":"Find current dating status of Justin Trudeau"},{"role":"fact_checker","task":"Verify dating-status claims with reputable outlets"}]}`}, nil
	}

	if in.AgentID != "agent-0" {
		switch in.Role {
		case types.RoleResearcher:
			return agent.TaskResult{Summary: "Recent public reports indicate no confirmed official announcement of a new partner."}, nil
		case types.RoleFactChecker:
			return agent.TaskResult{Summary: "Cross-checks show rumors exist, but there is no broadly verified public confirmation from Trudeau's office."}, nil
		default:
			return agent.TaskResult{Summary: "No additional findings."}, nil
		}
	}

	if strings.Contains(in.Task, "MODE: SYNTHESIZE") && strings.Contains(in.Task, "RETRY_SYNTHESIS=true") {
		return agent.TaskResult{Summary: "Current reporting suggests there is no publicly confirmed new relationship for Justin Trudeau; available coverage is mostly speculative and unconfirmed."}, nil
	}

	if strings.Contains(in.Task, "MODE: SYNTHESIZE") {
		return agent.TaskResult{Summary: `{"subtasks":[{"role":"researcher","task":"..."}]}`}, nil
	}

	return agent.TaskResult{Summary: "ok"}, nil
}

func (s *scriptedRunner) EndRun(_ string) {}
