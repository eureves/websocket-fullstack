import { Injectable, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';

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
        console.log('WebSocket connected');
        this.fetchRooms();
      };

      this.socket.onmessage = (event) => {
        const message: WsMessage = JSON.parse(event.data);
        console.log('WS received:', message);
        this.messagesSubject.next(message);

        if (message.type === 'room_list' || message.type === 'user_list') {
          this.fetchRooms();
        }
      };

      this.socket.onclose = () => {
        console.log('WebSocket disconnected');
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
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

  fetchRooms(): void {
    console.log('HEEEEEEELOOOOOOOOO');
    console.log(this.apiBaseUrl);

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
