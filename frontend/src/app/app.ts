import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { WebsocketService } from './services/websocket.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('frontend');
  messages = signal<any[]>([]);

  constructor(private websocketService: WebsocketService) {}

  ngOnInit(): void {
    // Connect to WebSocket server
    this.websocketService.connect();
    
    // Subscribe to messages
    this.websocketService.messages$.subscribe(message => {
      console.log('Received message:', message);
      if (message) {
        // Add the new message to the beginning of the array to show most recent first
        const currentMessages = this.messages();
        this.messages.set([message, ...currentMessages]);
      }
    });
  }

  ngOnDestroy(): void {
    // Disconnect when component is destroyed
    this.websocketService.disconnect();
  }

  sendMessage(): void {
    const message = {
      content: 'Hello from Angular frontend',
      timestamp: new Date().toISOString(),
      randomNumber: Math.floor(Math.random() * 1000) + 1 // Add random number to each message
    };
    this.websocketService.sendMessage(message);
  }
}
