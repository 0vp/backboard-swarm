package main

import (
	"errors"
	"fmt"
	"net/http"

	"backboard-swarm/be/internal/config"
	"backboard-swarm/be/internal/server"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	srv, err := server.New(cfg)
	if err != nil {
		panic(err)
	}

	fmt.Printf("orchestrator listening on %s\n", cfg.ServerAddr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		panic(err)
	}
}
