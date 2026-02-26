package tools

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"backboard-swarm/be/internal/backboard"
	"backboard-swarm/be/internal/runtime"
	"backboard-swarm/be/internal/types"
)

func TestRegistryReadAndUnknownTool(t *testing.T) {
	tmp := t.TempDir()
	file := filepath.Join(tmp, "a.txt")
	if err := os.WriteFile(file, []byte("hello world"), 0o644); err != nil {
		t.Fatal(err)
	}

	r := NewRegistry()
	RegisterBuiltins(r)

	args, _ := json.Marshal(map[string]any{"path": file})
	out, _, _, err := r.Execute(context.Background(), backboard.ToolCall{
		ID:   "1",
		Type: "function",
		Function: backboard.ToolCallFunction{
			Name:            "read",
			ParsedArguments: args,
		},
	}, &ExecutionContext{WorkspaceRoot: tmp, Todos: runtime.NewTodoStore(), Role: types.RoleCoder})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if !strings.Contains(out.Output, "hello world") {
		t.Fatalf("expected read output to include file content, got %s", out.Output)
	}

	_, _, _, err = r.Execute(context.Background(), backboard.ToolCall{
		ID: "2",
		Function: backboard.ToolCallFunction{
			Name:            "not_allowed",
			ParsedArguments: []byte(`{}`),
		},
	}, &ExecutionContext{WorkspaceRoot: tmp, Todos: runtime.NewTodoStore(), Role: types.RoleCoder})
	if err == nil {
		t.Fatal("expected error for unknown tool")
	}
}

func TestRegistryPluginRegistration(t *testing.T) {
	r := NewRegistry()
	r.RegisterPlugin(Registration{
		Name:        "echo",
		Description: "echo input",
		Parameters:  objectSchema(map[string]any{"value": map[string]any{"type": "string"}}, []string{"value"}),
		Handler: func(_ context.Context, args map[string]any, _ *ExecutionContext) (any, error) {
			return map[string]any{"value": args["value"]}, nil
		},
	})

	out, _, _, err := r.Execute(context.Background(), backboard.ToolCall{
		ID: "1",
		Function: backboard.ToolCallFunction{
			Name:            "echo",
			ParsedArguments: []byte(`{"value":"ok"}`),
		},
	}, &ExecutionContext{WorkspaceRoot: t.TempDir(), Todos: runtime.NewTodoStore(), Role: types.RoleCoder})
	if err != nil {
		t.Fatalf("expected plugin to run: %v", err)
	}
	if !strings.Contains(out.Output, "ok") {
		t.Fatalf("expected plugin output, got %s", out.Output)
	}
}

func TestRegistryMessageAndFinishOutputsAreMinimal(t *testing.T) {
	r := NewRegistry()
	RegisterBuiltins(r)

	msgOut, finished, summary, err := r.Execute(context.Background(), backboard.ToolCall{
		ID: "m1",
		Function: backboard.ToolCallFunction{
			Name:            "message",
			ParsedArguments: []byte(`{"content":"verbose agent text"}`),
		},
	}, &ExecutionContext{WorkspaceRoot: t.TempDir(), Todos: runtime.NewTodoStore(), Role: types.RoleCoder})
	if err != nil {
		t.Fatalf("message tool failed: %v", err)
	}
	if finished {
		t.Fatal("message should not finish run")
	}
	if summary != "" {
		t.Fatalf("message summary should be empty, got %q", summary)
	}
	if strings.Contains(msgOut.Output, "verbose agent text") {
		t.Fatalf("message output leaked content: %s", msgOut.Output)
	}

	finishOut, finishFlag, finishSummary, err := r.Execute(context.Background(), backboard.ToolCall{
		ID: "f1",
		Function: backboard.ToolCallFunction{
			Name:            "finish",
			ParsedArguments: []byte(`{"summary":"final detailed summary"}`),
		},
	}, &ExecutionContext{WorkspaceRoot: t.TempDir(), Todos: runtime.NewTodoStore(), Role: types.RoleCoder})
	if err != nil {
		t.Fatalf("finish tool failed: %v", err)
	}
	if !finishFlag {
		t.Fatal("finish should mark run finished")
	}
	if finishSummary != "final detailed summary" {
		t.Fatalf("expected finish summary, got %q", finishSummary)
	}
	if strings.Contains(finishOut.Output, "final detailed summary") {
		t.Fatalf("finish output leaked summary: %s", finishOut.Output)
	}
}
