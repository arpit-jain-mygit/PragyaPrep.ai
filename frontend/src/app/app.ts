import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BusyCursor } from './ui/busy-cursor';

@Component({
  imports: [RouterOutlet, BusyCursor],
  selector: 'app-root',
  template: '<router-outlet /><app-busy-cursor />',
})
export class App {}
