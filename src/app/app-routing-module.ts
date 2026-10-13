import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { adminGuard, authGuard, garageGuard } from './core/auth/auth-guard';
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
        title: 'Hem',
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
        path: 'bookings',
        title: 'Tidsbokning',
        loadChildren: () =>
          import('./features/bookings/bookings-module').then((m) => m.BookingsModule),
      },
      {
        path: 'customers',
        title: 'Kunder',
        loadChildren: () =>
          import('./features/customers/customers-module').then((m) => m.CustomersModule),
      },
      {
        path: 'suppliers',
        title: 'Leverantörer',
        loadChildren: () =>
          import('./features/suppliers/suppliers-module').then((m) => m.SuppliersModule),
      },
      {
        path: 'vehicles',
        title: 'Bilar',
        loadChildren: () =>
          import('./features/vehicles/vehicles-module').then((m) => m.VehiclesModule),
      },
      {
        path: 'resources',
        title: 'Mekaniker och platser',
        loadChildren: () =>
          import('./features/resources/resources-module').then((m) => m.ResourcesModule),
      },
      {
        path: 'service-types',
        title: 'Åtgärder',
        loadChildren: () =>
          import('./features/service-types/service-types-module').then((m) => m.ServiceTypesModule),
      },
      {
        path: 'workorders',
        title: 'Arbetsorder',
        loadChildren: () =>
          import('./features/work-orders/work-orders-module').then((m) => m.WorkOrdersModule),
      },
      {
        path: 'reports',
        title: 'Logg och rapport',
        loadChildren: () =>
          import('./features/reports/reports-module').then((m) => m.ReportsModule),
      },
      {
        path: 'bookkeeping',
        title: 'Bokföring',
        canActivate: [adminGuard],
        loadChildren: () =>
          import('./features/bookkeeping/bookkeeping-module').then((m) => m.BookkeepingModule),
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
      { path: 'settings', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: '' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
