package agent

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"backboard-swarm/be/internal/backboard"
	"backboard-swarm/be/internal/config"
	"backboard-swarm/be/internal/runtime"
	"backboard-swarm/be/internal/tools"
	"backboard-swarm/be/internal/types"
)

type EventSink interface {
	Emit(evt types.Event)
}

type TaskInput struct {
	RunID   string
	AgentID string
	Role    types.Role
	Task    string
}

type TaskResult struct {
	Summary string
	Raw     string
}

type Runner struct {
	client     *backboard.Client
	cfg        config.Config
	registry   *tools.Registry
	assistants *runtime.AssistantStore
	todos      *runtime.TodoStore
	prompts    PromptStore
	events     EventSink

	ensureMu sync.Mutex
}

func NewRunner(
	client *backboard.Client,
	cfg config.Config,
	registry *tools.Registry,
	assistants *runtime.AssistantStore,
	todos *runtime.TodoStore,
	prompts PromptStore,
	events EventSink,
) *Runner {
	return &Runner{
		client:     client,
		cfg:        cfg,
		registry:   registry,
		assistants: assistants,
		todos:      todos,
		prompts:    prompts,
		events:     events,
	}
}

func (r *Runner) RunTask(ctx context.Context, in TaskInput) (TaskResult, error) {
	role := in.Role.Normalize()
	r.emit(types.Event{
		Type:      "agent_started",
		RunID:     in.RunID,
		AgentID:   in.AgentID,
		Role:      role,
		Message:   "starting",
		Timestamp: time.Now().UTC(),
	})

	assistantID, err := r.ensureAssistant(ctx, role)
	if err != nil {
		return TaskResult{}, err
	}

	thread, err := r.client.CreateThread(ctx, assistantID)
	if err != nil {
		return TaskResult{}, fmt.Errorf("create thread: %w", err)
	}

	resp, err := r.client.AddMessage(ctx, backboard.AddMessageRequest{
		ThreadID:    thread.ThreadID,
		Content:     in.Task,
		LLMProvider: r.cfg.LLMProvider,
		ModelName:   r.cfg.ModelName,
		Memory:      r.cfg.MemoryMode,
		WebSearch:   r.cfg.WebSearchMode,
		Stream:      false,
		SendToLLM:   "true",
	})
	if err != nil {
		return TaskResult{}, fmt.Errorf("add message: %w", err)
	}

	finishSummary := ""
	for i := 0; i < r.cfg.MaxIterations; i++ {
		r.emit(types.Event{
			Type:      "agent_status",
			RunID:     in.RunID,
			AgentID:   in.AgentID,
			Role:      role,
			Status:    normalizeStatus(resp.Status),
			Message:   statusMessage(resp),
			Timestamp: time.Now().UTC(),
		})

		switch normalizeStatus(resp.Status) {
		case backboard.StatusRequiresAction:
			if len(resp.ToolCalls) == 0 {
				return TaskResult{}, fmt.Errorf("requires action with no tool calls")
			}

			execCtx := &tools.ExecutionContext{
				RunID:         in.RunID,
				AgentID:       in.AgentID,
				Role:          role,
				WorkspaceRoot: r.cfg.WorkspaceRoot,
				Todos:         r.todos,
				Emitter:       r.events,
			}

			outputs := make([]backboard.ToolOutput, 0, len(resp.ToolCalls))
			finished := false
			for _, call := range resp.ToolCalls {
				r.emit(types.Event{
					Type:      "tool_call",
					RunID:     in.RunID,
					AgentID:   in.AgentID,
					Role:      role,
					ToolName:  call.Function.Name,
					Message:   "executing tool",
					Timestamp: time.Now().UTC(),
				})

				out, isFinish, summary, execErr := r.registry.Execute(ctx, call, execCtx)
				if execErr != nil {
					r.emit(types.Event{
						Type:      "tool_result",
						RunID:     in.RunID,
						AgentID:   in.AgentID,
						Role:      role,
						ToolName:  call.Function.Name,
						Status:    "error",
						Message:   execErr.Error(),
						Timestamp: time.Now().UTC(),
					})
				} else {
					r.emit(types.Event{
						Type:      "tool_result",
						RunID:     in.RunID,
						AgentID:   in.AgentID,
						Role:      role,
						ToolName:  call.Function.Name,
						Status:    "ok",
						Message:   "tool executed",
						Timestamp: time.Now().UTC(),
					})
				}
				outputs = append(outputs, out)
				if isFinish {
					finished = true
					finishSummary = summary
				}
			}

			resp, err = r.client.SubmitToolOutputs(ctx, thread.ThreadID, resp.RunID, outputs)
			if err != nil {
				return TaskResult{}, fmt.Errorf("submit tool outputs: %w", err)
			}
			if finished {
				return TaskResult{Summary: finishSummary, Raw: resp.Content}, nil
			}

		case backboard.StatusCompleted:
			summary := strings.TrimSpace(resp.Content)
			if finishSummary != "" {
				summary = finishSummary
			}
			return TaskResult{Summary: summary, Raw: resp.Content}, nil

		case backboard.StatusFailed, backboard.StatusCancelled:
			return TaskResult{}, fmt.Errorf("agent ended with status %s: %s", resp.Status, resp.Content)

		default:
			if resp.Content != "" && len(resp.ToolCalls) == 0 {
				return TaskResult{Summary: resp.Content, Raw: resp.Content}, nil
			}
			time.Sleep(200 * time.Millisecond)
		}
	}

	return TaskResult{}, fmt.Errorf("agent exceeded max iterations (%d)", r.cfg.MaxIterations)
}

func (r *Runner) ensureAssistant(ctx context.Context, role types.Role) (string, error) {
	if id, ok := r.assistants.Get(string(role)); ok && id != "" {
		return id, nil
	}

	r.ensureMu.Lock()
	defer r.ensureMu.Unlock()
	if id, ok := r.assistants.Get(string(role)); ok && id != "" {
		return id, nil
	}

	a, err := r.client.CreateAssistant(ctx, backboard.CreateAssistantRequest{
		Name:         fmt.Sprintf("wuvo-%s", role),
		SystemPrompt: r.prompts.For(role),
		Tools:        r.registry.Definitions(),
	})
	if err != nil {
		return "", fmt.Errorf("create assistant for role %s: %w", role, err)
	}
	r.assistants.Set(string(role), a.AssistantID)
	return a.AssistantID, nil
}

func normalizeStatus(status string) string {
	if status == "" {
		return ""
	}
	return strings.ToUpper(status)
}

func statusMessage(resp backboard.MessageResponse) string {
	if strings.TrimSpace(resp.Content) != "" {
		return resp.Content
	}
	if len(resp.ToolCalls) > 0 {
		return fmt.Sprintf("requested %d tool call(s)", len(resp.ToolCalls))
	}
	if resp.Message != "" {
		return resp.Message
	}
	return "processing"
}

func (r *Runner) emit(evt types.Event) {
	if r.events == nil {
		return
	}
	r.events.Emit(evt)
}
