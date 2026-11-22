import { ClientErrorHandler } from './client-error-handler';
import { ErrorHandler, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { NavbarComponent } from './sharepage/navbar/navbar.component';
import { FooterComponent } from './sharepage/footer/footer.component';
import { HomeComponent } from './pages/home/home.component';
import { LoginComponent } from './pages/login/login.component';
import { MenuComponent } from './pages/menu/menu.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi, withXhr } from '@angular/common/http';
import { AuthInterceptor } from './auth.interceptor';
import { AuthenticationGuard } from './guard/authentication.guard';
import { AuthenticationService } from './services/authethication.service';
import { NotFoundComponent } from './pages/not-found/not-found.component';
import { TranslatePipe } from './i18n/translate.pipe';

import { ProfileQuickViewComponent } from './shared/profile-quick-view.component';
import { PageNoticePopupComponent } from './shared/page-notice-popup.component';
import { VenueSportsBadgesComponent } from './shared/venue-sports-badges/venue-sports-badges.component';
import { LegalPageComponent } from './pages/legal-page/legal-page.component';
import { JynloSelectComponent } from './shared/jynlo-select/jynlo-select.component';
import { SportNamePipe } from './i18n/sport-name.pipe';

@NgModule({ declarations: [
        AppComponent,
        NavbarComponent,
        FooterComponent,
        HomeComponent,
        LoginComponent,
        MenuComponent,
        NotFoundComponent,

        LegalPageComponent
    ],
    bootstrap: [AppComponent], imports: [SportNamePipe, BrowserModule,
        AppRoutingModule,
        FormsModule,
        ReactiveFormsModule,
        TranslatePipe,
    JynloSelectComponent,
    VenueSportsBadgesComponent,
        ProfileQuickViewComponent,
        PageNoticePopupComponent,
        VenueSportsBadgesComponent], providers: [AuthenticationGuard, AuthenticationService, { provide: ErrorHandler, useClass: ClientErrorHandler }, { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }, provideHttpClient(withXhr(), withInterceptorsFromDi())] })
export class AppModule { }
