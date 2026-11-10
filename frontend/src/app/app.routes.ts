import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Tapwave',
    loadComponent: () => import('./pages/song-select/song-select').then((m) => m.SongSelect),
  },
  {
    path: 'play/:id',
    title: 'Tapwave — playing',
    loadComponent: () => import('./pages/play/play').then((m) => m.Play),
  },
  { path: '**', redirectTo: '' },
];
