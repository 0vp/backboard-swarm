package backboard

import "encoding/json"

const (
	StatusInProgress     = "IN_PROGRESS"
	StatusRequiresAction = "REQUIRES_ACTION"
	StatusCompleted      = "COMPLETED"
	StatusFailed         = "FAILED"
	StatusCancelled      = "CANCELLED"
)

type ToolDefinition struct {
	Type     string             `json:"type"`
	Function FunctionDefinition `json:"function"`
}

type FunctionDefinition struct {
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	Parameters  map[string]any `json:"parameters"`
}

type CreateAssistantRequest struct {
	Name         string           `json:"name"`
	SystemPrompt string           `json:"system_prompt,omitempty"`
	Description  string           `json:"description,omitempty"`
	Tools        []ToolDefinition `json:"tools,omitempty"`
}

type Assistant struct {
	AssistantID string `json:"assistant_id"`
	Name        string `json:"name"`
}

type Thread struct {
	ThreadID string `json:"thread_id"`
}

type AddMessageRequest struct {
	ThreadID     string
	Content      string
	LLMProvider  string
	ModelName    string
	Memory       string
	WebSearch    string
	SendToLLM    string
	Stream       bool
	MetadataJSON string
}

type ToolCall struct {
	ID       string           `json:"id"`
	Type     string           `json:"type"`
	Function ToolCallFunction `json:"function"`
}

type ToolCallFunction struct {
	Name            string          `json:"name"`
	Arguments       string          `json:"arguments"`
	ParsedArguments json.RawMessage `json:"parsed_arguments"`
}

func (tc ToolCall) ArgumentsMap() (map[string]any, error) {
	if len(tc.Function.ParsedArguments) > 0 && string(tc.Function.ParsedArguments) != "null" {
		var parsed map[string]any
		if err := json.Unmarshal(tc.Function.ParsedArguments, &parsed); err != nil {
			return nil, err
		}
		return parsed, nil
	}
	if tc.Function.Arguments == "" {
		return map[string]any{}, nil
	}
	var parsed map[string]any
	if err := json.Unmarshal([]byte(tc.Function.Arguments), &parsed); err != nil {
		return nil, err
	}
	return parsed, nil
}

type MessageResponse struct {
	Message   string     `json:"message"`
	ThreadID  string     `json:"thread_id"`
	RunID     string     `json:"run_id"`
	MessageID string     `json:"message_id"`
	Content   string     `json:"content"`
	Role      string     `json:"role"`
	Status    string     `json:"status"`
	ToolCalls []ToolCall `json:"tool_calls"`
}

type ToolOutput struct {
	ToolCallID string `json:"tool_call_id"`
	Output     string `json:"output"`
}

type SubmitToolOutputsRequest struct {
	ToolOutputs []ToolOutput `json:"tool_outputs"`
}
