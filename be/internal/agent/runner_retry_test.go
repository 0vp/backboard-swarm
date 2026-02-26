package agent

import "testing"

func TestIsRetryableSubmit(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{name: "retryable 503", err: errString("backboard request failed (503): temporary"), want: true},
		{name: "retryable 429", err: errString("backboard request failed (429): rate limit"), want: true},
		{name: "not retryable timeout", err: errString("timeout awaiting response"), want: false},
		{name: "not retryable eof", err: errString("eof"), want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isRetryableSubmit(tt.err)
			if got != tt.want {
				t.Fatalf("isRetryableSubmit() = %v, want %v", got, tt.want)
			}
		})
	}
}

type errString string

func (e errString) Error() string { return string(e) }
