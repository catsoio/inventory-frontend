import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { authGuard, garageGuard } from './core/auth/auth-guard';
import { Shell } from './core/layout/shell/shell';

const routes: Routes = [
  {
    path: 'login',
    title: 'Logga in',
    loadChildren: () => import('./features/auth/auth-module').then((m) => m.AuthModule),
  },
  {
    path: 'onboarding',
    title: 'Kom igång',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/onboarding/onboarding-module').then((m) => m.OnboardingModule),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard, garageGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Översikt',
        loadChildren: () =>
          import('./features/dashboard/dashboard-module').then((m) => m.DashboardModule),
      },
      {
        path: 'inventory',
        title: 'Artiklar',
        loadChildren: () =>
          import('./features/inventory/inventory-module').then((m) => m.InventoryModule),
      },
      {
        path: 'storage',
        title: 'Däckhotell',
        loadChildren: () =>
          import('./features/storage/storage-module').then((m) => m.StorageModule),
      },
      {
        path: 'reports',
        title: 'Logg och rapport',
        loadChildren: () =>
          import('./features/reports/reports-module').then((m) => m.ReportsModule),
      },
      {
        path: 'sales',
        title: 'Sälj',
        data: { mode: 'sell' },
        loadChildren: () => import('./features/trade/trade-module').then((m) => m.TradeModule),
      },
      {
        path: 'purchases',
        title: 'Inköp',
        data: { mode: 'receive' },
        loadChildren: () => import('./features/trade/trade-module').then((m) => m.TradeModule),
      },
      {
        path: 'settings',
        title: 'Inställningar',
        loadChildren: () =>
          import('./features/settings/settings-module').then((m) => m.SettingsModule),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
