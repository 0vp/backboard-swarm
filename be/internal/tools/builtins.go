package tools

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"backboard-swarm/be/internal/types"
)

func RegisterBuiltins(r *Registry) {
	r.RegisterBuiltin(Registration{
		Name:        "read",
		Description: "Read file contents from the workspace",
		Parameters: objectSchema(map[string]any{
			"path":      map[string]any{"type": "string", "description": "Absolute or workspace-relative file path"},
			"max_bytes": map[string]any{"type": "integer", "description": "Optional max bytes to read", "default": 20000},
		}, []string{"path"}),
		Handler: readTool,
	})

	r.RegisterBuiltin(Registration{
		Name:        "ls",
		Description: "List entries in a directory",
		Parameters: objectSchema(map[string]any{
			"path": map[string]any{"type": "string", "description": "Directory path. Defaults to workspace root."},
		}, nil),
		Handler: lsTool,
	})

	r.RegisterBuiltin(Registration{
		Name:        "grep",
		Description: "Search for a regex pattern in files under a path",
		Parameters: objectSchema(map[string]any{
			"pattern": map[string]any{"type": "string"},
			"path":    map[string]any{"type": "string", "description": "File or directory path. Defaults to workspace root."},
		}, []string{"pattern"}),
		Handler: grepTool,
	})

	r.RegisterBuiltin(Registration{
		Name:        "glob",
		Description: "Find files matching a glob pattern",
		Parameters: objectSchema(map[string]any{
			"pattern": map[string]any{"type": "string"},
			"path":    map[string]any{"type": "string", "description": "Base path. Defaults to workspace root."},
		}, []string{"pattern"}),
		Handler: globTool,
	})

	r.RegisterBuiltin(Registration{
		Name:        "websearch",
		Description: "Search the web using Jina and return SERP content",
		Parameters: objectSchema(map[string]any{
			"query":     map[string]any{"type": "string"},
			"max_bytes": map[string]any{"type": "integer", "description": "Optional max bytes to return", "default": 30000},
		}, []string{"query"}),
		Handler: webSearchTool,
	})

	r.RegisterBuiltin(Registration{
		Name:        "web_fetch",
		Description: "Fetch a web page through Jina Reader and return markdown",
		Parameters: objectSchema(map[string]any{
			"url":       map[string]any{"type": "string", "description": "HTTP(S) URL to fetch"},
			"max_bytes": map[string]any{"type": "integer", "description": "Optional max bytes to return", "default": 40000},
		}, []string{"url"}),
		Handler: webFetchTool,
	})

	r.RegisterBuiltin(Registration{
		Name:        "message",
		Description: "Emit a human-facing agent status message",
		Parameters: objectSchema(map[string]any{
			"content": map[string]any{"type": "string"},
		}, []string{"content"}),
		Handler: messageTool,
	})

	r.RegisterBuiltin(Registration{
		Name:        "todo_create",
		Description: "Create a todo item",
		Parameters: objectSchema(map[string]any{
			"title": map[string]any{"type": "string"},
		}, []string{"title"}),
		Handler: todoCreate,
	})

	r.RegisterBuiltin(Registration{
		Name:        "todo_update",
		Description: "Update a todo title",
		Parameters: objectSchema(map[string]any{
			"id":    map[string]any{"type": "string"},
			"title": map[string]any{"type": "string"},
		}, []string{"id", "title"}),
		Handler: todoUpdate,
	})

	r.RegisterBuiltin(Registration{
		Name:        "todo_delete",
		Description: "Delete a todo by id",
		Parameters: objectSchema(map[string]any{
			"id": map[string]any{"type": "string"},
		}, []string{"id"}),
		Handler: todoDelete,
	})

	r.RegisterBuiltin(Registration{
		Name:        "todo_list",
		Description: "List current todos for this agent",
		Parameters:  objectSchema(map[string]any{}, nil),
		Handler:     todoList,
	})

	r.RegisterBuiltin(Registration{
		Name:        "todo_complete",
		Description: "Mark a todo as completed",
		Parameters: objectSchema(map[string]any{
			"id": map[string]any{"type": "string"},
		}, []string{"id"}),
		Handler: todoComplete,
	})

	r.RegisterBuiltin(Registration{
		Name:        "finish",
		Description: "Signal that the agent is done and provide final summary",
		Parameters: objectSchema(map[string]any{
			"summary": map[string]any{"type": "string"},
		}, []string{"summary"}),
		Handler: finishTool,
	})
}

func objectSchema(properties map[string]any, required []string) map[string]any {
	return map[string]any{"type": "object", "properties": properties, "required": required}
}

func readTool(_ context.Context, args map[string]any, execCtx *ExecutionContext) (any, error) {
	p, err := resolvePath(execCtx.WorkspaceRoot, getString(args, "path", ""))
	if err != nil {
		return nil, err
	}
	maxBytes := getInt(args, "max_bytes", 20000)
	b, err := os.ReadFile(p)
	if err != nil {
		return nil, err
	}
	if len(b) > maxBytes {
		b = b[:maxBytes]
	}
	return map[string]any{"path": p, "content": string(b)}, nil
}

func lsTool(_ context.Context, args map[string]any, execCtx *ExecutionContext) (any, error) {
	p := getString(args, "path", execCtx.WorkspaceRoot)
	resolved, err := resolvePath(execCtx.WorkspaceRoot, p)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(resolved)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(entries))
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() {
			name += "/"
		}
		out = append(out, name)
	}
	sort.Strings(out)
	return map[string]any{"path": resolved, "entries": out}, nil
}

func grepTool(_ context.Context, args map[string]any, execCtx *ExecutionContext) (any, error) {
	pattern := getString(args, "pattern", "")
	if strings.TrimSpace(pattern) == "" {
		return nil, errors.New("pattern is required")
	}
	re, err := regexp.Compile(pattern)
	if err != nil {
		return nil, err
	}

	basePath := getString(args, "path", execCtx.WorkspaceRoot)
	root, err := resolvePath(execCtx.WorkspaceRoot, basePath)
	if err != nil {
		return nil, err
	}

	matches := make([]map[string]any, 0)
	err = filepath.WalkDir(root, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if d.IsDir() {
			if d.Name() == ".git" || d.Name() == "node_modules" {
				return filepath.SkipDir
			}
			return nil
		}
		if len(matches) >= 100 {
			return ioEOF{}
		}

		f, err := os.Open(path)
		if err != nil {
			return nil
		}
		defer f.Close()

		scanner := bufio.NewScanner(f)
		lineNo := 0
		for scanner.Scan() {
			lineNo++
			line := scanner.Text()
			if re.MatchString(line) {
				matches = append(matches, map[string]any{"path": path, "line": lineNo, "content": line})
				if len(matches) >= 100 {
					return ioEOF{}
				}
			}
		}
		return nil
	})
	if err != nil && !errors.As(err, &ioEOF{}) {
		return nil, err
	}
	return map[string]any{"pattern": pattern, "matches": matches}, nil
}

func globTool(_ context.Context, args map[string]any, execCtx *ExecutionContext) (any, error) {
	pattern := getString(args, "pattern", "")
	if pattern == "" {
		return nil, errors.New("pattern is required")
	}
	base := getString(args, "path", execCtx.WorkspaceRoot)
	baseResolved, err := resolvePath(execCtx.WorkspaceRoot, base)
	if err != nil {
		return nil, err
	}
	globPattern := pattern
	if !filepath.IsAbs(globPattern) {
		globPattern = filepath.Join(baseResolved, globPattern)
	}
	results, err := filepath.Glob(globPattern)
	if err != nil {
		return nil, err
	}
	return map[string]any{"pattern": globPattern, "matches": results}, nil
}

func webSearchTool(ctx context.Context, args map[string]any, execCtx *ExecutionContext) (any, error) {
	query := strings.TrimSpace(getString(args, "query", ""))
	if query == "" {
		return nil, errors.New("query is required")
	}
	if strings.TrimSpace(execCtx.JinaAPIKey) == "" {
		return nil, errors.New("JINA_API_KEY is required for websearch")
	}

	maxBytes := getInt(args, "max_bytes", 30000)
	endpoint := "https://s.jina.ai/?q=" + url.QueryEscape(query)
	body, statusCode, truncated, err := jinaRequest(ctx, endpoint, execCtx.JinaAPIKey, execCtx.RequestTimeout, map[string]string{"X-Respond-With": "no-content"}, maxBytes)
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"query":       query,
		"status_code": statusCode,
		"content":     body,
		"truncated":   truncated,
	}, nil
}

func webFetchTool(ctx context.Context, args map[string]any, execCtx *ExecutionContext) (any, error) {
	rawURL := strings.TrimSpace(getString(args, "url", ""))
	if rawURL == "" {
		return nil, errors.New("url is required")
	}
	if strings.TrimSpace(execCtx.JinaAPIKey) == "" {
		return nil, errors.New("JINA_API_KEY is required for web_fetch")
	}
	if _, err := validateHTTPURL(rawURL); err != nil {
		return nil, err
	}

	maxBytes := getInt(args, "max_bytes", 40000)
	endpoint := "https://r.jina.ai/" + rawURL
	body, statusCode, truncated, err := jinaRequest(ctx, endpoint, execCtx.JinaAPIKey, execCtx.RequestTimeout, nil, maxBytes)
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"url":         rawURL,
		"status_code": statusCode,
		"markdown":    body,
		"truncated":   truncated,
	}, nil
}

func jinaRequest(ctx context.Context, endpoint, apiKey string, timeout time.Duration, extraHeaders map[string]string, maxBytes int) (string, int, bool, error) {
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	if maxBytes <= 0 {
		maxBytes = 20000
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", 0, false, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	for k, v := range extraHeaders {
		req.Header.Set(k, v)
	}

	resp, err := (&http.Client{Timeout: timeout}).Do(req)
	if err != nil {
		return "", 0, false, err
	}
	defer resp.Body.Close()

	limited := io.LimitReader(resp.Body, int64(maxBytes+1))
	b, err := io.ReadAll(limited)
	if err != nil {
		return "", resp.StatusCode, false, err
	}
	truncated := len(b) > maxBytes
	if truncated {
		b = b[:maxBytes]
	}

	content := string(b)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if len(content) > 220 {
			content = content[:220] + "..."
		}
		return "", resp.StatusCode, false, fmt.Errorf("jina request failed (%d): %s", resp.StatusCode, content)
	}
	return content, resp.StatusCode, truncated, nil
}

func validateHTTPURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("invalid url: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, errors.New("url must start with http:// or https://")
	}
	if strings.TrimSpace(u.Host) == "" {
		return nil, errors.New("url host is required")
	}
	return u, nil
}

func messageTool(_ context.Context, args map[string]any, execCtx *ExecutionContext) (any, error) {
	content := getString(args, "content", "")
	if strings.TrimSpace(content) == "" {
		return nil, errors.New("content is required")
	}
	if execCtx.Emitter != nil {
		execCtx.Emitter.Emit(types.Event{
			Type:      "agent_status",
			RunID:     execCtx.RunID,
			AgentID:   execCtx.AgentID,
			Role:      execCtx.Role,
			Message:   content,
			Status:    "message",
			Timestamp: time.Now().UTC(),
		})
	}
	return map[string]any{"ack": true}, nil
}

func todoCreate(_ context.Context, args map[string]any, execCtx *ExecutionContext) (any, error) {
	if execCtx.Todos == nil {
		return nil, errors.New("todo store unavailable")
	}
	title := getString(args, "title", "")
	if title == "" {
		return nil, errors.New("title is required")
	}
	item := execCtx.Todos.Create(execCtx.AgentID, title)
	return item, nil
}

func todoUpdate(_ context.Context, args map[string]any, execCtx *ExecutionContext) (any, error) {
	id := getString(args, "id", "")
	title := getString(args, "title", "")
	if id == "" || title == "" {
		return nil, errors.New("id and title are required")
	}
	item, ok := execCtx.Todos.Update(execCtx.AgentID, id, title)
	if !ok {
		return nil, fmt.Errorf("todo %s not found", id)
	}
	return item, nil
}

func todoDelete(_ context.Context, args map[string]any, execCtx *ExecutionContext) (any, error) {
	id := getString(args, "id", "")
	if id == "" {
		return nil, errors.New("id is required")
	}
	if !execCtx.Todos.Delete(execCtx.AgentID, id) {
		return nil, fmt.Errorf("todo %s not found", id)
	}
	return map[string]any{"deleted": id}, nil
}

func todoList(_ context.Context, _ map[string]any, execCtx *ExecutionContext) (any, error) {
	if execCtx.Todos == nil {
		return nil, errors.New("todo store unavailable")
	}
	return execCtx.Todos.List(execCtx.AgentID), nil
}

func todoComplete(_ context.Context, args map[string]any, execCtx *ExecutionContext) (any, error) {
	id := getString(args, "id", "")
	if id == "" {
		return nil, errors.New("id is required")
	}
	item, ok := execCtx.Todos.Complete(execCtx.AgentID, id)
	if !ok {
		return nil, fmt.Errorf("todo %s not found", id)
	}
	return item, nil
}

func finishTool(_ context.Context, args map[string]any, execCtx *ExecutionContext) (any, error) {
	summary := getString(args, "summary", "")
	if summary == "" {
		b, _ := json.Marshal(args)
		summary = string(b)
	}
	execCtx.FinishSummary = summary
	if execCtx.Emitter != nil {
		execCtx.Emitter.Emit(types.Event{
			Type:      "agent_finished",
			RunID:     execCtx.RunID,
			AgentID:   execCtx.AgentID,
			Role:      execCtx.Role,
			Message:   summary,
			Status:    "finished",
			Timestamp: time.Now().UTC(),
		})
	}
	return map[string]any{"done": true}, nil
}

func getString(args map[string]any, key, fallback string) string {
	v, ok := args[key]
	if !ok {
		return fallback
	}
	s, ok := v.(string)
	if !ok {
		return fallback
	}
	if strings.TrimSpace(s) == "" {
		return fallback
	}
	return s
}

func getInt(args map[string]any, key string, fallback int) int {
	v, ok := args[key]
	if !ok {
		return fallback
	}
	switch t := v.(type) {
	case float64:
		if int(t) > 0 {
			return int(t)
		}
	case int:
		if t > 0 {
			return t
		}
	}
	return fallback
}

func resolvePath(root, input string) (string, error) {
	if strings.TrimSpace(input) == "" {
		input = root
	}
	abs := input
	if !filepath.IsAbs(abs) {
		abs = filepath.Join(root, input)
	}
	abs = filepath.Clean(abs)
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	absAbs, err := filepath.Abs(abs)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(rootAbs, absAbs)
	if err != nil {
		return "", err
	}
	if strings.HasPrefix(rel, "..") {
		return "", fmt.Errorf("path %s is outside workspace", input)
	}
	return absAbs, nil
}

type ioEOF struct{}

func (ioEOF) Error() string { return "stop" }
