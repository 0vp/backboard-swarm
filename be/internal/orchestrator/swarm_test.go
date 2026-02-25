package orchestrator

import (
	"context"
	"fmt"
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
