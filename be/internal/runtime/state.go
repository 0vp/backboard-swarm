package runtime

import (
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

type AssistantStore struct {
	mu  sync.RWMutex
	ids map[string]string
}

func NewAssistantStore() *AssistantStore {
	return &AssistantStore{ids: make(map[string]string)}
}

func (s *AssistantStore) Get(role string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	id, ok := s.ids[role]
	return id, ok
}

func (s *AssistantStore) Set(role, assistantID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ids[role] = assistantID
}

type TodoItem struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Completed bool      `json:"completed"`
	CreatedAt time.Time `json:"created_at"`
}

type TodoStore struct {
	mu      sync.RWMutex
	byAgent map[string]map[string]TodoItem
	seq     atomic.Uint64
}

func NewTodoStore() *TodoStore {
	return &TodoStore{byAgent: make(map[string]map[string]TodoItem)}
}

func (s *TodoStore) Create(agentID, title string) TodoItem {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.byAgent[agentID]; !ok {
		s.byAgent[agentID] = make(map[string]TodoItem)
	}
	id := fmt.Sprintf("todo-%d", s.seq.Add(1))
	item := TodoItem{ID: id, Title: title, CreatedAt: time.Now().UTC()}
	s.byAgent[agentID][id] = item
	return item
}

func (s *TodoStore) Update(agentID, id, title string) (TodoItem, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	agentTodos, ok := s.byAgent[agentID]
	if !ok {
		return TodoItem{}, false
	}
	item, ok := agentTodos[id]
	if !ok {
		return TodoItem{}, false
	}
	item.Title = title
	agentTodos[id] = item
	return item, true
}

func (s *TodoStore) Delete(agentID, id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	agentTodos, ok := s.byAgent[agentID]
	if !ok {
		return false
	}
	if _, ok := agentTodos[id]; !ok {
		return false
	}
	delete(agentTodos, id)
	return true
}

func (s *TodoStore) Complete(agentID, id string) (TodoItem, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	agentTodos, ok := s.byAgent[agentID]
	if !ok {
		return TodoItem{}, false
	}
	item, ok := agentTodos[id]
	if !ok {
		return TodoItem{}, false
	}
	item.Completed = true
	agentTodos[id] = item
	return item, true
}

func (s *TodoStore) List(agentID string) []TodoItem {
	s.mu.RLock()
	defer s.mu.RUnlock()
	agentTodos, ok := s.byAgent[agentID]
	if !ok {
		return nil
	}
	out := make([]TodoItem, 0, len(agentTodos))
	for _, item := range agentTodos {
		out = append(out, item)
	}
	return out
}

type RunStatus struct {
	RunID      string    `json:"run_id"`
	Task       string    `json:"task"`
	Status     string    `json:"status"`
	Summary    string    `json:"summary,omitempty"`
	Error      string    `json:"error,omitempty"`
	StartedAt  time.Time `json:"started_at"`
	FinishedAt time.Time `json:"finished_at,omitempty"`
}

type RunStore struct {
	mu   sync.RWMutex
	runs map[string]RunStatus
	seq  atomic.Uint64
}

func NewRunStore() *RunStore {
	return &RunStore{runs: make(map[string]RunStatus)}
}

func (s *RunStore) New(task string) string {
	id := fmt.Sprintf("run-%d-%d", time.Now().UnixMilli(), s.seq.Add(1))
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runs[id] = RunStatus{RunID: id, Task: task, Status: "queued", StartedAt: time.Now().UTC()}
	return id
}

func (s *RunStore) SetRunning(runID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r := s.runs[runID]
	r.Status = "running"
	s.runs[runID] = r
}

func (s *RunStore) SetCompleted(runID, summary string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r := s.runs[runID]
	r.Status = "completed"
	r.Summary = summary
	r.FinishedAt = time.Now().UTC()
	s.runs[runID] = r
}

func (s *RunStore) SetFailed(runID string, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r := s.runs[runID]
	r.Status = "failed"
	if err != nil {
		r.Error = err.Error()
	}
	r.FinishedAt = time.Now().UTC()
	s.runs[runID] = r
}

func (s *RunStore) Get(runID string) (RunStatus, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	r, ok := s.runs[runID]
	return r, ok
}
