import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private ws: WebSocket | null = null;
  private messageSubject = new BehaviorSubject<any>(null);
  public messages$ = this.messageSubject.asObservable();

  // Default backend URL - you should update this with your actual backend URL
  private backendUrl = 'ws://localhost:8080/ws'; // Update this to match your backend

  connect(): void {
    try {
      this.ws = new WebSocket(this.backendUrl);
      
      this.ws.onopen = () => {
        console.log('WebSocket connection established');
      };

      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        this.messageSubject.next(message);
      };

      this.ws.onclose = () => {
        console.log('WebSocket connection closed');
        // Attempt to reconnect
        setTimeout(() => this.connect(), 3000);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  sendMessage(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected');
    }
  }

  // Method to set the backend URL dynamically
  setBackendUrl(url: string): void {
    this.backendUrl = url;
  }
}
