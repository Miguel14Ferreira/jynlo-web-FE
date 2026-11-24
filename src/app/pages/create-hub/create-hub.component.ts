import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../i18n/translate.pipe';

/** "O que vamos criar?" — the web counterpart of the app's + menu. */
@Component({
  selector: 'app-create-hub',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  template: `
  <main class="create-hub">
    <header>
      <h1>{{ 'O que vamos criar?' | t }}</h1>
      <p>{{ 'Junta pessoas através do desporto.' | t }}</p>
    </header>
    <a class="create-hero" routerLink="/menu/createEvent">
      <span class="create-hero-kicker">{{ 'AÇÃO PRINCIPAL' | t }}</span>
      <strong>{{ 'Criar sessão' | t }}</strong>
      <span>{{ 'Marca um jogo, convida pessoas e gere as equipas.' | t }}</span>
    </a>
    <h2>{{ 'Também podes criar' | t }}</h2>
    <nav class="create-grid" [attr.aria-label]="'Também podes criar' | t">
      <a routerLink="/menu/feed" [queryParams]="{compose: 'post'}"><strong>{{ 'Publicação' | t }}</strong><span>{{ 'Partilha um momento' | t }}</span></a>
      <a routerLink="/menu/reservar"><strong>{{ 'Reservar campo' | t }}</strong><span>{{ 'Vê os horários livres e reserva' | t }}</span></a>
      <a routerLink="/menu/communities/create"><strong>{{ 'Comunidade' | t }}</strong><span>{{ 'Junta a tua malta' | t }}</span></a>
      <a routerLink="/menu/teams" [queryParams]="{create: '1'}"><strong>{{ 'Equipa' | t }}</strong><span>{{ 'Cria a tua equipa' | t }}</span></a>
      <a routerLink="/menu/communities"><strong>{{ 'Torneio' | t }}</strong><span>{{ 'Numa comunidade tua, no separador Torneios' | t }}</span></a>
      <a routerLink="/menu/venues/new"><strong>{{ 'Sugerir recinto' | t }}</strong><span>{{ 'Acrescenta um espaço desportivo à Jynlo' | t }}</span></a>
    </nav>
  </main>`,
  styles: [`
    .create-hub{max-width:760px;margin:0 auto;padding:96px 18px 48px;display:grid;gap:18px}
    @media(max-width:700px){.create-hub{padding-top:80px}}
    header h1{margin:0;font-size:28px}
    header p{margin:6px 0 0;color:var(--jynlo-muted,#9fb8bd)}
    h2{margin:8px 0 0;font-size:15px;color:var(--jynlo-muted,#9fb8bd)}
    a{text-decoration:none;color:inherit}
    .create-hero{display:grid;gap:6px;padding:22px;border-radius:22px;background:#2ee6d0;color:#03242a}
    .create-hero strong{font-size:22px}
    .create-hero-kicker{font-size:11px;font-weight:900;letter-spacing:.08em}
    .create-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
    .create-grid a{display:grid;gap:4px;padding:18px;border-radius:18px;border:1px solid #225763;background:#092938}
    .create-grid a:hover,.create-grid a:focus-visible{border-color:#2ee6d0}
    .create-grid strong{font-size:16px}
    .create-grid span{font-size:13px;color:var(--jynlo-muted,#9fb8bd)}
  `]
})
export class CreateHubComponent {}
