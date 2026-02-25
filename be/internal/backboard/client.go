package backboard

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	baseURL string
	apiKey  string
	http    *http.Client
}

func NewClient(baseURL, apiKey string, timeout time.Duration) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  apiKey,
		http: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *Client) CreateAssistant(ctx context.Context, req CreateAssistantRequest) (Assistant, error) {
	var out Assistant
	if err := c.doJSON(ctx, http.MethodPost, "/assistants", req, &out); err != nil {
		return Assistant{}, err
	}
	return out, nil
}

func (c *Client) CreateThread(ctx context.Context, assistantID string) (Thread, error) {
	var out Thread
	urlPath := path.Join("/assistants", assistantID, "threads")
	if err := c.doJSON(ctx, http.MethodPost, urlPath, map[string]any{}, &out); err != nil {
		return Thread{}, err
	}
	return out, nil
}

func (c *Client) AddMessage(ctx context.Context, req AddMessageRequest) (MessageResponse, error) {
	urlPath := path.Join("/threads", req.ThreadID, "messages")

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writeField(writer, "content", req.Content)
	writeField(writer, "llm_provider", req.LLMProvider)
	writeField(writer, "model_name", req.ModelName)
	writeField(writer, "memory", req.Memory)
	writeField(writer, "web_search", req.WebSearch)
	writeField(writer, "send_to_llm", defaultString(req.SendToLLM, "true"))
	writeField(writer, "stream", strconv.FormatBool(req.Stream))
	if req.MetadataJSON != "" {
		writeField(writer, "metadata", req.MetadataJSON)
	}
	if err := writer.Close(); err != nil {
		return MessageResponse{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+urlPath, body)
	if err != nil {
		return MessageResponse{}, err
	}
	httpReq.Header.Set("X-API-Key", c.apiKey)
	httpReq.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return MessageResponse{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return MessageResponse{}, fmt.Errorf("backboard add_message failed (%d): %s", resp.StatusCode, string(b))
	}

	var out MessageResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return MessageResponse{}, err
	}
	return out, nil
}

func (c *Client) SubmitToolOutputs(ctx context.Context, threadID, runID string, outputs []ToolOutput) (MessageResponse, error) {
	urlPath := path.Join("/threads", threadID, "runs", runID, "submit-tool-outputs")
	var out MessageResponse
	req := SubmitToolOutputsRequest{ToolOutputs: outputs}
	if err := c.doJSON(ctx, http.MethodPost, urlPath, req, &out); err != nil {
		return MessageResponse{}, err
	}
	return out, nil
}

func (c *Client) doJSON(ctx context.Context, method, urlPath string, in any, out any) error {
	body, err := json.Marshal(in)
	if err != nil {
		return err
	}

	httpReq, err := http.NewRequestWithContext(ctx, method, c.baseURL+urlPath, bytes.NewReader(body))
	if err != nil {
		return err
	}
	httpReq.Header.Set("X-API-Key", c.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("backboard request %s %s failed (%d): %s", method, urlPath, resp.StatusCode, string(b))
	}

	if out == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func writeField(w *multipart.Writer, key, value string) {
	if strings.TrimSpace(value) == "" {
		return
	}
	_ = w.WriteField(key, value)
}

func defaultString(v, fallback string) string {
	if strings.TrimSpace(v) == "" {
		return fallback
	}
	return v
}
