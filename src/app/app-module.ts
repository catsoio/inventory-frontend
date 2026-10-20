import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeEnGb from '@angular/common/locales/en-GB';
import localeSv from '@angular/common/locales/sv';
import { LOCALE_ID, NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { TitleStrategy } from '@angular/router';
import { BrowserModule } from '@angular/platform-browser';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { App } from './app';
import { AppRoutingModule } from './app-routing-module';
import { BillingBanner } from './core/billing/billing-banner';
import { PlansDialog } from './core/billing/plans-dialog';
import { Shell } from './core/layout/shell/shell';
import { AppTitleStrategy } from './core/page-title';
import { appIdInterceptor } from './core/http/app-id-interceptor';
import { authTokenInterceptor } from './core/http/auth-token-interceptor';
import { envelopeInterceptor } from './core/http/envelope-interceptor';
import { errorInterceptor } from './core/http/error-interceptor';
import { garageHeaderInterceptor } from './core/http/garage-header-interceptor';
import { appLocale } from './core/i18n/locale';
import { SharedModule } from './shared/shared-module';

registerLocaleData(localeSv);
registerLocaleData(localeEnGb);

@NgModule({
  declarations: [App, Shell, BillingBanner, PlansDialog],
  imports: [BrowserModule, AppRoutingModule, SharedModule],
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    // Språket läses vid start; byts språk laddas appen om (se I18n.set).
    { provide: LOCALE_ID, useFactory: appLocale },
    { provide: MAT_DATE_LOCALE, useFactory: appLocale },
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline' } },
    // Ordning: svar passerar authToken (refresh/retry) -> error (mappning) -> envelope (uppackning).
    provideHttpClient(
      withInterceptors([
        appIdInterceptor,
        garageHeaderInterceptor,
        envelopeInterceptor,
        errorInterceptor,
        authTokenInterceptor,
      ]),
    ),
  ],
  bootstrap: [App],
})
export class AppModule {}
