package ws

import (
	"encoding/json"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"

	"backboard-swarm/be/internal/types"
)

type Hub struct {
	mu       sync.RWMutex
	clients  map[*websocket.Conn]*clientConn
	upgrader websocket.Upgrader
}

type clientConn struct {
	conn    *websocket.Conn
	writeMu sync.Mutex
}

func NewHub() *Hub {
	return &Hub{
		clients: make(map[*websocket.Conn]*clientConn),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(*http.Request) bool { return true },
		},
	}
}

func (h *Hub) HandleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	h.mu.Lock()
	h.clients[conn] = &clientConn{conn: conn}
	h.mu.Unlock()

	go h.readLoop(conn)
}

func (h *Hub) Emit(evt types.Event) {
	b, err := json.Marshal(evt)
	if err != nil {
		return
	}

	h.mu.RLock()
	clients := make([]*clientConn, 0, len(h.clients))
	for _, c := range h.clients {
		clients = append(clients, c)
	}
	h.mu.RUnlock()

	for _, c := range clients {
		c.writeMu.Lock()
		err := c.conn.WriteMessage(websocket.TextMessage, b)
		c.writeMu.Unlock()
		if err != nil {
			h.remove(c.conn)
		}
	}
}

func (h *Hub) readLoop(conn *websocket.Conn) {
	defer h.remove(conn)
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			return
		}
	}
}

func (h *Hub) remove(conn *websocket.Conn) {
	h.mu.Lock()
	c, ok := h.clients[conn]
	if ok {
		delete(h.clients, conn)
	}
	h.mu.Unlock()

	if ok {
		c.writeMu.Lock()
		_ = c.conn.Close()
		c.writeMu.Unlock()
	}
}
