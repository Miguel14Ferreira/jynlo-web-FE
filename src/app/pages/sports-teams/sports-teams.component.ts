import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SportsTeam, SportsTeamInvitation, SportsTeamsService } from '../../services/sports-teams.service';
import { CompetitionTeamInvitation, TeamCompetitionInvitationsService } from '../../services/team-competition-invitations.service';

@Component({
  selector: 'app-sports-teams',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './sports-teams.component.html',
  styleUrls: ['./sports-teams.component.css']
})
export class SportsTeamsComponent implements OnInit {
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
  draft = {name: '', sport: '', location: '', description: ''};
  saving = false;
  loading = false;
  error = '';

  constructor(private readonly api: SportsTeamsService,
              private readonly competitionInvites: TeamCompetitionInvitationsService,
              private readonly route: ActivatedRoute,
              private readonly router: Router) {}
  ngOnInit(): void {
    this.createExpanded=this.route.snapshot.queryParamMap.get('create')==='1';
    this.search();this.loadInvitations();this.loadTeamInvitations();this.loadMine();this.loadJoined();
  }

  loadJoined():void{
    this.joinedLoading=true;this.joinedError='';
    this.api.joined().subscribe({
      next:items=>{this.joined=items;this.joinedLoading=false;},
      error:()=>{this.joinedError='Não foi possível confirmar as equipas onde és jogador.';this.joinedLoading=false;}
    });
  }
  loadMine(): void {
    this.mineLoading = true;
    this.mineError = '';
    this.api.mine().subscribe({
      next: teams => {this.mine = teams; this.mineLoading = false;},
      error: () => {this.mineError = 'Não foi possível carregar as tuas equipas.'; this.mineLoading = false;}
    });
  }

  loadTeamInvitations():void{
    this.teamInvitationError='';
    this.api.pendingInvitations().subscribe({
      next:items=>{this.teamInvitations=items;this.teamInvitationsVerified=true;},
      error:()=>{
        this.teamInvitationsVerified=false;
        this.teamInvitationError='Não foi possível verificar os convites para equipas.';
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
        this.teamInvitationError='Não foi possível confirmar a resposta. Verifica os convites antes de repetir.';
      }
    });
  }
  loadInvitations(): void {
    this.competitionInvites.mine().subscribe({
      next: rows => this.invitations = rows,
      error: () => this.invitations = []
    });
  }

  respond(id: number, accept: boolean): void {
    if (this.responding) return;
    this.responding = true;
    this.error = '';
    this.competitionInvites.respond(id, accept).subscribe({
      next: () => {this.responding = false; this.loadInvitations();},
      error: () => {this.responding = false; this.error = 'Não foi possível responder ao convite. Confirma o estado antes de repetir.';}
    });
  }

  search(): void {
    this.loading = true;
    this.searched = true;
    this.error = '';
    this.api.discover(this.query).subscribe({
      next: data => { this.teams = data; this.loading = false; },
      error: () => { this.error = 'Não foi possível carregar equipas.'; this.loading = false; }
    });
  }

  create(): void {
    if (this.saving || !this.draft.name.trim()) return;
    this.saving = true;
    this.error = '';
    this.api.create(this.draft).subscribe({
      next: created => {
        this.saving = false;
        this.draft = {name: '', sport: '', location: '', description: ''};
        this.createExpanded = false;
        if(Number.isSafeInteger(created.id)&&created.id>0){
          void this.router.navigate(['/menu/teams',created.id]);
        }else{
          this.error='A equipa foi criada, mas o servidor não confirmou o identificador. Consulta as tuas equipas.';
          this.search();this.loadMine();
        }
      },
      error: () => { this.saving = false; this.error = 'Não foi possível criar a equipa. Confirma que tens sessão iniciada.'; }
    });
  }
}
