package tester

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"backboard-swarm/be/internal/types"
)

type taskResponse struct {
	RunID string `json:"run_id"`
	State string `json:"state"`
}

func Run(ctx context.Context, serverURL, task string, out io.Writer) error {
	wsURL, err := toWebSocketURL(serverURL)
	if err != nil {
		return err
	}

	conn, _, err := websocket.DefaultDialer.DialContext(ctx, wsURL+"/ws", nil)
	if err != nil {
		return fmt.Errorf("connect websocket: %w", err)
	}
	defer conn.Close()

	events := make(chan types.Event, 128)
	errs := make(chan error, 1)
	go readEvents(conn, events, errs)

	runID, err := submitTask(ctx, serverURL, task)
	if err != nil {
		return err
	}
	fmt.Fprintf(out, "run_id=%s\n", runID)

	agentOrdinals := map[string]int{}
	nextAgent := 1

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case err := <-errs:
			return err
		case evt := <-events:
			if evt.RunID != runID {
				continue
			}
			switch evt.Type {
			case "agent_started", "agent_status", "tool_call", "tool_result", "agent_finished":
				agentID := evt.AgentID
				if agentID == "" {
					agentID = "unknown"
				}
				ord, ok := agentOrdinals[agentID]
				if !ok {
					agentOrdinals[agentID] = nextAgent
					ord = nextAgent
					nextAgent++
				}
				role := string(evt.Role)
				if role == "" {
					role = "system"
				}
				msg := strings.TrimSpace(evt.Message)
				if msg == "" {
					msg = strings.TrimSpace(evt.Status)
				}
				if evt.ToolName != "" {
					msg = fmt.Sprintf("%s (%s)", msg, evt.ToolName)
				}
				fmt.Fprintf(out, "[%s] agent %d: %s\n", role, ord, msg)

			case "swarm_finished":
				if strings.EqualFold(evt.Status, "failed") {
					return fmt.Errorf("run failed: %s", evt.Message)
				}
				fmt.Fprintf(out, "\nFinal summary:\n%s\n", evt.Message)
				return nil
			}
		}
	}
}

func readEvents(conn *websocket.Conn, events chan<- types.Event, errs chan<- error) {
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			errs <- err
			return
		}
		var evt types.Event
		if err := json.Unmarshal(msg, &evt); err != nil {
			continue
		}
		events <- evt
	}
}

func submitTask(ctx context.Context, serverURL, task string) (string, error) {
	body, _ := json.Marshal(map[string]string{"task": task})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(serverURL, "/")+"/tasks", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return "", fmt.Errorf("submit task: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("submit task failed (%d): %s", resp.StatusCode, string(b))
	}

	var parsed taskResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return "", err
	}
	if parsed.RunID == "" {
		return "", fmt.Errorf("missing run_id in response")
	}
	return parsed.RunID, nil
}

func toWebSocketURL(serverURL string) (string, error) {
	u, err := url.Parse(strings.TrimRight(serverURL, "/"))
	if err != nil {
		return "", err
	}
	switch u.Scheme {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	case "ws", "wss":
	default:
		return "", fmt.Errorf("unsupported scheme: %s", u.Scheme)
	}
	return u.String(), nil
}
