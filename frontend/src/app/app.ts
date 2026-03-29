import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { WebsocketService, Room, WsMessage } from './services/websocket.service';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('WebSocket Rooms');

  messages = signal<WsMessage[]>([]);
  rooms = signal<Room[]>([]);
  currentRoom = signal<string | null>(null);
  users = signal<string[]>([]);
  messageControl = new FormControl('');
  roomNameControl = new FormControl('');

  connectionStatus = signal<string>('Disconnected');

  constructor(private websocketService: WebsocketService) {}

  ngOnInit(): void {
    this.websocketService.rooms$.subscribe((rooms) => {
      this.rooms.set(rooms);
    });

    this.websocketService.messages$.subscribe((message: WsMessage | null) => {
      if (message) {
        const currentMessages = this.messages();
        this.messages.set([message, ...currentMessages]);

        if (message.type === 'join' && message.room) {
          this.currentRoom.set(message.room);
          this.users.set(message.users || []);
        }

        if (message.type === 'user_list' && message.users) {
          this.users.set(message.users);
        }

        if (message.type === 'system' && message.userCount !== undefined) {
          this.websocketService.fetchRooms();
        }
      }
    });

    this.websocketService.connect();
    this.connectionStatus.set('Connected');
  }

  ngOnDestroy(): void {
    this.websocketService.disconnect();
  }

  createAndJoinRoom(): void {
    const roomName = this.roomNameControl.value?.trim();
    if (roomName) {
      this.websocketService.connect(roomName);
      this.roomNameControl.reset();
    }
  }

  joinRoom(roomName: string): void {
    this.websocketService.connect(roomName);
  }

  leaveRoom(): void {
    this.websocketService.leaveRoom();
    this.currentRoom.set(null);
    this.users.set([]);
    this.websocketService.connect();
  }

  sendMessage(): void {
    const content = this.messageControl.value;
    if (content) {
      this.websocketService.sendChat(content.trim());
      this.messageControl.reset();
    }
  }
}
