package agent

import (
	"strings"
	"testing"
	"time"
)

func TestWithRuntimePromptVarsReplacesTodayDate(t *testing.T) {
	out := withRuntimePromptVars("Today's date: {{TODAY_DATE}}")
	if strings.Contains(out, "{{TODAY_DATE}}") {
		t.Fatalf("expected placeholder replacement, got %q", out)
	}
	today := time.Now().Format("2006-01-02")
	if !strings.Contains(out, today) {
		t.Fatalf("expected current date %s in %q", today, out)
	}
}
