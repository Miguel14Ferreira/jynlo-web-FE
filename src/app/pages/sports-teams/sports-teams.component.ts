import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SportsTeam, SportsTeamsService } from '../../services/sports-teams.service';
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
  mineLoading = false;
  invitations: CompetitionTeamInvitation[] = [];
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
    this.search();this.loadInvitations();this.loadMine();
  }

  loadMine(): void {
    this.mineLoading = true;
    this.mineError = '';
    this.api.mine().subscribe({
      next: teams => {this.mine = teams; this.mineLoading = false;},
      error: () => {this.mineError = 'Não foi possível carregar as tuas equipas.'; this.mineLoading = false;}
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
