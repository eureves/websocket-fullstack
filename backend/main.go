package main

import (
	"log"
	"math/rand"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Message struct {
	Content      string `json:"content"`
	Timestamp    string `json:"timestamp"`
	RandomNumber int    `json:"randomNumber"`
}

// Global map to store all active connections
var (
	connections = make(map[*websocket.Conn]bool)
	connMutex   = sync.RWMutex{}
)

func main() {
	r := gin.Default()

	r.GET("/", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"message": "WebSocket server is running",
		})
	})

	r.GET("/ws", func(c *gin.Context) {
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Print("upgrade error:", err)
			return
		}

		// Add connection to the map
		connMutex.Lock()
		connections[conn] = true
		connMutex.Unlock()

		defer func() {
			// Remove connection from the map when done
			connMutex.Lock()
			delete(connections, conn)
			connMutex.Unlock()
			conn.Close()
		}()

		for {
			var msg Message
			err := conn.ReadJSON(&msg)
			if err != nil {
				log.Println("read error:", err)
				break
			}

			log.Printf("Received: %s", msg.Content)

			// Add timestamp to the message and random number
			msg.Timestamp = time.Now().Format(time.RFC3339)
			msg.RandomNumber = rand.Intn(1000) + 1 // Generate random number between 1-1000

			// Broadcast the message to all connected clients
			broadcastMessage(msg)
		}
	})

	r.Run(":8080")
}

// broadcastMessage sends a message to all connected clients
func broadcastMessage(msg Message) {
	connMutex.RLock()
	defer connMutex.RUnlock()

	for conn := range connections {
		err := conn.WriteJSON(msg)
		if err != nil {
			log.Println("write error:", err)
			// Remove broken connection
			conn.Close()
			connMutex.Lock()
			delete(connections, conn)
			connMutex.Unlock()
		}
	}
}
