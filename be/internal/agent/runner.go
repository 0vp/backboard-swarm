package agent

import (
	"context"
	"encoding/json"
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

	ensureMu   sync.Mutex
	sessionMu  sync.Mutex
	sessions   map[string]agentSession
	retryLimit int
}

type agentSession struct {
	AssistantID string
	ThreadID    string
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
		sessions:   make(map[string]agentSession),
		retryLimit: 3,
	}
}

func (r *Runner) RunTask(ctx context.Context, in TaskInput) (TaskResult, error) {
	role := in.Role.Normalize()
	session, created, err := r.getOrCreateSession(ctx, in.RunID, in.AgentID, role)
	if err != nil {
		return TaskResult{}, err
	}
	if created {
		r.emit(types.Event{
			Type:      "agent_started",
			RunID:     in.RunID,
			AgentID:   in.AgentID,
			Role:      role,
			Message:   fmt.Sprintf("starting (assistant=%s thread=%s)", session.AssistantID, session.ThreadID),
			Timestamp: time.Now().UTC(),
			Meta: map[string]any{
				"assistant_id": session.AssistantID,
				"thread_id":    session.ThreadID,
			},
		})
	} else {
		r.emit(types.Event{
			Type:      "agent_status",
			RunID:     in.RunID,
			AgentID:   in.AgentID,
			Role:      role,
			Status:    "session_reuse",
			Message:   fmt.Sprintf("continuing on existing thread %s", session.ThreadID),
			Timestamp: time.Now().UTC(),
			Meta: map[string]any{
				"assistant_id": session.AssistantID,
				"thread_id":    session.ThreadID,
			},
		})
	}

	resp, err := r.addMessageWithRetry(ctx, in, role, backboard.AddMessageRequest{
		ThreadID:    session.ThreadID,
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
		status := normalizeStatus(resp.Status)
		r.emit(types.Event{
			Type:      "agent_status",
			RunID:     in.RunID,
			AgentID:   in.AgentID,
			Role:      role,
			Status:    status,
			Message:   statusMessage(resp),
			Timestamp: time.Now().UTC(),
			Meta: map[string]any{
				"iteration":      i + 1,
				"max_iterations": r.cfg.MaxIterations,
				"tool_calls":     len(resp.ToolCalls),
				"thread_id":      session.ThreadID,
			},
		})

		switch status {
		case backboard.StatusRequiresAction:
			if len(resp.ToolCalls) == 0 {
				return TaskResult{}, fmt.Errorf("requires action with no tool calls")
			}

			execCtx := &tools.ExecutionContext{
				RunID:          in.RunID,
				AgentID:        in.AgentID,
				Role:           role,
				WorkspaceRoot:  r.cfg.WorkspaceRoot,
				JinaAPIKey:     r.cfg.JinaAPIKey,
				RequestTimeout: r.cfg.RequestTimeout,
				Todos:          r.todos,
				Emitter:        r.events,
			}

			outputs := make([]backboard.ToolOutput, 0, len(resp.ToolCalls))
			finished := false
			for idx, call := range resp.ToolCalls {
				argsPreview := r.toolArgsPreview(call)
				r.emit(types.Event{
					Type:      "tool_call",
					RunID:     in.RunID,
					AgentID:   in.AgentID,
					Role:      role,
					ToolName:  call.Function.Name,
					Message:   fmt.Sprintf("executing tool %d/%d%s", idx+1, len(resp.ToolCalls), argsPreview),
					Timestamp: time.Now().UTC(),
					Meta: map[string]any{
						"tool_index": idx + 1,
						"tool_total": len(resp.ToolCalls),
					},
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
						Message:   fmt.Sprintf("tool failed: %v", execErr),
						Timestamp: time.Now().UTC(),
						Meta: map[string]any{
							"output_preview": truncate(out.Output, 220),
						},
					})
				} else {
					r.emit(types.Event{
						Type:      "tool_result",
						RunID:     in.RunID,
						AgentID:   in.AgentID,
						Role:      role,
						ToolName:  call.Function.Name,
						Status:    "ok",
						Message:   fmt.Sprintf("tool executed, output=%s", truncate(out.Output, 220)),
						Timestamp: time.Now().UTC(),
						Meta: map[string]any{
							"output_preview": truncate(out.Output, 220),
						},
					})
				}
				outputs = append(outputs, out)
				if isFinish {
					finished = true
					finishSummary = summary
				}
			}

			resp, err = r.submitToolOutputsWithRetry(ctx, in, role, session.ThreadID, resp.RunID, outputs)
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

func (r *Runner) EndRun(runID string) {
	r.sessionMu.Lock()
	defer r.sessionMu.Unlock()
	prefix := runID + "::"
	for k := range r.sessions {
		if strings.HasPrefix(k, prefix) {
			delete(r.sessions, k)
		}
	}
}

func (r *Runner) getOrCreateSession(ctx context.Context, runID, agentID string, role types.Role) (agentSession, bool, error) {
	key := sessionKey(runID, agentID)
	r.sessionMu.Lock()
	if s, ok := r.sessions[key]; ok {
		r.sessionMu.Unlock()
		return s, false, nil
	}
	r.sessionMu.Unlock()

	assistantID, err := r.ensureAssistant(ctx, role)
	if err != nil {
		return agentSession{}, false, err
	}

	thread, err := r.client.CreateThread(ctx, assistantID)
	if err != nil {
		return agentSession{}, false, fmt.Errorf("create thread: %w", err)
	}

	s := agentSession{AssistantID: assistantID, ThreadID: thread.ThreadID}
	r.sessionMu.Lock()
	r.sessions[key] = s
	r.sessionMu.Unlock()
	return s, true, nil
}

func sessionKey(runID, agentID string) string {
	return runID + "::" + agentID
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
	status := normalizeStatus(resp.Status)
	if status == backboard.StatusRequiresAction && len(resp.ToolCalls) > 0 {
		return fmt.Sprintf("requested %d tool call(s)", len(resp.ToolCalls))
	}
	if strings.TrimSpace(resp.Content) != "" {
		return resp.Content
	}
	if resp.Message != "" {
		return resp.Message
	}
	return "processing"
}

func (r *Runner) addMessageWithRetry(ctx context.Context, in TaskInput, role types.Role, req backboard.AddMessageRequest) (backboard.MessageResponse, error) {
	var lastErr error
	for attempt := 1; attempt <= r.retryLimit; attempt++ {
		resp, err := r.client.AddMessage(ctx, req)
		if err == nil {
			return resp, nil
		}
		lastErr = err
		if !isTransient(err) || attempt == r.retryLimit {
			break
		}
		delay := time.Duration(attempt) * 800 * time.Millisecond
		r.emit(types.Event{
			Type:      "agent_status",
			RunID:     in.RunID,
			AgentID:   in.AgentID,
			Role:      role,
			Status:    "retrying",
			Message:   fmt.Sprintf("add_message transient failure (attempt %d/%d): %v; retrying in %s", attempt, r.retryLimit, err, delay),
			Timestamp: time.Now().UTC(),
		})
		select {
		case <-ctx.Done():
			return backboard.MessageResponse{}, ctx.Err()
		case <-time.After(delay):
		}
	}
	return backboard.MessageResponse{}, lastErr
}

func (r *Runner) submitToolOutputsWithRetry(ctx context.Context, in TaskInput, role types.Role, threadID, runID string, outputs []backboard.ToolOutput) (backboard.MessageResponse, error) {
	var lastErr error
	for attempt := 1; attempt <= r.retryLimit; attempt++ {
		resp, err := r.client.SubmitToolOutputs(ctx, threadID, runID, outputs)
		if err == nil {
			return resp, nil
		}
		lastErr = err
		if !isTransient(err) || attempt == r.retryLimit {
			break
		}
		delay := time.Duration(attempt) * 800 * time.Millisecond
		r.emit(types.Event{
			Type:      "agent_status",
			RunID:     in.RunID,
			AgentID:   in.AgentID,
			Role:      role,
			Status:    "retrying",
			Message:   fmt.Sprintf("submit_tool_outputs transient failure (attempt %d/%d): %v; retrying in %s", attempt, r.retryLimit, err, delay),
			Timestamp: time.Now().UTC(),
			Meta: map[string]any{
				"thread_id": threadID,
				"run_id":    runID,
			},
		})
		select {
		case <-ctx.Done():
			return backboard.MessageResponse{}, ctx.Err()
		case <-time.After(delay):
		}
	}
	return backboard.MessageResponse{}, lastErr
}

func isTransient(err error) bool {
	if err == nil {
		return false
	}
	v := strings.ToLower(err.Error())
	markers := []string{"(429)", "(500)", "(502)", "(503)", "(504)", "timeout", "temporarily", "connection reset", "broken pipe", "eof"}
	for _, m := range markers {
		if strings.Contains(v, m) {
			return true
		}
	}
	return false
}

func (r *Runner) toolArgsPreview(call backboard.ToolCall) string {
	args, err := call.ArgumentsMap()
	if err != nil {
		return ""
	}
	b, err := json.Marshal(args)
	if err != nil {
		return ""
	}
	if len(b) == 0 || string(b) == "{}" {
		return ""
	}
	return fmt.Sprintf(" args=%s", truncate(string(b), 180))
}

func truncate(s string, max int) string {
	if max <= 0 {
		return ""
	}
	s = strings.TrimSpace(s)
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

func (r *Runner) emit(evt types.Event) {
	if r.events == nil {
		return
	}
	r.events.Emit(evt)
}
