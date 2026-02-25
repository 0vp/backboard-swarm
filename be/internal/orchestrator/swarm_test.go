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

func TestRunInterleavesDecompositionThenFinalize(t *testing.T) {
	runner := &scriptedRunner{}
	s := NewSwarm(runner, config.Config{MaxSubagents: 3, MaxOrchRounds: 3}, nil)

	summary, err := s.Run(context.Background(), "run-1", "Who is Justin Trudeau dating?")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if strings.Contains(strings.ToLower(summary), "\"subtasks\"") {
		t.Fatalf("expected final summary, got plan json: %s", summary)
	}
	if !strings.Contains(strings.ToLower(summary), "publicly confirmed") {
		t.Fatalf("expected synthesized findings, got: %s", summary)
	}
	if runner.decisionCalls != 2 {
		t.Fatalf("expected 2 decision rounds, got %d", runner.decisionCalls)
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
	mu            sync.Mutex
	decisionCalls int
}

func (s *scriptedRunner) RunTask(_ context.Context, in agent.TaskInput) (agent.TaskResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if strings.Contains(in.Task, "MODE: DECOMPOSE") {
		return agent.TaskResult{Summary: `{"subtasks":[{"role":"researcher","task":"Find currently reported dating claims about Justin Trudeau"}]}`}, nil
	}

	if in.AgentID != "agent-0" {
		switch in.Role {
		case types.RoleResearcher:
			return agent.TaskResult{Summary: "Unverified rumors exist, but coverage is inconclusive without stronger source confirmation."}, nil
		case types.RoleFactChecker:
			return agent.TaskResult{Summary: "Cross-checks indicate there is no publicly confirmed new relationship from official or clearly reliable reporting."}, nil
		default:
			return agent.TaskResult{Summary: "No additional findings."}, nil
		}
	}

	if strings.Contains(in.Task, "MODE: DECIDE_NEXT_STEP") {
		s.decisionCalls++
		if strings.Contains(in.Task, "ROUND=1") {
			return agent.TaskResult{Summary: `{"action":"decompose","subtasks":[{"role":"fact_checker","task":"Verify whether reputable sources publicly confirm any current partner"}]}`}, nil
		}
		return agent.TaskResult{Summary: `{"action":"finalize","summary":"Current reporting does not provide a publicly confirmed new relationship for Justin Trudeau; most claims appear speculative or unverified."}`}, nil
	}

	return agent.TaskResult{Summary: "ok"}, nil
}

func (s *scriptedRunner) EndRun(_ string) {}
