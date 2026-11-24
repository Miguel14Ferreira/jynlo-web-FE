import { ChangeDetectionStrategy, Component, HostListener, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../i18n/translate.pipe';

/** Public page for clubs and venues: why and how to take bookings on Jynlo. */
@Component({
  selector: 'app-for-venues',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="fv">
      <section class="fv__hero">
        <div class="fv__hero-copy">
          <span class="fv__kicker">{{ 'Para recintos e clubes' | t }}</span>
          <h1>{{ 'Os vossos campos com mais jogadores, sem custos.' | t }}</h1>
          <p>{{ 'A Jynlo junta quem quer jogar. Ponham os vossos horários na Jynlo e recebam pedidos de reserva de jogadores da vossa zona, num painel simples.' | t }}</p>
          <div class="fv__ctas">
            <a class="jynlo-action jynlo-action--primary" routerLink="/menu/venues">{{ 'Encontrar o meu recinto' | t }}</a>
            <a class="jynlo-action jynlo-action--neutral" href="mailto:geral@jynlosports.com?subject=Recinto%20na%20Jynlo">{{ 'Falar connosco' | t }}</a>
          </div>
        </div>
        <figure class="fv__shot">
          <button type="button" class="fv__zoom" (click)="open('assets/marketing/recintos-reservas.jpg', 'A página de reservas e o painel do recinto na Jynlo, com dados de exemplo')"
                  [attr.aria-label]="'Ampliar imagem' | t">
            <img src="assets/marketing/recintos-reservas.jpg" width="800" height="1078" loading="lazy"
                 [alt]="'A página de reservas e o painel do recinto na Jynlo, com dados de exemplo' | t">
            <span class="fv__zoom-hint" aria-hidden="true">🔍 {{ 'Ampliar' | t }}</span>
          </button>
          <figcaption>{{ 'Imagens com dados de exemplo.' | t }}</figcaption>
        </figure>
      </section>

      <section class="fv__grid" [attr.aria-label]="'O que ganham' | t">
        <article class="fv__card">
          <span class="fv__icon" aria-hidden="true">🗓️</span>
          <h2>{{ 'Reservas sem custos' | t }}</h2>
          <p>{{ 'Os jogadores veem os vossos horários livres e pedem a reserva na app ou no site. Sem mensalidades nem comissões para os primeiros recintos parceiros.' | t }}</p>
        </article>
        <article class="fv__card">
          <span class="fv__icon" aria-hidden="true">✅</span>
          <h2>{{ 'Vocês decidem' | t }}</h2>
          <p>{{ 'Cada pedido chega ao vosso painel e só fica marcado quando o confirmam. Indicam os campos, os preços e o horário de funcionamento.' | t }}</p>
        </article>
        <article class="fv__card">
          <span class="fv__icon" aria-hidden="true">💶</span>
          <h2>{{ 'O dinheiro vai direto para vós' | t }}</h2>
          <p>{{ 'Recebem por MB WAY no número do clube ou no local. A Jynlo não fica com nada.' | t }}</p>
        </article>
        <article class="fv__card">
          <span class="fv__icon" aria-hidden="true">👥</span>
          <h2>{{ 'Mais gente a jogar' | t }}</h2>
          <p>{{ 'Cada reserva pode virar um jogo com convites a outros jogadores. Também podem criar comunidades, torneios e campeonatos.' | t }}</p>
        </article>
      </section>

      <section class="fv__how" aria-labelledby="fv-how">
        <div>
          <span class="fv__kicker">{{ 'Como funciona' | t }}</span>
          <h2 id="fv-how">{{ 'Do horário à reserva paga, em 5 passos' | t }}</h2>
          <p>{{ 'Ecrãs reais da Jynlo, com dados de exemplo.' | t }}</p>
        </div>
        @for (step of steps; track step.img; let i = $index) {
          <article class="fv__step" [class.fv__step--flip]="i % 2 === 1">
            <div class="fv__step-copy">
              <span class="fv__num">{{ i + 1 }}</span>
              <span class="fv__who">{{ step.who | t }}</span>
              <h3>{{ step.title | t }}</h3>
              <p>{{ step.text | t }}</p>
            </div>
            <figure class="fv__step-shot">
              <button type="button" class="fv__zoom" (click)="open('assets/marketing/' + step.img + '.jpg', step.title)"
                      [attr.aria-label]="'Ampliar imagem' | t">
                <img [src]="'assets/marketing/' + step.img + '.jpg'" width="900" [attr.height]="step.h" loading="lazy" [alt]="step.title | t">
                <span class="fv__zoom-hint" aria-hidden="true">🔍 {{ 'Ampliar' | t }}</span>
              </button>
            </figure>
          </article>
        }
      </section>

      <section class="fv__steps" aria-labelledby="fv-steps">
        <h2 id="fv-steps">{{ 'Como aderir, em 3 passos' | t }}</h2>
        <ol>
          <li><strong>{{ 'Encontrem o vosso recinto na Jynlo, ou criem-no.' | t }}</strong>
            {{ 'Já temos mais de 3600 recintos no diretório. Se o vosso não estiver, criem-no em poucos minutos.' | t }}</li>
          <li><strong>{{ 'Digam-nos que são os responsáveis.' | t }}</strong>
            {{ 'Na página do recinto, ou ao criá-lo, marquem “Sou o responsável por este recinto”. Precisam de uma conta Jynlo, que é grátis. Confirmamos e ficam a gerir o recinto.' | t }}</li>
          <li><strong>{{ 'Indiquem os campos, os preços e o horário.' | t }}</strong>
            {{ 'Os horários livres passam a aparecer aos jogadores e os pedidos chegam ao vosso painel.' | t }}</li>
        </ol>
        <div class="fv__ctas">
          <a class="jynlo-action jynlo-action--primary" routerLink="/menu/venues">{{ 'Encontrar o meu recinto' | t }}</a>
          <a class="jynlo-action jynlo-action--neutral" routerLink="/menu/venues/new" [queryParams]="{ owner: 1 }">{{ 'Criar o meu recinto' | t }}</a>
        </div>
      </section>

      <section class="fv__faq" aria-labelledby="fv-faq">
        <h2 id="fv-faq">{{ 'Perguntas frequentes' | t }}</h2>
        <details>
          <summary>{{ 'Tem algum custo?' | t }}</summary>
          <p>{{ 'Não. Para os primeiros recintos parceiros não há mensalidade nem comissão sobre as reservas.' | t }}</p>
        </details>
        <details>
          <summary>{{ 'Já usamos outra plataforma de reservas. Podemos usar as duas?' | t }}</summary>
          <p>{{ 'Sim. Podem pôr na Jynlo só alguns campos ou horários, e recusar qualquer pedido que não dê jeito.' | t }}</p>
        </details>
        <details>
          <summary>{{ 'Como recebemos os pagamentos?' | t }}</summary>
          <p>{{ 'Por MB WAY no número que indicarem, ou no local. O jogador marca que pagou e vocês confirmam no painel.' | t }}</p>
        </details>
        <details>
          <summary>{{ 'Podemos organizar torneios?' | t }}</summary>
          <p>{{ 'Sim. Criem uma comunidade do clube e organizem torneios e campeonatos, com inscrições pagas por MB WAY.' | t }}</p>
        </details>
      </section>

      <section class="fv__contact">
        <h2>{{ 'Preferem falar primeiro?' | t }}</h2>
        <p>{{ 'Escrevam-nos e ajudamos a configurar tudo. Demora uns 10 minutos.' | t }}</p>
        <a class="fv__mail" href="mailto:geral@jynlosports.com?subject=Recinto%20na%20Jynlo">geral&#64;jynlosports.com</a>
      </section>
    </main>
      @if (zoomed(); as z) {
      <div class="fv__lightbox" role="dialog" aria-modal="true" [attr.aria-label]="z.alt | t" (click)="close()">
        <button type="button" class="fv__lightbox-close" (click)="close()" [attr.aria-label]="'Fechar' | t">✕</button>
        <img [src]="z.src" [alt]="z.alt | t" (click)="$event.stopPropagation()">
      </div>
    }
`,
  styles: [`
    .fv { max-width:1100px; margin:0 auto; padding:6.4rem 1.2rem 4rem; display:grid; gap:2.2rem; color:#eafff9; }
    .fv h1 { margin:.3rem 0 .8rem; font-size:clamp(2rem, 4.4vw, 3.1rem); line-height:1.1; }
    .fv h2 { margin:0 0 .4rem; font-size:1.25rem; }
    .fv p { color:#c9dfe0; line-height:1.6; margin:0; }
    .fv__kicker { color:#62e6c4; font-size:.8rem; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
    .fv__hero { display:grid; grid-template-columns:minmax(0, 1.1fr) minmax(0, .9fr); gap:2rem; align-items:center; }
    .fv__hero-copy > p { font-size:1.08rem; }
    .fv__ctas { display:flex; flex-wrap:wrap; gap:.6rem; margin-top:1.2rem; }
    .fv__shot { margin:0; display:grid; gap:.4rem; }
    .fv__shot img { width:100%; height:auto; border-radius:18px; border:1px solid rgba(96,176,182,.35); }
    .fv__shot figcaption { color:#8fb0b3; font-size:.8rem; }
    .fv__how { display:grid; gap:1.4rem; }
    .fv__step { display:grid; grid-template-columns:minmax(0, .8fr) minmax(0, 1.2fr); gap:1.6rem; align-items:center;
      padding:1.3rem; border-radius:18px; border:1px solid rgba(96,176,182,.3); background:rgba(10,41,55,.6); }
    .fv__step--flip .fv__step-copy { order:2; }
    .fv__step-copy { display:grid; gap:.4rem; align-content:start; }
    .fv__step h3 { margin:0; font-size:1.2rem; }
    .fv__num { display:inline-grid; place-items:center; width:2rem; height:2rem; border-radius:999px; background:#62e6c4; color:#04212b; font-weight:900; }
    .fv__who { color:#62e6c4; font-size:.78rem; font-weight:800; letter-spacing:.06em; text-transform:uppercase; }
    .fv__step-shot { margin:0; }
    .fv__step-shot img { width:100%; height:auto; border-radius:14px; border:1px solid rgba(96,176,182,.35); }
    .fv__grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:1rem; }
    .fv__card, .fv__steps, .fv__faq, .fv__contact { padding:1.3rem; border-radius:18px; border:1px solid rgba(96,176,182,.3); background:rgba(10,41,55,.6); }
    .fv__icon { font-size:1.6rem; }
    .fv__steps ol { margin:.6rem 0 1.2rem; padding-left:1.3rem; display:grid; gap:.8rem; color:#c9dfe0; line-height:1.6; }
    .fv__steps strong { color:#eafff9; }
    .fv__faq { display:grid; gap:.6rem; }
    .fv__faq details { padding:.7rem .9rem; border-radius:12px; background:rgba(4,24,33,.6); }
    .fv__faq summary { cursor:pointer; font-weight:700; }
    .fv__faq details p { margin-top:.5rem; }
    .fv__contact { text-align:center; display:grid; gap:.5rem; justify-items:center; }
    .fv__mail { color:#62e6c4; font-size:1.2rem; font-weight:800; }
    .fv__zoom { position:relative; display:block; width:100%; padding:0; border:0; background:none; cursor:zoom-in; border-radius:inherit; }
    .fv__zoom img { display:block; }
    .fv__zoom-hint { position:absolute; right:.6rem; bottom:.6rem; padding:.3rem .6rem; border-radius:999px; font-size:.78rem; font-weight:800;
      color:#06231d; background:rgba(98,230,196,.92); opacity:.85; transition:opacity .15s; }
    .fv__zoom:hover .fv__zoom-hint, .fv__zoom:focus-visible .fv__zoom-hint { opacity:1; }
    .fv__zoom:focus-visible { outline:3px solid #62e6c4; outline-offset:3px; }
    .fv__lightbox { position:fixed; inset:0; z-index:10000; display:grid; place-items:start center; overflow-y:auto; overscroll-behavior:contain; padding:3.5rem 1rem 1.5rem;
      background:rgba(2,10,14,.9); cursor:zoom-out; }
    .fv__lightbox img { max-width:min(1000px,100%); width:auto; height:auto; object-fit:contain; border-radius:12px;
      box-shadow:0 20px 60px rgba(0,0,0,.6); cursor:default; }
    .fv__lightbox-close { position:fixed; top:.8rem; right:.8rem; width:44px; height:44px; border-radius:50%; border:1px solid rgba(255,255,255,.3);
      background:rgba(10,30,36,.9); color:#fff; font-size:1.2rem; cursor:pointer; z-index:1; }
    @media (max-width: 820px) { .fv__hero, .fv__step { grid-template-columns:1fr; } .fv__step--flip .fv__step-copy { order:0; } }
  `]
})
export class ForVenuesComponent {
  /** The screenshot opened full size; people want to read the screens. */
  readonly zoomed = signal<{ src: string; alt: string } | null>(null);

  open(src: string, alt: string): void { this.zoomed.set({ src, alt }); }
  close(): void { this.zoomed.set(null); }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.close(); }

  readonly steps = [
    { img: 'painel-campos', h: 365, who: 'No vosso painel', title: 'Indicam os campos e os preços',
      text: 'Nome, modalidade, preço e duração de cada reserva. Podem desligar um campo quando quiserem.' },
    { img: 'painel-horario', h: 610, who: 'No vosso painel', title: 'Definem o horário de funcionamento',
      text: 'Um ou mais períodos por dia. Os horários livres são criados a partir daqui, sem mais trabalho.' },
    { img: 'jogador-horarios', h: 450, who: 'O que o jogador vê', title: 'O jogador escolhe um horário livre',
      text: 'Vê só os horários livres, com o preço, e pede a reserva. Pode também criar logo o jogo e convidar outros jogadores.' },
    { img: 'painel-pedidos', h: 567, who: 'No vosso painel', title: 'Vocês confirmam ou recusam',
      text: 'Cada pedido chega com o dia, a hora, o campo e a mensagem do jogador. Nada fica marcado sem a vossa confirmação.' },
    { img: 'jogador-pagamento', h: 495, who: 'O que o jogador vê', title: 'O jogador paga e vocês confirmam',
      text: 'Depois de confirmada, o jogador vê o vosso número de MB WAY e marca que pagou. Vocês carregam em “Pagamento recebido”.' },
  ];
}
