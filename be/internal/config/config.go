package config

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	BackboardAPIKey string
	BaseURL         string
	LLMProvider     string
	ModelName       string
	MemoryMode      string
	WebSearchMode   string
	ServerAddr      string
	ServerURL       string
	WorkspaceRoot   string
	RequestTimeout  time.Duration
	MaxSubagents    int
	MaxIterations   int
}

func Load() (Config, error) {
	_ = loadDotEnv(".env")

	cfg := Config{
		BackboardAPIKey: strings.TrimSpace(os.Getenv("BACKBOARD_API_KEY")),
		BaseURL:         getenvDefault("BACKBOARD_BASE_URL", "https://app.backboard.io/api"),
		LLMProvider:     getenvDefault("BACKBOARD_LLM_PROVIDER", "openai"),
		ModelName:       getenvDefault("BACKBOARD_MODEL_NAME", "gpt-4o"),
		MemoryMode:      getenvDefault("BACKBOARD_MEMORY_MODE", "Auto"),
		WebSearchMode:   getenvDefault("BACKBOARD_WEB_SEARCH_MODE", "off"),
		ServerAddr:      getenvDefault("WUVO_SERVER_ADDR", ":8080"),
		ServerURL:       getenvDefault("WUVO_SERVER_URL", "http://127.0.0.1:8080"),
		WorkspaceRoot:   workspaceRoot(),
		RequestTimeout:  durationDefault("WUVO_REQUEST_TIMEOUT", 120*time.Second),
		MaxSubagents:    intDefault("WUVO_MAX_SUBAGENTS", 4),
		MaxIterations:   intDefault("WUVO_MAX_ITERATIONS", 24),
	}

	if cfg.BackboardAPIKey == "" {
		return Config{}, fmt.Errorf("missing BACKBOARD_API_KEY")
	}

	return cfg, nil
}

func getenvDefault(key, fallback string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	return v
}

func intDefault(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

func durationDefault(key string, fallback time.Duration) time.Duration {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil || d <= 0 {
		return fallback
	}
	return d
}

func workspaceRoot() string {
	v := strings.TrimSpace(os.Getenv("WUVO_WORKSPACE_ROOT"))
	if v != "" {
		return v
	}
	wd, err := os.Getwd()
	if err != nil {
		return "."
	}
	if filepath.Base(wd) == "be" {
		return filepath.Dir(wd)
	}
	return wd
}

func loadDotEnv(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		k := strings.TrimSpace(parts[0])
		v := strings.TrimSpace(parts[1])
		if _, exists := os.LookupEnv(k); !exists {
			_ = os.Setenv(k, v)
		}
	}
	return scanner.Err()
}
