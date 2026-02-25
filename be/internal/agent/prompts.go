package agent

import (
	"fmt"
	"os"
	"path/filepath"

	"backboard-swarm/be/internal/types"
)

type PromptStore struct {
	byRole map[types.Role]string
}

func LoadPrompts(root string) (PromptStore, error) {
	byRole := map[types.Role]string{}
	files := map[types.Role]string{
		types.RoleOrchestrator: "orchestrator.txt",
		types.RoleResearcher:   "researcher.txt",
		types.RoleFactChecker:  "fact_checker.txt",
		types.RoleCoder:        "coder.txt",
	}
	for role, file := range files {
		b, err := os.ReadFile(filepath.Join(root, "prompts", file))
		if err != nil {
			return PromptStore{}, fmt.Errorf("read prompt %s: %w", file, err)
		}
		byRole[role] = string(b)
	}
	return PromptStore{byRole: byRole}, nil
}

func (p PromptStore) For(role types.Role) string {
	if v, ok := p.byRole[role.Normalize()]; ok {
		return v
	}
	return p.byRole[types.RoleCoder]
}
