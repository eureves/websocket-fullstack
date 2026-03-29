import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, tap } from 'rxjs';

export interface Room {
  name: string;
  userCount: number;
}

export interface WsMessage {
  type: 'join' | 'leave' | 'chat' | 'system' | 'error' | 'user_list' | 'room_list';
  room?: string;
  content?: string;
  userId?: string;
  userCount?: number;
  users?: string[];
  timestamp?: string;
  rooms?: Room[];
}

@Injectable({
  providedIn: 'root',
})
export class WebsocketService {
  private socket: WebSocket | null = null;
  private messagesSubject = new BehaviorSubject<WsMessage | null>(null);
  public messages$ = this.messagesSubject.asObservable();

  private roomsSubject = new BehaviorSubject<Room[]>([]);
  public rooms$ = this.roomsSubject.asObservable();

  private connectionStatusSubject = new BehaviorSubject<string>('Disconnected');
  public connectionStatus$ = this.connectionStatusSubject.asObservable();

  private apiBaseUrl = '';
  private http = inject(HttpClient);

  constructor() {
    this.apiBaseUrl = `http://${window.location.hostname}:8080`;
  }

  connect(room?: string): void {
    const wsUrl = room
      ? `ws://${window.location.hostname}:8080/ws/${room}`
      : `ws://${window.location.hostname}:8080/ws`;

    if (this.socket) {
      this.disconnect();
    }

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.connectionStatusSubject.next('Connected');
        this.fetchRooms();
      };

      this.socket.onmessage = (event) => {
        const message: WsMessage = JSON.parse(event.data);
        this.messagesSubject.next(message);

        if (message.type === 'room_list' && message.rooms) {
          this.roomsSubject.next(message.rooms);
        }
      };

      this.socket.onclose = () => {
        this.connectionStatusSubject.next('Disconnected');
      };

      this.socket.onerror = () => {
        this.connectionStatusSubject.next('Error');
      };
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  sendMessage(message: WsMessage): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected');
    }
  }

  joinRoom(roomName: string): void {
    this.sendMessage({ type: 'join', room: roomName });
  }

  leaveRoom(): void {
    this.sendMessage({ type: 'leave' });
  }

  sendChat(content: string): void {
    this.sendMessage({ type: 'chat', content });
  }

  clearMessages(): void {
    this.messagesSubject.next(null);
  }

  fetchRooms(): void {
    this.http
      .get<{ rooms: Room[] }>(`${this.apiBaseUrl}/rooms`)
      .pipe(
        tap({
          next: (data) => this.roomsSubject.next(data.rooms || []),
          error: (err) => console.error('Failed to fetch rooms:', err),
        }),
      )
      .subscribe();
  }
}
