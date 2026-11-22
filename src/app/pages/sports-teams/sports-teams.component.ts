import { appTranslate } from '../../i18n/i18n.service';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { timeout } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SportsTeam, SportsTeamInvitation, SportsTeamsService } from '../../services/sports-teams.service';
import { SPORTS_CATALOG } from '../../shared/sports-catalog';
import { CompetitionTeamInvitation, TeamCompetitionInvitationsService } from '../../services/team-competition-invitations.service';
import { SportNamePipe } from '../../i18n/sport-name.pipe';

@Component({
  selector: 'app-sports-teams',
  standalone: true,
  imports: [TranslatePipe, SportNamePipe, CommonModule, FormsModule, RouterLink],
  templateUrl: './sports-teams.component.html',
  styleUrls: ['./sports-teams.component.css']
})
export class SportsTeamsComponent implements OnInit, OnDestroy {
  private alive=true;
  private searchRequest=0;
  private readonly requestTimeout=15000;
  brokenTeamLogos=new Set<number>();
  logoSrc(url:string|null|undefined):string|null{return this.api.logoSrc(url);}
  logoFailed(id:number):void{this.brokenTeamLogos.add(id);this.render();}
  query = '';
  createExpanded = false;
  searched = false;
  mineError = '';
  toggleCreate(): void { this.createExpanded = !this.createExpanded; }
  teams: SportsTeam[] = [];
  mine: SportsTeam[] = [];
  joined: SportsTeam[] = [];
  joinedError = '';
  joinedLoading = false;
  mineLoading = false;
  invitations: CompetitionTeamInvitation[] = [];
  teamInvitations: SportsTeamInvitation[] = [];
  teamInvitationError = '';
  teamInvitationsVerified = false;
  teamResponding = false;
  responding = false;
  readonly sportsCatalog = SPORTS_CATALOG;
  draft = {name: '', sport: '', location: '', description: ''};
  saving = false;
  loading = false;
  error = '';

  constructor(private readonly api: SportsTeamsService,
              private readonly competitionInvites: TeamCompetitionInvitationsService,
              private readonly route: ActivatedRoute,
              private readonly router: Router,
              private readonly cdr: ChangeDetectorRef) {}
  private render():void {if(this.alive)this.cdr.detectChanges();}
  ngOnInit(): void {
    this.createExpanded=this.route.snapshot.queryParamMap.get('create')==='1';
    // Directory discovery is independent of account membership. Never block
    // the public team list behind a slow token refresh or ownership lookup.
    this.search();this.loadMine();this.loadJoined();this.loadTeamInvitations();this.loadInvitations();
  }

  ngOnDestroy():void {this.alive=false;this.searchRequest++;}
  openTeam(team:SportsTeam):void {
    this.api.rememberTeam(team);
  }
  loadJoined():void{
    this.joinedLoading=true;this.joinedError='';
    this.api.joined().pipe(timeout(this.requestTimeout)).subscribe({
      next:items=>{if(!this.alive)return;this.joined=items;this.joinedLoading=false;this.render();},
      error:()=>{if(!this.alive)return;this.joinedError=appTranslate('Não foi possível confirmar as equipas onde és jogador.');this.joinedLoading=false;this.render();}
    });
  }
  loadMine(): void {
    this.mineLoading = true;
    this.mineError = '';
    this.api.mine().pipe(timeout(this.requestTimeout)).subscribe({
      next: teams => {
        if(!this.alive)return;
        this.mine=teams;this.mineLoading=false;this.render();
      },
      error: () => {
        if(!this.alive)return;
        this.mineError=appTranslate('Não foi possível carregar as tuas equipas. Tenta novamente.');
        this.mineLoading=false;this.render();
      }
    });
  }

  loadTeamInvitations():void{
    this.teamInvitationError='';
    this.api.pendingInvitations().pipe(timeout(this.requestTimeout)).subscribe({
      next:items=>{if(!this.alive)return;this.teamInvitations=items;this.teamInvitationsVerified=true;this.render();},
      error:()=>{
        this.teamInvitationsVerified=false;
        this.teamInvitationError=appTranslate('Não foi possível verificar os convites para equipas.');
        this.render();
      }
    });
  }
  respondTeam(teamId:number,accept:boolean):void{
    if(this.teamResponding||!this.teamInvitationsVerified||
      !this.teamInvitations.some(item=>item.teamId===teamId))return;
    this.teamResponding=true;this.teamInvitationError='';
    this.api.respond(teamId,accept).subscribe({
      next:()=>{
        this.teamInvitations=this.teamInvitations.filter(item=>item.teamId!==teamId);
        this.teamResponding=false;
        this.loadTeamInvitations();
        if(accept){
          this.loadJoined();
          void this.router.navigate(['/menu/teams',teamId]);
        }else{
          this.loadMine();
        }
      },
      error:()=>{
        this.teamResponding=false;this.teamInvitationsVerified=false;
        this.teamInvitationError=appTranslate('Não foi possível confirmar a resposta. Verifica os convites antes de repetir.');
      }
    });
  }
  loadInvitations(): void {
    this.competitionInvites.mine().pipe(timeout(this.requestTimeout)).subscribe({
      next: rows => {if(!this.alive)return;this.invitations = rows;this.render();},
      error: () => {if(!this.alive)return;this.invitations = [];this.render();}
    });
  }

  respond(id: number, accept: boolean): void {
    if (this.responding) return;
    this.responding = true;
    this.error = '';
    this.competitionInvites.respond(id, accept).subscribe({
      next: () => {this.responding = false; this.loadInvitations();},
      error: () => {this.responding = false; this.error = appTranslate('Não foi possível responder ao convite. Confirma o estado antes de repetir.');}
    });
  }

  search(): void {
    const request=++this.searchRequest;
    const query=this.query.trim();
    this.loading=true;this.searched=true;this.error='';
    this.api.discover(query).pipe(timeout(this.requestTimeout)).subscribe({
      next:data=>{
        if(!this.alive||request!==this.searchRequest)return;
        this.teams=data;this.loading=false;this.render();
      },
      error:()=>{
        if(!this.alive||request!==this.searchRequest)return;
        this.error=appTranslate('A pesquisa demorou demasiado ou falhou. Tenta novamente.');
        this.loading=false;this.render();
      }
    });
  }

  create(): void {
    if (this.saving || !this.draft.name.trim()) return;
    this.saving = true;
    this.error = '';
    this.api.create(this.draft).subscribe({
      next: created => {
        this.saving = false;this.render();
        this.draft = {name: '', sport: '', location: '', description: ''};
        this.createExpanded = false;
        if(Number.isSafeInteger(created.id)&&created.id>0){
          void this.router.navigate(['/menu/teams',created.id]);
        }else{
          this.error=appTranslate('A equipa foi criada, mas o servidor não confirmou o identificador. Consulta as tuas equipas.');
          this.search();this.loadMine();
        }
      },
      error: () => { this.saving = false; this.error = appTranslate('Não foi possível criar a equipa. Confirma que tens sessão iniciada.');this.render(); }
    });
  }
}
