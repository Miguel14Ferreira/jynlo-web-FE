import { NgModule } from '@angular/core';
import { CanActivateFn, Router, RouterModule, Routes } from '@angular/router';
import { inject } from '@angular/core';
import { HomeComponent } from './pages/home/home.component';
import { LoginComponent } from './pages/login/login.component';
import { AuthenticationGuard } from './guard/authentication.guard';
import { GuestOnlyGuard } from './guard/guest-only.guard';
import { AdminGuard } from './guard/admin.guard';
import { NotFoundComponent } from './pages/not-found/not-found.component';
import { LegalPageComponent } from './pages/legal-page/legal-page.component';

const legacyPrivateChatRedirect: CanActivateFn = route => {
  const username = route.paramMap.get('username') || route.paramMap.get('username2');
  return inject(Router).createUrlTree(['/menu/messages'], {
    queryParams: username ? { kind: 'direct', id: username } : {}
  });
};

const routes: Routes = [
  {path:'', redirectTo:'home',pathMatch:'full'},
  // `seo` feeds SeoService (title, description, canonical, robots, share tags).
  // A route without `seo` data is treated as private and marked noindex.
  {path:'home',component:HomeComponent,data:{seo:{path:'/',index:true,description:'Encontra onde, quando e com quem jogar. Descobre jogos de padel, futebol, ténis e muito mais perto de ti.'}}},
  {path:'about',loadComponent:() => import('./pages/about/about.component').then(m => m.AboutComponent),data:{seo:{title:'Sobre a Jynlo',index:true,description:'Conhece a Jynlo, a forma mais simples de encontrar jogos, locais e pessoas para praticar desporto em Portugal.'}}},
  {path:'contact',loadComponent:() => import('./pages/contact/contact.component').then(m => m.ContactComponent),data:{seo:{title:'Contacto',index:true,description:'Fala com a equipa da Jynlo: dúvidas, sugestões e apoio.'}}},
  {path:'privacy',component:LegalPageComponent,data:{document:'privacy',seo:{title:'Política de privacidade',index:true,description:'Como a Jynlo trata e protege os teus dados pessoais.'}}},
  {path:'terms',component:LegalPageComponent,data:{document:'terms',seo:{title:'Termos e condições',index:true,description:'Os termos e condições de utilização da Jynlo.'}}},
  {path:'delete-account',component:LegalPageComponent,data:{document:'delete',seo:{title:'Eliminar conta',index:false,description:'Como eliminar a tua conta Jynlo e os dados associados.'}}},
  // Sessions are short-lived, so they are not indexed; they still need a share title.
  {path:'sessions/:id',loadComponent:() => import('./pages/public-session-preview/public-session-preview.component').then(m => m.PublicSessionPreviewComponent),data:{seo:{index:false}}},
  // Opt-in shareable tournament table and results, readable without an account.
  {path:'classificacao/:id',loadComponent:() => import('./pages/public-ranking/public-ranking.component').then(m => m.PublicRankingComponent),data:{seo:{index:false}}},
  {path:'torneio/:id',loadComponent:() => import('./pages/public-tournament/public-tournament.component').then(m => m.PublicTournamentComponent),data:{seo:{index:false}}},
  // The same venue details page can be read by visitors. The authenticated route
  // below still exposes photo uploads, community contributions and suggestions.
  {path:'venues/:id',loadChildren:() => import('./pages/venue-details/venue-details.module').then(m => m.VenueDetailsModule),data:{publicVenueView:true,seo:{index:true}}},
  {path:'menu/events/menu',redirectTo:'/menu', pathMatch:'full'},
  {path:'menu/my-sessions',loadChildren:() => import('./pages/my-sessions/my-sessions.module').then(m => m.MySessionsModule),canActivate:[AuthenticationGuard]},
  {path:'menu/events/:id',loadChildren:() => import('./pages/session-details/session-details.module').then(m => m.SessionDetailsModule),canActivate:[AuthenticationGuard]},
  {path:'menu/feed',loadChildren:() => import('./pages/social-feed/social-feed.module').then(m => m.SocialFeedModule),canActivate:[AuthenticationGuard]},
  {path:'menu/discover',loadChildren:() => import('./pages/discover/discover.module').then(m => m.DiscoverModule),canActivate:[AuthenticationGuard]},
  {path:'menu/venues',loadComponent:() => import('./pages/venues-directory/venues-directory.component').then(m => m.VenuesDirectoryComponent),canActivate:[AuthenticationGuard]},
  {path:'menu/venues/new',loadChildren:() => import('./pages/venue-create/venue-create.module').then(m => m.VenueCreateModule),canActivate:[AuthenticationGuard]},
  {path:'menu/venues/:id/suggest-edit',loadComponent:() => import('./pages/venue-suggest-edit/venue-suggest-edit.component').then(m => m.VenueSuggestEditComponent),canActivate:[AuthenticationGuard]},
  {path:'menu/venues/:id',loadChildren:() => import('./pages/venue-details/venue-details.module').then(m => m.VenueDetailsModule),canActivate:[AuthenticationGuard]},
  {path:'menu/events',loadChildren:() => import('./pages/events/events.module').then(m => m.EventsModule),canActivate:[AuthenticationGuard]},
  {path:'menu/login',redirectTo:'/login', pathMatch:'full'},
  {path:'login',component:LoginComponent},
  {path:'login/registerNewUser',loadComponent:() => import('./pages/createaccount/createaccount.component').then(m => m.CreateaccountComponent),canActivate:[GuestOnlyGuard]},
  {path:'login/google/complete-profile',loadComponent:() => import('./pages/google-onboarding/google-onboarding.component').then(m => m.GoogleOnboardingComponent),canActivate:[GuestOnlyGuard]},
  {path:'menu/create',loadComponent:() => import('./pages/create-hub/create-hub.component').then(m => m.CreateHubComponent),canActivate:[AuthenticationGuard]},
  {path:'menu/createEvent',loadChildren:() => import('./pages/events2/create-event.module').then(m => m.CreateEventModule),canActivate:[AuthenticationGuard]},
  {path:'menu/createEvent/menu', redirectTo:'menu',pathMatch:'full'},
  {path:'login/registerNewUser/login', redirectTo:'login',pathMatch:'full'},
  {path:'menu/alterardados',loadChildren:() => import('./pages/alterardados/alterardados.module').then(m => m.AlterardadosModule),canActivate:[AuthenticationGuard]},
  {path:'menu/alterardados/menu', redirectTo:'menu',pathMatch:'full'},
  {path:'menu/alterarPassword/menu', redirectTo:'menu',pathMatch:'full'},
  {path:'menu/alterarPassword', loadComponent:() => import('./pages/changepassword/changepassword.component').then(m => m.ChangepasswordComponent),canActivate:[AuthenticationGuard]},
  {path:'menu/createEvents',loadChildren:() => import('./pages/events2/create-event.module').then(m => m.CreateEventModule),canActivate:[AuthenticationGuard]},
  {path:'menu/createEvents/menu',redirectTo:'menu',pathMatch:'full'},
  {path:'login/resetPassword',loadComponent:() => import('./pages/forgotp/forgotp.component').then(m => m.ForgotpComponent)},
  {path:'menu/perfis',loadChildren:() => import('./pages/perfis/perfis.module').then(m => m.PerfisModule),canActivate:[AuthenticationGuard]},
  {path:'menu/perfis/menu',redirectTo:'menu',pathMatch:'full'},
  {path:'menu/perfis/:username',loadChildren:() => import('./pages/perfis/perfis.module').then(m => m.PerfisModule),canActivate:[AuthenticationGuard]},
  {path:'login/resetPassword/:token',loadComponent:() => import('./pages/forgotp2/forgotp2.component').then(m => m.Forgotp2Component), pathMatch:'full'},
  {path:'login/registerNewUser/confirmTokenRegistration/:token', loadComponent:() => import('./pages/confirm-token-registration/confirm-token-registration.component').then(m => m.ConfirmTokenRegistrationComponent), pathMatch:'full'},
  {path:'menu/dadosPerfil',loadComponent:() => import('./pages/perfil-data/perfil-data.component').then(m => m.PerfilDataComponent),canActivate:[AuthenticationGuard], pathMatch:'full'},
  {path:'menu/dadosPerfil/menu',redirectTo:'menu',pathMatch:'full'},  
  {path:'menu/dadosPerfil/alterardados',redirectTo:'menu/alterardados',pathMatch:'full'},
  {path:'login/MFAauthentication', loadComponent:() => import('./pages/login-mfa/login-mfa.component').then(m => m.LoginMFAComponent)},
  {path:'menu', redirectTo:'/menu/feed', pathMatch:'full'},
  {path:'menu/friendList',loadChildren:() => import('./pages/friends/friends.module').then(m => m.FriendsModule),canActivate:[AuthenticationGuard]},
  {path:'menu/first-steps',loadComponent:() => import('./pages/first-steps/first-steps.component').then(m => m.FirstStepsComponent),canActivate:[AuthenticationGuard],data:{seo:{index:false}}},
  {path:'menu/search',loadComponent:() => import('./pages/global-search/global-search.component').then(m => m.GlobalSearchComponent),canActivate:[AuthenticationGuard],data:{seo:{index:false}}},
  {path:'menu/messages',loadComponent:() => import('./pages/messages-center/messages-center.component').then(m => m.MessagesCenterComponent),canActivate:[AuthenticationGuard]},
  {path:'menu/groups',loadComponent:() => import('./pages/private-groups/private-groups.component').then(m => m.PrivateGroupsComponent),canActivate:[AuthenticationGuard]},
  {path:'menu/friendList/chat/:username',canActivate:[AuthenticationGuard,legacyPrivateChatRedirect],children:[]},
  {path:'menu/friendList/chat/:username1/:username2',canActivate:[AuthenticationGuard,legacyPrivateChatRedirect],children:[]},
  {path:'menu/notifications',loadChildren:() => import('./pages/notifications/notifications.module').then(m => m.NotificationsModule),canActivate:[AuthenticationGuard]},
  {path:'menu/notifications/:id',loadChildren:() => import('./pages/notifications/notifications.module').then(m => m.NotificationsModule),canActivate:[AuthenticationGuard]},
  {path:'menu/teams/competitions',loadComponent:() => import('./pages/sports-teams/sports-team-competition-discovery.component').then(m => m.TeamCompetitionDiscoveryComponent),canActivate:[AuthenticationGuard]},
  {path:'menu/teams',loadComponent:() => import('./pages/sports-teams/sports-teams.component').then(m => m.SportsTeamsComponent),canActivate:[AuthenticationGuard]},
  {path:'menu/teams/:id',loadComponent:() => import('./pages/sports-teams/sports-team-detail.component').then(m => m.SportsTeamDetailComponent),canActivate:[AuthenticationGuard]},
  {path:'menu/communities',loadChildren:() => import('./pages/communities/communities.module').then(m => m.CommunitiesModule),canActivate:[AuthenticationGuard]},
  {path:'menu/admin',loadChildren:() => import('./pages/admin/admin.module').then(m => m.AdminModule),canActivate:[AuthenticationGuard,AdminGuard]},
  {path:'menu/terminarSessao',redirectTo:'menu',pathMatch:'full'},
  {path:'**',component:NotFoundComponent}
];

@NgModule({
  // New screens must start at the top; browser Back restores the previous position.
  // Otherwise the global fixed navbar can cover the public session header.
  imports: [RouterModule.forRoot(routes, {
    scrollPositionRestoration: 'enabled',
    anchorScrolling: 'enabled'
  })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
