package main

import (
	"fmt"
	"log"
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

type MessageType string

const (
	TypeJoin     MessageType = "join"
	TypeLeave    MessageType = "leave"
	TypeChat     MessageType = "chat"
	TypeSystem   MessageType = "system"
	TypeError    MessageType = "error"
	TypeUserList MessageType = "user_list"
	TypeRoomList MessageType = "room_list"
)

type Message struct {
	Type         MessageType `json:"type"`
	Room         string      `json:"room,omitempty"`
	Content      string      `json:"content,omitempty"`
	UserID       string      `json:"userId,omitempty"`
	UserCount    int         `json:"userCount,omitempty"`
	Users        []string    `json:"users,omitempty"`
	Timestamp    string      `json:"timestamp,omitempty"`
	RandomNumber int         `json:"randomNumber,omitempty"`
	Rooms        []gin.H     `json:"rooms,omitempty"`
}

type Client struct {
	ID   string
	Conn *websocket.Conn
	Room string
}

type Room struct {
	Name    string
	Clients map[*Client]bool
	Mutex   sync.RWMutex
}

var (
	rooms        = make(map[string]*Room)
	roomsMutex   = sync.RWMutex{}
	clients      = make(map[*websocket.Conn]*Client)
	clientsMutex sync.RWMutex
)

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

func main() {
	r := gin.Default()

	r.Use(corsMiddleware())

	r.GET("/", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"message": "WebSocket server is running",
		})
	})

	r.GET("/ws", handleWebSocket)
	r.GET("/ws/:room", handleWebSocketWithRoom)

	r.GET("/rooms", listRooms)
	r.GET("/rooms/:room/users", listRoomUsers)

	r.Run(":8080")
}

func handleWebSocket(c *gin.Context) {
	handleWSConnection(c.Writer, c.Request, "")
}

func handleWebSocketWithRoom(c *gin.Context) {
	room := c.Param("room")
	handleWSConnection(c.Writer, c.Request, room)
}

func handleWSConnection(w http.ResponseWriter, r *http.Request, defaultRoom string) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Print("upgrade error:", err)
		return
	}

	userID := r.URL.Query().Get("userId")
	if userID == "" {
		userID = generateUserID()
	}

	client := &Client{
		ID:   userID,
		Conn: conn,
		Room: defaultRoom,
	}

	clientsMutex.Lock()
	clients[conn] = client
	clientsMutex.Unlock()

	if defaultRoom != "" {
		joinRoom(client, defaultRoom)
	}

	defer func() {
		if client.Room != "" {
			leaveRoom(client)
		}
		clientsMutex.Lock()
		delete(clients, conn)
		clientsMutex.Unlock()
		conn.Close()
	}()

	for {
		var msg Message
		err := conn.ReadJSON(&msg)
		if err != nil {
			log.Println("read error:", err)
			break
		}

		msg.UserID = client.ID
		handleMessage(client, msg)
	}
}

func handleMessage(client *Client, msg Message) {
	switch msg.Type {
	case TypeJoin:
		if msg.Room != "" {
			joinRoom(client, msg.Room)
		}

	case TypeLeave:
		if client.Room != "" {
			leaveRoom(client)
		}

	case TypeChat:
		if client.Room != "" && msg.Content != "" {
			msg.Timestamp = time.Now().Format(time.DateTime)
			fmt.Println(msg)
			broadcastToRoom(client.Room, msg, client)
			sendToClient(client, msg)
		}

	default:
		sendToClient(client, Message{
			Type:      TypeError,
			Content:   "Unknown message type",
			Timestamp: time.Now().Format(time.DateTime),
		})
	}
}

func joinRoom(client *Client, roomName string) {
	if client.Room != "" && client.Room != roomName {
		leaveRoom(client)
	}

	roomsMutex.Lock()
	room, exists := rooms[roomName]
	wasNewRoom := !exists
	if !exists {
		room = &Room{
			Name:    roomName,
			Clients: make(map[*Client]bool),
		}
		rooms[roomName] = room
	}
	roomsMutex.Unlock()

	room.Mutex.Lock()
	room.Clients[client] = true
	room.Mutex.Unlock()

	client.Room = roomName

	if wasNewRoom {
		broadcastRoomList()
	}

	broadcastToRoom(roomName, Message{
		Type:      TypeSystem,
		Content:   client.ID + " joined the room",
		UserCount: getRoomUserCount(roomName),
		Timestamp: time.Now().Format(time.RFC3339),
	}, nil)

	broadcastUserList(roomName)

	sendToClient(client, Message{
		Type:      TypeJoin,
		Room:      roomName,
		Content:   "Successfully joined room",
		UserCount: getRoomUserCount(roomName),
		Users:     getRoomUsers(roomName),
		Timestamp: time.Now().Format(time.RFC3339),
	})

	log.Printf("User %s joined room %s", client.ID, roomName)
}

func leaveRoom(client *Client) {
	roomName := client.Room
	if roomName == "" {
		return
	}

	roomsMutex.RLock()
	room, exists := rooms[roomName]
	roomsMutex.RUnlock()

	if !exists {
		return
	}

	room.Mutex.Lock()
	delete(room.Clients, client)
	userCount := len(room.Clients)
	room.Mutex.Unlock()

	client.Room = ""

	broadcastToRoom(roomName, Message{
		Type:      TypeSystem,
		Content:   client.ID + " left the room",
		UserCount: userCount,
		Timestamp: time.Now().Format(time.RFC3339),
	}, nil)

	if userCount > 0 {
		broadcastUserList(roomName)
	}

	if userCount == 0 {
		roomsMutex.Lock()
		delete(rooms, roomName)
		roomsMutex.Unlock()
		broadcastRoomList()
	}

	log.Printf("User %s left room %s", client.ID, roomName)
}

func broadcastToRoom(roomName string, msg Message, exclude *Client) {
	roomsMutex.RLock()
	room, exists := rooms[roomName]
	roomsMutex.RUnlock()

	if !exists {
		return
	}

	room.Mutex.RLock()
	defer room.Mutex.RUnlock()

	for client := range room.Clients {
		if client != exclude {
			sendToClient(client, msg)
		}
	}
}

func broadcastRoomList() {
	roomsMutex.RLock()
	defer roomsMutex.RUnlock()

	roomList := make([]gin.H, 0, len(rooms))
	for name, room := range rooms {
		room.Mutex.RLock()
		userCount := len(room.Clients)
		room.Mutex.RUnlock()
		roomList = append(roomList, gin.H{
			"name":      name,
			"userCount": userCount,
		})
	}

	msg := Message{
		Type:  TypeRoomList,
		Rooms: roomList,
	}

	clientsMutex.RLock()
	defer clientsMutex.RUnlock()

	for _, client := range clients {
		sendToClient(client, msg)
	}
}

func broadcastUserList(roomName string) {
	roomsMutex.RLock()
	_, exists := rooms[roomName]
	roomsMutex.RUnlock()

	if !exists {
		return
	}

	msg := Message{
		Type:  TypeUserList,
		Users: getRoomUsers(roomName),
	}

	broadcastToRoom(roomName, msg, nil)
}

func sendToClient(client *Client, msg Message) {
	err := client.Conn.WriteJSON(msg)
	if err != nil {
		log.Println("write error:", err)
	}
}

func getRoomUserCount(roomName string) int {
	roomsMutex.RLock()
	room, exists := rooms[roomName]
	roomsMutex.RUnlock()

	if !exists {
		return 0
	}

	room.Mutex.RLock()
	defer room.Mutex.RUnlock()
	return len(room.Clients)
}

func getRoomUsers(roomName string) []string {
	roomsMutex.RLock()
	room, exists := rooms[roomName]
	roomsMutex.RUnlock()

	if !exists {
		return []string{}
	}

	room.Mutex.RLock()
	defer room.Mutex.RUnlock()

	users := make([]string, 0, len(room.Clients))
	for client := range room.Clients {
		users = append(users, client.ID)
	}
	return users
}

func listRooms(c *gin.Context) {
	roomsMutex.RLock()
	defer roomsMutex.RUnlock()

	roomList := make([]gin.H, 0, len(rooms))
	for name, room := range rooms {
		room.Mutex.RLock()
		userCount := len(room.Clients)
		room.Mutex.RUnlock()
		roomList = append(roomList, gin.H{
			"name":      name,
			"userCount": userCount,
		})
	}

	c.JSON(200, gin.H{
		"rooms": roomList,
	})
}

func listRoomUsers(c *gin.Context) {
	roomName := c.Param("room")

	roomsMutex.RLock()
	_, exists := rooms[roomName]
	roomsMutex.RUnlock()

	if !exists {
		c.JSON(404, gin.H{
			"error": "Room not found",
		})
		return
	}

	c.JSON(200, gin.H{
		"room":  roomName,
		"users": getRoomUsers(roomName),
		"count": getRoomUserCount(roomName),
	})
}

func generateUserID() string {
	return "user-" + time.Now().Format("150405.000000000")
}
