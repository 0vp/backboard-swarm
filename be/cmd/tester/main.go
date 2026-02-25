package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"backboard-swarm/be/internal/config"
	"backboard-swarm/be/internal/tester"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("usage: go run ./cmd/tester \"your task\"")
		os.Exit(1)
	}
	task := strings.TrimSpace(strings.Join(os.Args[1:], " "))

	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	if err := tester.Run(ctx, cfg.ServerURL, task, os.Stdout); err != nil {
		panic(err)
	}
}
