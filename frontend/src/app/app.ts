import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { setupNative } from './core/native';
import { BusyCursor } from './ui/busy-cursor';

@Component({
  imports: [RouterOutlet, BusyCursor],
  selector: 'app-root',
  template: '<router-outlet /><app-busy-cursor />',
})
export class App implements OnInit {
  /** In the Android app, make the phone's back button work. Does nothing in a browser. */
  ngOnInit(): void {
    void setupNative();
  }
}
