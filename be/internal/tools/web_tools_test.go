package tools

import (
	"context"
	"strings"
	"testing"
)

func TestWebSearchToolValidation(t *testing.T) {
	_, err := webSearchTool(context.Background(), map[string]any{}, &ExecutionContext{JinaAPIKey: "x"})
	if err == nil || !strings.Contains(err.Error(), "query is required") {
		t.Fatalf("expected query validation error, got %v", err)
	}

	_, err = webSearchTool(context.Background(), map[string]any{"query": "jina"}, &ExecutionContext{})
	if err == nil || !strings.Contains(err.Error(), "JINA_API_KEY") {
		t.Fatalf("expected api key validation error, got %v", err)
	}
}

func TestWebFetchToolValidation(t *testing.T) {
	_, err := webFetchTool(context.Background(), map[string]any{"url": "https://example.com"}, &ExecutionContext{})
	if err == nil || !strings.Contains(err.Error(), "JINA_API_KEY") {
		t.Fatalf("expected api key validation error, got %v", err)
	}

	_, err = webFetchTool(context.Background(), map[string]any{"url": "ftp://example.com"}, &ExecutionContext{JinaAPIKey: "x"})
	if err == nil || !strings.Contains(err.Error(), "http:// or https://") {
		t.Fatalf("expected url scheme validation error, got %v", err)
	}
}
