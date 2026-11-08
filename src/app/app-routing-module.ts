import { NgModule, inject } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {
  adminGuard,
  authGuard,
  garageGuard,
  guestGuard,
  mechanicGuard,
  moduleGuard,
  noGarageGuard,
} from './core/auth/auth-guard';
import { Billing } from './core/billing/billing';
import { Nav } from './core/layout/nav';
import { Shell } from './core/layout/shell/shell';

const routes: Routes = [
  {
    path: 'login',
    title: 'Logga in',
    canActivate: [guestGuard],
    loadChildren: () => import('./features/auth/auth-module').then((m) => m.AuthModule),
  },
  {
    // Kundens sida för ett kostnadsförslag: utan inloggning, nyckeln i länken är nyckeln.
    path: 'q/:token',
    loadChildren: () =>
      import('./features/public-quote/public-quote-module').then((m) => m.PublicQuoteModule),
  },
  {
    // Skärmen i verkstadens hall: utan inloggning, nyckeln i länken är nyckeln.
    path: 's/:token',
    loadChildren: () =>
      import('./features/screen/workshop-screen-module').then((m) => m.WorkshopScreenModule),
  },
  {
    // Kundens sida för en faktura eller ett kvitto: utan inloggning, nyckeln i länken är nyckeln.
    path: 'i/:token',
    loadChildren: () =>
      import('./features/public-document/public-document-module').then(
        (m) => m.PublicDocumentModule,
      ),
  },
  {
    path: 'onboarding',
    title: 'Kom igång',
    canActivate: [authGuard, noGarageGuard],
    loadChildren: () =>
      import('./features/onboarding/onboarding-module').then((m) => m.OnboardingModule),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard, garageGuard],
    canActivateChild: [mechanicGuard],
    children: [
      {
        // Startsidan är den i produkten man senast arbetade i (Hall bara när garaget har bilhandel).
        path: '',
        pathMatch: 'full',
        redirectTo: () =>
          inject(Nav).product() === 'hall' && inject(Billing).allows('bilhandel')
            ? '/dealership'
            : '/dashboard',
      },
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
        canActivate: [moduleGuard('dackhotell')],
        title: 'Däckhotell',
        loadChildren: () =>
          import('./features/storage/storage-module').then((m) => m.StorageModule),
      },
      {
        path: 'bookings',
        canActivate: [moduleGuard('tidsbokning')],
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
        canActivate: [moduleGuard('arbetsorder')],
        title: 'Offert',
        loadChildren: () => import('./features/quotes/quotes-module').then((m) => m.QuotesModule),
      },
      {
        path: 'workorders',
        canActivate: [moduleGuard('arbetsorder')],
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
        canActivate: [adminGuard, moduleGuard('bokforing')],
        loadChildren: () =>
          import('./features/bookkeeping/bookkeeping-module').then((m) => m.BookkeepingModule),
      },
      {
        path: 'finance',
        title: 'Ekonomi',
        canActivate: [adminGuard, moduleGuard('bokforing')],
        loadChildren: () =>
          import('./features/finance/finance-module').then((m) => m.FinanceModule),
      },
      {
        path: 'dealership',
        canActivate: [moduleGuard('bilhandel')],
        title: 'Bilhandel',
        loadChildren: () =>
          import('./features/dealership/dealership-module').then((m) => m.DealershipModule),
      },
      {
        path: 'online-booking',
        title: 'Onlinebokning',
        canActivate: [adminGuard, moduleGuard('onlinebokning')],
        loadChildren: () =>
          import('./features/online-booking/online-booking-module').then(
            (m) => m.OnlineBookingModule,
          ),
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
