package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"backboard-swarm/be/internal/backboard"
	"backboard-swarm/be/internal/runtime"
	"backboard-swarm/be/internal/types"
)

type EventEmitter interface {
	Emit(evt types.Event)
}

type ExecutionContext struct {
	RunID          string
	AgentID        string
	Role           types.Role
	WorkspaceRoot  string
	JinaAPIKey     string
	RequestTimeout time.Duration
	Todos          *runtime.TodoStore
	Emitter        EventEmitter

	FinishSummary string
}

type ToolFunc func(ctx context.Context, args map[string]any, execCtx *ExecutionContext) (any, error)

type Registration struct {
	Name        string
	Description string
	Parameters  map[string]any
	Handler     ToolFunc
}

type Registry struct {
	mu       sync.RWMutex
	handlers map[string]Registration
}

func NewRegistry() *Registry {
	return &Registry{handlers: make(map[string]Registration)}
}

func (r *Registry) RegisterBuiltin(reg Registration) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.handlers[reg.Name] = reg
}

func (r *Registry) RegisterPlugin(reg Registration) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.handlers[reg.Name] = reg
}

func (r *Registry) Definitions() []backboard.ToolDefinition {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]backboard.ToolDefinition, 0, len(r.handlers))
	for _, reg := range r.handlers {
		out = append(out, backboard.ToolDefinition{
			Type: "function",
			Function: backboard.FunctionDefinition{
				Name:        reg.Name,
				Description: reg.Description,
				Parameters:  reg.Parameters,
			},
		})
	}
	return out
}

func (r *Registry) Execute(ctx context.Context, call backboard.ToolCall, execCtx *ExecutionContext) (backboard.ToolOutput, bool, string, error) {
	r.mu.RLock()
	reg, ok := r.handlers[call.Function.Name]
	r.mu.RUnlock()
	if !ok {
		out := jsonError(fmt.Errorf("tool %q is not allowlisted", call.Function.Name))
		return backboard.ToolOutput{ToolCallID: call.ID, Output: out}, false, "", fmt.Errorf("tool %q is not allowlisted", call.Function.Name)
	}

	args, err := call.ArgumentsMap()
	if err != nil {
		out := jsonError(fmt.Errorf("invalid arguments for %s: %w", call.Function.Name, err))
		return backboard.ToolOutput{ToolCallID: call.ID, Output: out}, false, "", err
	}

	result, execErr := reg.Handler(ctx, args, execCtx)
	if execErr != nil {
		out := jsonError(execErr)
		return backboard.ToolOutput{ToolCallID: call.ID, Output: out}, false, "", execErr
	}

	finished := call.Function.Name == "finish"
	if call.Function.Name == "message" || call.Function.Name == "finish" {
		payload := map[string]any{"ok": true}
		b, _ := json.Marshal(payload)
		return backboard.ToolOutput{ToolCallID: call.ID, Output: string(b)}, finished, execCtx.FinishSummary, nil
	}

	payload := map[string]any{"ok": true, "result": result}
	b, _ := json.Marshal(payload)
	return backboard.ToolOutput{ToolCallID: call.ID, Output: string(b)}, finished, execCtx.FinishSummary, nil
}

func jsonError(err error) string {
	payload := map[string]any{"ok": false, "error": err.Error()}
	b, _ := json.Marshal(payload)
	return string(b)
}
