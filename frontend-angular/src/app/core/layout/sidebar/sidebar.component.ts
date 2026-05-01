import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { RouterModule } from '@angular/router';

import { MenuService } from '../../services/menu.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  @Input({ required: true }) collapsed = false;
  @Output() readonly closeSidebar = new EventEmitter<void>();

  private readonly menuService = inject(MenuService);

  get menu() {
    return this.menuService.getMenu();
  }

  close(): void {
    this.closeSidebar.emit();
  }
}
