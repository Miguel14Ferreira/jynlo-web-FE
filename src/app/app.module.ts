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
import { CreateaccountComponent } from './pages/createaccount/createaccount.component';
import { ChangepasswordComponent } from './pages/changepassword/changepassword.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ContactComponent } from './pages/contact/contact.component';
import { ForgotpComponent } from './pages/forgotp/forgotp.component';
import { AuthInterceptor } from './auth.interceptor';
import { AuthenticationGuard } from './guard/authentication.guard';
import { AuthenticationService } from './services/authethication.service';
import { AboutComponent } from './pages/about/about.component';
import { Forgotp2Component } from './pages/forgotp2/forgotp2.component';
import { ConfirmTokenRegistrationComponent } from './pages/confirm-token-registration/confirm-token-registration.component';
import { PerfilDataComponent } from './pages/perfil-data/perfil-data.component';
import { LoginMFAComponent } from './pages/login-mfa/login-mfa.component';
import { GoogleOnboardingComponent } from './pages/google-onboarding/google-onboarding.component';
import { NotFoundComponent } from './pages/not-found/not-found.component';
import { TranslatePipe } from './i18n/translate.pipe';

import { ProfileQuickViewComponent } from './shared/profile-quick-view.component';
import { VenueSportsBadgesComponent } from './shared/venue-sports-badges/venue-sports-badges.component';
import { LegalPageComponent } from './pages/legal-page/legal-page.component';
import { JynloSelectComponent } from './shared/jynlo-select/jynlo-select.component';

@NgModule({ declarations: [
        AppComponent,
        AboutComponent,
        NavbarComponent,
        FooterComponent,
        HomeComponent,
        LoginComponent,
        MenuComponent,
        LoginMFAComponent,
        CreateaccountComponent,

        ChangepasswordComponent,
        ContactComponent,
        ForgotpComponent,
        PerfilDataComponent,
        Forgotp2Component,
        ConfirmTokenRegistrationComponent,
        GoogleOnboardingComponent,
        NotFoundComponent,

        LegalPageComponent
    ],
    bootstrap: [AppComponent], imports: [BrowserModule,
        AppRoutingModule,
        FormsModule,
        ReactiveFormsModule,
        BrowserAnimationsModule,
        TranslatePipe,
    JynloSelectComponent,
    VenueSportsBadgesComponent,
        ProfileQuickViewComponent,
        VenueSportsBadgesComponent], providers: [AuthenticationGuard, AuthenticationService, { provide: ErrorHandler, useClass: ClientErrorHandler }, { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }, provideHttpClient(withXhr(), withInterceptorsFromDi())] })
export class AppModule { }
