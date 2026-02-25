package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path"
	"strings"
	"time"

	"backboard-swarm/be/internal/agent"
	"backboard-swarm/be/internal/backboard"
	"backboard-swarm/be/internal/config"
	"backboard-swarm/be/internal/orchestrator"
	"backboard-swarm/be/internal/runtime"
	"backboard-swarm/be/internal/tools"
	"backboard-swarm/be/internal/types"
	"backboard-swarm/be/internal/ws"
)

type Server struct {
	cfg      config.Config
	runStore *runtime.RunStore
	hub      *ws.Hub
	swarm    *orchestrator.Swarm
	http     *http.Server
}

type taskRequest struct {
	Task string `json:"task"`
}

type taskResponse struct {
	RunID string `json:"run_id"`
	State string `json:"state"`
}

func New(cfg config.Config) (*Server, error) {
	wd, err := os.Getwd()
	if err != nil {
		return nil, err
	}

	prompts, err := agent.LoadPrompts(wd)
	if err != nil {
		return nil, err
	}

	hub := ws.NewHub()
	runStore := runtime.NewRunStore()
	registry := tools.NewRegistry()
	tools.RegisterBuiltins(registry)

	client := backboard.NewClient(cfg.BaseURL, cfg.BackboardAPIKey, cfg.RequestTimeout)
	runner := agent.NewRunner(
		client,
		cfg,
		registry,
		runtime.NewAssistantStore(),
		runtime.NewTodoStore(),
		prompts,
		hub,
	)
	swarm := orchestrator.NewSwarm(runner, cfg, hub)

	s := &Server{cfg: cfg, runStore: runStore, hub: hub, swarm: swarm}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/ws", s.hub.HandleWS)
	mux.HandleFunc("/tasks", s.handleTasks)
	mux.HandleFunc("/runs/", s.handleGetRun)

	s.http = &http.Server{
		Addr:              cfg.ServerAddr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	return s, nil
}

func (s *Server) ListenAndServe() error {
	return s.http.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.http.Shutdown(ctx)
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleTasks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "method not allowed"})
		return
	}

	var req taskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json"})
		return
	}
	task := strings.TrimSpace(req.Task)
	if task == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "task is required"})
		return
	}

	runID := s.runStore.New(task)
	s.runStore.SetRunning(runID)
	writeJSON(w, http.StatusAccepted, taskResponse{RunID: runID, State: "running"})

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*s.cfg.RequestTimeout)
		defer cancel()

		summary, err := s.swarm.Run(ctx, runID, task)
		if err != nil {
			s.runStore.SetFailed(runID, err)
			s.hub.Emit(types.Event{
				Type:      "swarm_finished",
				RunID:     runID,
				Status:    "failed",
				Message:   err.Error(),
				Timestamp: time.Now().UTC(),
			})
			return
		}
		s.runStore.SetCompleted(runID, summary)
	}()
}

func (s *Server) handleGetRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "method not allowed"})
		return
	}
	runID := path.Base(r.URL.Path)
	if runID == "" || runID == "runs" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "missing run id"})
		return
	}
	run, ok := s.runStore.Get(runID)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "run not found"})
		return
	}
	writeJSON(w, http.StatusOK, run)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		fmt.Fprintf(w, "{\"error\":%q}", err.Error())
	}
}
