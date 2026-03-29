import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { WebsocketService } from './services/websocket.service';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ReactiveFormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('frontend');
  messages = signal<any[]>([]);
  messageControl = new FormControl('');

  constructor(private websocketService: WebsocketService) {}

  ngOnInit(): void {
    this.websocketService.connect();

    this.websocketService.messages$.subscribe((message) => {
      console.log('Received message:', message);
      if (message) {
        const currentMessages = this.messages();
        this.messages.set([message, ...currentMessages]);
      }
    });
  }

  ngOnDestroy(): void {
    this.websocketService.disconnect();
  }

  sendMessage(): void {
    const content = this.messageControl.value;
    if (content) {
      const message = {
        content: content.trim(),
        timestamp: new Date().toISOString(),
        randomNumber: Math.floor(Math.random() * 1000) + 1,
      };
      this.websocketService.sendMessage(message);
      this.messageControl.reset();
    }
  }
}
