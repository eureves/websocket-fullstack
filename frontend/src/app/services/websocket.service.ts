import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class WebsocketService {
  private socket: WebSocket | null = null;
  private messagesSubject = new BehaviorSubject<any>(null);
  public messages$ = this.messagesSubject.asObservable();

  constructor() {}

  connect(): void {
    // Connect to your WebSocket server
    // Replace with your actual WebSocket server URL
    const wsUrl = `ws://${location.hostname}:8080/ws`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('WebSocket connected');
      };

      this.socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        this.messagesSubject.next(message);
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

  sendMessage(message: any): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected');
    }
  }
}
