package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"backboard-swarm/be/internal/config"
	"backboard-swarm/be/internal/server"
	"backboard-swarm/be/internal/tester"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	if len(os.Args) >= 2 && strings.EqualFold(os.Args[1], "serve") {
		runServer(cfg)
		return
	}

	if len(os.Args) < 2 {
		fmt.Println("usage:\n  go run main.go serve\n  go run main.go \"do this task\"")
		os.Exit(1)
	}

	task := strings.TrimSpace(strings.Join(os.Args[1:], " "))
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	err = tester.Run(ctx, cfg.ServerURL, task, os.Stdout)
	if err == nil {
		return
	}

	srv, createErr := server.New(cfg)
	if createErr != nil {
		panic(err)
	}

	go func() {
		serveErr := srv.ListenAndServe()
		if serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			fmt.Fprintf(os.Stderr, "server error: %v\n", serveErr)
		}
	}()
	time.Sleep(700 * time.Millisecond)

	if retryErr := tester.Run(ctx, cfg.ServerURL, task, os.Stdout); retryErr != nil {
		_ = srv.Shutdown(context.Background())
		panic(retryErr)
	}
	_ = srv.Shutdown(context.Background())
}

func runServer(cfg config.Config) {
	srv, err := server.New(cfg)
	if err != nil {
		panic(err)
	}
	fmt.Printf("orchestrator listening on %s\n", cfg.ServerAddr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		panic(err)
	}
}
