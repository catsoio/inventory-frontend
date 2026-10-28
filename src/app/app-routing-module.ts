import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { adminGuard, authGuard, garageGuard, mechanicGuard } from './core/auth/auth-guard';
import { Shell } from './core/layout/shell/shell';

const routes: Routes = [
  {
    path: 'login',
    title: 'Logga in',
    loadChildren: () => import('./features/auth/auth-module').then((m) => m.AuthModule),
  },
  {
    // Kundens sida för ett kostnadsförslag: utan inloggning, nyckeln i länken är nyckeln.
    path: 'q/:token',
    loadChildren: () =>
      import('./features/public-quote/public-quote-module').then((m) => m.PublicQuoteModule),
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
    canActivateChild: [mechanicGuard],
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
        path: '',
        loadChildren: () =>
          import('./features/catalog/catalog-module').then((m) => m.CatalogModule),
      },
      {
        path: 'service-types',
        title: 'Åtgärder',
        loadChildren: () =>
          import('./features/service-types/service-types-module').then((m) => m.ServiceTypesModule),
      },
      {
        path: 'quotes',
        title: 'Offert',
        loadChildren: () => import('./features/quotes/quotes-module').then((m) => m.QuotesModule),
      },
      {
        path: 'workorders',
        title: 'Arbetsorder',
        loadChildren: () =>
          import('./features/work-orders/work-orders-module').then((m) => m.WorkOrdersModule),
      },
      {
        path: 'register',
        title: 'Register',
        loadChildren: () =>
          import('./features/register/register-module').then((m) => m.RegisterModule),
      },
      {
        path: 'reports',
        title: 'Lagerlogg',
        loadChildren: () =>
          import('./features/reports/reports-module').then((m) => m.ReportsModule),
      },
      {
        path: 'bookkeeping',
        title: 'Moms och bokföring',
        canActivate: [adminGuard],
        loadChildren: () =>
          import('./features/bookkeeping/bookkeeping-module').then((m) => m.BookkeepingModule),
      },
      {
        path: 'finance',
        title: 'Ekonomi',
        canActivate: [adminGuard],
        loadChildren: () =>
          import('./features/finance/finance-module').then((m) => m.FinanceModule),
      },
      {
        path: 'activity',
        title: 'Aktivitetslogg',
        canActivate: [adminGuard],
        loadChildren: () =>
          import('./features/activity/activity-module').then((m) => m.ActivityModule),
      },
      {
        path: 'sales',
        title: 'Försäljning',
        loadChildren: () => import('./features/sales/sales-module').then((m) => m.SalesModule),
      },
      {
        path: 'purchases',
        title: 'Inköp',
        loadChildren: () => import('./features/trade/trade-module').then((m) => m.TradeModule),
      },
      { path: 'settings', redirectTo: '' },
      { path: 'settings/:section', redirectTo: '' },
    ],
  },
  { path: '**', redirectTo: '' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
