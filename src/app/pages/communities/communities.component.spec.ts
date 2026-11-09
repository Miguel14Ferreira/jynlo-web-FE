import { CommunitiesComponent } from './communities.component';
import { of, Subject } from 'rxjs';
import { SessionSummary } from '../model/session-summary';
import { appTranslate as t } from '../../i18n/i18n.service';

describe('CommunitiesComponent public session eligibility', () => {
  let component: CommunitiesComponent;
  let session: SessionSummary;

  beforeEach(() => {
    component = Object.create(CommunitiesComponent.prototype) as CommunitiesComponent;
    spyOn(component, 'canManage').and.returnValue(true);
    session = {
      id: 42,
      sport: 'Futebol',
      city: 'Lisboa',
      gameDate: new Date(Date.now() + 3_600_000).toISOString(),
      distanceKm: null,
      participantCount: 2,
      maxParticipants: 10,
      priceAmount: 0,
      privateGame: false,
      audience: 'COMMUNITY_ONLY',
      status: 'OPEN'
    };
  });



  it('hides discontinued 2026 speed-skating Final B only when creating new rounds', () => {
    Object.defineProperty(component, 'canRecordInlineSpeedWithoutRankings',
      { configurable: true, value: false });
    const codes = component.eventOptions('Patinagem de Velocidade').map(x => x.code);
    expect(codes).toContain('INLINE_TRACK_500D_FINAL_A');
    expect(codes).toContain('INLINE_ROAD_LAP_FINAL_A');
    expect(codes).not.toContain('INLINE_TRACK_500D_FINAL_B');
    expect(codes).not.toContain('INLINE_ROAD_LAP_FINAL_B');

    // An old form may still be open when the page is updated; reject it before API calls.
    component.selected = { id: 27, name: 'Patinagem', sport: 'Patinagem de Velocidade' } as any;
    component.roundEventTypeDraft = 'INLINE_TRACK_500D_FINAL_B';
    component.roundSaving = false;
    component.createRound();
    expect(component.errorMessage).toBe(t('feedback.communities.inlineFinalBDiscontinued'));
  });

  it('retains community detail routing and hides the mine selector in detail mode', () => {
    (component as any).isDetailMode = true;
    expect(component.detailMode()).toBeTrue();
    expect(component.showMineView()).toBeFalse();

    const navigate = jasmine.createSpy('navigate');
    (component as any).router = { navigate };
    component.backToCommunities();
    expect(navigate).toHaveBeenCalledOnceWith(['/menu/communities']);
  });

  it('keeps regular standings and tournament history explanations and column abbreviations translated PT/EN', () => {
    const previous = localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language', 'en');
      expect(t('communities.tournaments.overview.standingsSeparateHint'))
        .toContain('Tournaments have separate results.');
      expect(['playedCol', 'winsCol', 'drawsCol', 'lossesCol'].map(k =>
        t('communities.tournaments.finalUi.' + k))).toEqual(['P', 'W', 'D', 'L']);
      localStorage.setItem('d24-language', 'pt');
      expect(t('communities.tournaments.overview.standingsSeparateHint'))
        .toContain('Os torneios têm resultados independentes.');
      expect(['playedCol', 'winsCol', 'drawsCol', 'lossesCol'].map(k =>
        t('communities.tournaments.finalUi.' + k))).toEqual(['J', 'V', 'E', 'D']);
    } finally {
      if (previous === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', previous);
    }
  });


  it('flags original Excel preview rows by destination and format without modifying results or saving', () => {
    const tied = {
      sourceRow: 8, home: 'Águias', away: 'Leões',
      homeScore: 1, awayScore: 1, sourceRound: 'Final',
      sourceDate: '2023-06-07', potentialDuplicate: true
    };
    const leagueDraw = {
      ...tied, sourceRow: 9, sourceRound: 'Jornada 1', potentialDuplicate: false
    };
    const snapshot = JSON.stringify([tied, leagueDraw]);
    component.matchPreview = {
      sheetName: 'Dados', sourceRows: 2, acceptedRows: 2,
      potentialDuplicates: 1, warnings: [], rows: [tied, leagueDraw]
    };
    component.matchArchiveDestination = 'ARCHIVE';
    component.matchArchiveFormat = 'KNOCKOUT';
    expect(component.importMatchReviewFlags(tied)).toEqual(['possible-duplicate']);
    expect(component.importMatchReviewCount).toBe(1);

    component.matchArchiveDestination = 'TOURNAMENT';
    component.matchArchiveFormat = 'LEAGUE';
    expect(component.importMatchReviewFlags(tied)).toEqual(['possible-duplicate']);
    component.matchArchiveFormat = 'KNOCKOUT';
    expect(component.importMatchReviewFlags(tied)).toEqual(['possible-duplicate', 'tied-knockout']);
    expect(component.importMatchReviewFlags(leagueDraw)).toEqual([]);
    expect(component.importMatchReviewCount).toBe(1);
    expect(JSON.stringify(component.matchPreview.rows)).toBe(snapshot);

    const previous = localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language', 'en');
      expect(t('communities.matches.previewReviewNotice', { count: 1 }))
        .toContain('Source matches flagged for review: 1.');
      localStorage.setItem('d24-language', 'pt');
      expect(t('communities.matches.previewReviewNotice', { count: 1 }))
        .toContain('Partidas sinalizadas para revisão no ficheiro: 1.');
    } finally {
      if (previous === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', previous);
    }
  });

  it('translates the 2026 six-skater qualifying heat limit in PT and EN', () => {
    const previous = localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language', 'pt');
      expect(t('feedback.communities.speedSkatingFirstHeatLimit'))
        .toContain('no máximo 6');
      localStorage.setItem('d24-language', 'en');
      expect(t('feedback.communities.speedSkatingFirstHeatLimit'))
        .toContain('at most 6');
    } finally {
      if (previous === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', previous);
    }
  });

  it('offers BO3 heat awards on documented relegation only, without accepting DQ', () => {
    const bracket={format:'OLYMPIC_TWENTY_FOUR_REPECHAGE',interruption:null,
      matches:[{seriesKey:'SP53-Q1',status:'IN_PROGRESS',
        riderA:'r1',riderB:'r24',riderC:null,riderD:null}]} as any;
    const incident={seriesKey:'SP53-Q1',heatNumber:2,incidentType:'FALL',
      status:'ADJUDICATION_REQUIRED',sanctionType:'RELEGATION',
      sanctionedUsername:'r1'} as any;
    expect(component.sprintIsBo3Award(incident)).toBeTrue();
    expect(component.sprintCanConfirmOfficialAward(bracket,incident)).toBeTrue();
    expect(component.sprintAwardEligibleWinner(bracket,incident)).toBe('r24');
    expect(component.sprintCanConfirmOfficialAward(bracket,{
      ...incident,sanctionType:'DISQUALIFICATION'})).toBeFalse();
    expect(component.sprintCanConfirmOfficialAward(bracket,{
      ...incident,heatNumber:4})).toBeFalse();
    expect(component.sprintCanConfirmOfficialAward(bracket,{
      ...incident,status:'OFFICIAL_HEAT_AWARDED'})).toBeFalse();
    const language=localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language','pt');
      expect(t('communities.trackCycling.awardBo3NotSeries')).toContain('não atribui automaticamente');
      localStorage.setItem('d24-language','en');
      expect(t('communities.trackCycling.awardBo3NotSeries')).toContain('does not automatically');
    } finally {
      if(language===null)localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language',language);
    }
  });

  it('requires explicit chair request, signed panel review and manual outcome with PT/EN', () => {
    component.selected={id:12} as any;
    component.selectedSeasonId=44;
    spyOn(component,'activeSeason').and.returnValue({id:44} as any);
    component.sprintReviewBracketId=53;
    component.sprintReviewIncidentId=7;
    component.sprintReviewMode='REQUEST';
    component.sprintReviewPresident='Fictional Panel President';
    component.sprintReviewReference='Fictional chair request 2026/100';
    component.sprintReviewReason='Formal review requested after viewing the available evidence';
    component.sprintReviewJudgeRefereeConfirmed=false;
    const ask=jasmine.createSpy('requestOfficialReview').and.returnValue(of({action:'REQUESTED'}));
    const decide=jasmine.createSpy('resolveOfficialReview').and.returnValue(of({action:'OVERTURNED'}));
    (component as any).communityService={
      requestSprintOfficialReview:ask,resolveSprintOfficialReview:decide
    };
    spyOn<any>(component,'loadSprintReviewHistory').and.stub();
    spyOn<any>(component,'loadSprintBrackets').and.stub();
    component.saveSprintReview();
    expect(ask).not.toHaveBeenCalled();
    component.sprintReviewJudgeRefereeConfirmed=true;
    component.saveSprintReview();
    expect(ask).toHaveBeenCalledWith(12,44,53,7,jasmine.objectContaining({
      originalJudgeRefereeDecision:true,
      presidentName:'Fictional Panel President'
    }));
    component.sprintReviewMode='DECIDE';
    component.sprintReviewOutcome='';
    component.sprintReviewReference='Fictional final record 2026/102';
    component.sprintReviewPanelReference='Fictional full panel review 2026/101';
    component.sprintReviewReason='Panel reviewed evidence and president explicitly overturned original ruling';
    component.saveSprintReview();
    expect(decide).not.toHaveBeenCalled();
    component.sprintReviewOutcome='OVERTURNED';
    component.saveSprintReview();
    expect(decide).toHaveBeenCalledWith(12,44,53,7,jasmine.objectContaining({
      outcome:'OVERTURNED',
      panelReviewReference:'Fictional full panel review 2026/101',
      presidentDecisionReference:'Fictional final record 2026/102'
    }));
    const prev=localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language','pt');
      expect(t('communities.trackCycling.reviewOverturnedBlock')).toContain('Não é criado');
      localStorage.setItem('d24-language','en');
      expect(t('communities.trackCycling.reviewOverturnedBlock')).toContain('No replacement winner');
    } finally {
      if(prev===null)localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language',prev);
    }
  });

  it('requires an explicitly ranked panel record for incident-time placings, PT/EN', () => {
    const incident={
      id:8,seriesKey:'SP53-A1',heatNumber:1,incidentType:'PUNCTURE',
      status:'POSITIONS_PENDING',decisionType:'OFFICIAL_RESULT_TO_RECORD',
      decisionReference:'Synthetic first commissaires decision 2026/401'
    };
    const bracket={
      id:53,format:'OLYMPIC_TWENTY_FOUR_REPECHAGE',interruption:null,
      matches:[{seriesKey:'SP53-A1',riderA:'r1',riderB:'r24',
        riderC:null,riderD:null,status:'READY',winner:null}],
      incidents:[incident]
    } as any;
    expect(component.sprintCanRatifyPositions(bracket,incident as any)).toBeTrue();
    expect(component.sprintCanRatifyPositions(bracket,{
      ...incident,status:'RESTART_PENDING'
    } as any)).toBeFalse();
    expect(component.sprintCanRatifyPositions({...bracket,matches:[
      {...bracket.matches[0],riderC:'r9'}]},incident as any)).toBeFalse();
    component.selected={id:12} as any;
    component.selectedSeasonId=44;
    spyOn(component,'activeSeason').and.returnValue({id:44} as any);
    component.sprintBrackets=[bracket];
    component.editSprintOfficialPositions(53,8);
    expect(component.sprintPositionsFirstRider).toBe('');
    expect(component.sprintPositionsSecondRider).toBe('');
    expect(component.sprintPositionsPanelConfirmed).toBeFalse();
    component.sprintPositionsReference='Synthetic second panel positions record 2026/402';
    component.sprintPositionsReason='Commissaires officially place rider 24 ahead at the incident';
    const save=jasmine.createSpy('ratifySprintIncidentPositions')
      .and.returnValue(of({...incident,status:'OFFICIAL_POSITIONS'}));
    (component as any).communityService={ratifySprintIncidentPositions:save};
    spyOn<any>(component,'loadSprintBrackets').and.stub();
    component.saveSprintOfficialPositions();
    expect(save).not.toHaveBeenCalled();
    component.sprintPositionsFirstRider='r24';
    component.sprintPositionsSecondRider='r24';
    component.sprintPositionsPanelConfirmed=true;
    component.saveSprintOfficialPositions();
    expect(save).not.toHaveBeenCalled();
    component.sprintPositionsSecondRider='r1';
    component.sprintPositionsReference=incident.decisionReference;
    component.saveSprintOfficialPositions();
    expect(save).not.toHaveBeenCalled();
    component.sprintPositionsReference='Synthetic second panel positions record 2026/402';
    component.saveSprintOfficialPositions();
    expect(save).toHaveBeenCalledWith(12,44,53,8,jasmine.objectContaining({
      orderedRiders:['r24','r1'],panelPositionsConfirmed:true
    }));
    const prev=localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language','pt');
      expect(t('communities.trackCycling.positionsNoRace')).toContain('não foi disputada');
      localStorage.setItem('d24-language','en');
      expect(t('communities.trackCycling.positionsNoRace')).toContain('no additional heat');
    } finally {
      if(prev===null)localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language',prev);
    }
  });

  it('requires explicit non-fault rider, inside/outside choice and second record', () => {
    const incident={
      id:8,seriesKey:'SP53-A1',heatNumber:1,incidentType:'FALL',
      status:'FAULT_START_PENDING',decisionType:'UNINTENTIONAL_FALL',
      decisionReference:'Synthetic first panel finding 2026/601'
    };
    const bracket={
      id:53,format:'OLYMPIC_TWENTY_FOUR_REPECHAGE',interruption:null,
      matches:[{seriesKey:'SP53-A1',riderA:'r1',riderB:'r24',
        riderC:null,riderD:null,status:'READY',winner:null}],
      incidents:[incident]
    } as any;
    expect(component.sprintCanConfirmFaultStart(bracket,incident as any)).toBeTrue();
    expect(component.sprintCanConfirmFaultStart(bracket,{
      ...incident,status:'RESTART_PENDING'
    } as any)).toBeFalse();
    expect(component.sprintCanConfirmFaultStart({...bracket,matches:[
      {...bracket.matches[0],riderC:'r3'}]},incident as any)).toBeFalse();

    component.selected={id:12} as any;
    component.selectedSeasonId=44;
    spyOn(component,'activeSeason').and.returnValue({id:44} as any);
    component.sprintBrackets=[bracket];
    component.editSprintFaultStart(53,8);
    expect(component.sprintFaultRider).toBe('');
    expect(component.sprintFaultStartPosition).toBe('');
    expect(component.sprintFaultChoiceConfirmed).toBeFalse();
    component.sprintFaultReference='Synthetic second panel record 2026/602';
    component.sprintFaultReason='The rider not at fault expressly chooses the outside starting position';
    const save=jasmine.createSpy('confirmUnintentionalFallStart')
      .and.returnValue(of({...incident,status:'FAULT_START_OK'}));
    (component as any).communityService={confirmUnintentionalFallStart:save};
    spyOn<any>(component,'loadSprintBrackets').and.stub();
    component.saveSprintFaultStart();
    expect(save).not.toHaveBeenCalled();
    component.sprintFaultRider='r1';
    component.sprintFaultStartPosition='OUTSIDE';
    component.saveSprintFaultStart();
    expect(save).not.toHaveBeenCalled();
    expect(component.sprintNonFaultRider(bracket,incident as any)).toBe('r24');
    component.sprintFaultChoiceConfirmed=true;
    component.sprintFaultReference=incident.decisionReference;
    component.saveSprintFaultStart();
    expect(save).not.toHaveBeenCalled();
    component.sprintFaultReference='Synthetic second panel record 2026/602';
    component.saveSprintFaultStart();
    expect(save).toHaveBeenCalledWith(12,44,53,8,jasmine.objectContaining({
      faultRider:'r1',nonFaultRider:'r24',nonFaultStartPosition:'OUTSIDE',
      nonFaultChoiceConfirmed:true
    }));
    const prior=localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language','pt');
      expect(t('communities.trackCycling.faultPendingNotice')).toContain('ciclista sem culpa');
      localStorage.setItem('d24-language','en');
      expect(t('communities.trackCycling.faultPendingNotice')).toContain('not at fault');
    } finally {
      if(prior===null)localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language',prior);
    }
  });


  it('documents UCI pre-sprint contact before unlocking a two-up heat', () => {
    const incident={
      id:9,seriesKey:'SP53-A1',heatNumber:1,
      incidentType:'PRE_SPRINT_OPPONENT_CONTACT',
      status:'FAULT_START_PENDING',decisionType:'PRE_SPRINT_RESTART',
      decisionReference:'First pre sprint official report 2026/701'
    };
    const bracket={
      id:53,format:'OLYMPIC_TWENTY_FOUR_REPECHAGE',interruption:null,
      matches:[{seriesKey:'SP53-A1',riderA:'r1',riderB:'r24',
        riderC:null,riderD:null,status:'READY',winner:null}],
      incidents:[incident]
    } as any;
    expect(component.sprintIsPreSprintIncident(incident as any)).toBeTrue();
    expect(component.sprintCanConfirmFaultStart(bracket,incident as any)).toBeTrue();
    expect(component.sprintCanConfirmFaultStart({...bracket,matches:[
      {...bracket.matches[0],riderC:'r3'}]},incident as any)).toBeFalse();
    expect(component.sprintCanConfirmFaultStart(bracket,{
      ...incident,decisionType:'UNINTENTIONAL_FALL'
    } as any)).toBeFalse();
    component.selected={id:12} as any;
    component.selectedSeasonId=44;
    spyOn(component,'activeSeason').and.returnValue({id:44} as any);
    component.sprintBrackets=[bracket];
    component.editSprintDecision(53,9);
    expect(component.sprintDecisionType).toBe('PRE_SPRINT_RESTART');
    component.editSprintFaultStart(53,9);
    expect(component.sprintFaultRider).toBe('');
    expect(component.sprintFaultStartPosition).toBe('');
    expect(component.sprintPreSprintBeforeConfirmed).toBeFalse();
    expect(component.sprintPreSprintStoppedConfirmed).toBeFalse();
    component.sprintFaultReference='Independent second pre sprint record 2026/702';
    component.sprintFaultReason='The non-fault rider explicitly chooses inside after the starter stops';
    component.sprintFaultRider='r1';
    component.sprintFaultStartPosition='INSIDE';
    component.sprintFaultChoiceConfirmed=true;
    const choice=jasmine.createSpy('confirmPreSprintStart')
      .and.returnValue(of({...incident,status:'FAULT_START_OK'}));
    (component as any).communityService={confirmPreSprintStart:choice};
    spyOn<any>(component,'loadSprintBrackets').and.stub();
    component.saveSprintFaultStart();
    expect(choice).not.toHaveBeenCalled();
    component.sprintPreSprintBeforeConfirmed=true;
    component.saveSprintFaultStart();
    expect(choice).not.toHaveBeenCalled();
    component.sprintPreSprintStoppedConfirmed=true;
    component.sprintFaultReference=incident.decisionReference;
    component.saveSprintFaultStart();
    expect(choice).not.toHaveBeenCalled();
    component.sprintFaultReference='Independent second pre sprint record 2026/702';
    component.saveSprintFaultStart();
    expect(choice).toHaveBeenCalledWith(12,44,53,9,jasmine.objectContaining({
      incidentRider:'r1',nonFaultRider:'r24',nonFaultStartPosition:'INSIDE',
      nonFaultChoiceConfirmed:true,beforeSprintConfirmed:true,starterStoppedConfirmed:true
    }));
    const prior=localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language','pt');
      expect(t('communities.trackCycling.preSprintPending')).toContain('ciclista sem culpa');
      localStorage.setItem('d24-language','en');
      expect(t('communities.trackCycling.preSprintPending')).toContain('non-fault');
    } finally {
      if(prior===null)localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language',prior);
    }
  });


  it('guards UCI 3.2.048(4) rulings and requires a separate non-fault start choice', () => {
    const incident={
      id:10,seriesKey:'SP53-A1',heatNumber:1,
      incidentType:'FLAGRANT_BEFORE_BELL',status:'PENDING',decisionType:null,
      decisionReference:null
    };
    const bracket={
      id:53,format:'OLYMPIC_TWENTY_FOUR_REPECHAGE',interruption:null,
      matches:[{seriesKey:'SP53-A1',riderA:'r1',riderB:'r24',
        riderC:null,riderD:null,status:'READY',winner:null}],
      incidents:[incident]
    } as any;
    component.selected={id:12} as any;
    component.selectedSeasonId=44;
    spyOn(component,'activeSeason').and.returnValue({id:44} as any);
    component.sprintBrackets=[bracket];
    component.editSprintDecision(53,10);
    expect(component.sprintFlagrantOffender).toBe('');
    expect(component.sprintFlagrantSanction).toBe('');
    expect(component.sprintFlagrantCutoffConfirmed).toBeFalse();
    expect(component.sprintFlagrantStarterConfirmed).toBeFalse();
    component.sprintDecisionReference='Fictional first panel ruling 2026/801';
    component.sprintDecisionReason='Starter stopped a flagrant infringement before the bell';
    const first=jasmine.createSpy('ruleFlagrantSprintIncident')
      .and.returnValue(of({...incident,status:'FLAGRANT_START_PENDING'}));
    const second=jasmine.createSpy('confirmFlagrantNoSanctionStart')
      .and.returnValue(of({...incident,status:'FLAGRANT_START_OK'}));
    (component as any).communityService={
      ruleFlagrantSprintIncident:first,confirmFlagrantNoSanctionStart:second
    };
    spyOn<any>(component,'loadSprintBrackets').and.stub();
    component.saveSprintDecision();
    expect(first).not.toHaveBeenCalled();
    component.sprintFlagrantOffender='r1';
    component.sprintFlagrantSanction='NONE';
    component.saveSprintDecision();
    expect(first).not.toHaveBeenCalled();
    component.sprintFlagrantCutoffConfirmed=true;
    component.saveSprintDecision();
    expect(first).not.toHaveBeenCalled();
    component.sprintFlagrantStarterConfirmed=true;
    component.saveSprintDecision();
    expect(first).toHaveBeenCalledWith(12,44,53,10,jasmine.objectContaining({
      offendingRider:'r1',sanction:'NONE',
      beforeBellOrSprintConfirmed:true,starterStoppedConfirmed:true
    }));
    const pending={...incident,status:'FLAGRANT_START_PENDING',
      decisionType:'FLAGRANT_RULING',decisionReference:'Fictional first panel ruling 2026/801',
      flagrantOffendingRider:'r1',flagrantBeforeCutoffConfirmed:true,
      flagrantStarterStoppedConfirmed:true};
    bracket.incidents=[pending];
    expect(component.sprintCanConfirmFlagrantStart(bracket,pending as any)).toBeTrue();
    expect(component.sprintCanConfirmFlagrantStart({...bracket,
      matches:[{...bracket.matches[0],riderC:'r3'}]},pending as any)).toBeFalse();
    expect(component.sprintCanConfirmFlagrantStart(bracket,{
      ...pending,status:'ADJUDICATION_REQUIRED',sanctionType:'RELEGATION'
    } as any)).toBeFalse();
    component.editSprintFlagrantStart(53,10);
    expect(component.sprintFlagrantStartPosition).toBe('');
    expect(component.sprintFlagrantStartChoiceConfirmed).toBeFalse();
    component.sprintFlagrantStartPosition='OUTSIDE';
    component.sprintFlagrantStartChoiceConfirmed=true;
    component.sprintFlagrantStartReference=pending.decisionReference;
    component.sprintFlagrantStartReason='The rider not at fault chooses the outer starting position';
    component.saveSprintFlagrantStart();
    expect(second).not.toHaveBeenCalled();
    component.sprintFlagrantStartReference='Distinct second panel record 2026/802';
    component.saveSprintFlagrantStart();
    expect(second).toHaveBeenCalledWith(12,44,53,10,jasmine.objectContaining({
      nonFaultRider:'r24',nonFaultStartPosition:'OUTSIDE',nonFaultChoiceConfirmed:true
    }));
    const prior=localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language','pt');
      expect(t('communities.trackCycling.flagrantPending')).toContain('adversário');
      localStorage.setItem('d24-language','en');
      expect(t('communities.trackCycling.flagrantPending')).toContain('opponent');
    } finally {
      if(prior===null)localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language',prior);
    }
  });

  it('requires a separate neutral-mishap restart and cannot invent a Sprint winner', () => {
    const bracket={
      id:53,format:'OLYMPIC_TWENTY_FOUR_REPECHAGE',interruption:null,
      matches:[{seriesKey:'SP53-A1',riderA:'r1',riderB:'r24',riderC:null,
        riderD:null,status:'READY',winner:null}],
      incidents:[{id:7,seriesKey:'SP53-A1',heatNumber:1,
        incidentType:'PUNCTURE',decisionType:'RESTART_REQUIRED',
        status:'RESTART_PENDING'}]
    } as any;
    const incident=bracket.incidents[0];
    expect(component.sprintCanAuthorizeNeutralRestart(bracket,incident)).toBeTrue();
    expect(component.sprintCanAuthorizeNeutralRestart(bracket,{
      ...incident,status:'POSITIONS_PENDING'
    })).toBeFalse();
    expect(component.sprintCanAuthorizeNeutralRestart(bracket,{
      ...incident,incidentType:'RULE_INFRINGEMENT'
    })).toBeFalse();
    expect(component.sprintCanAuthorizeNeutralRestart({...bracket,
      matches:[{...bracket.matches[0],riderC:'r9'}]},incident)).toBeFalse();
    expect(component.sprintNeutralCause(incident)).toBe('PUNCTURE');
    expect(component.sprintNeutralCause({...incident,incidentType:'FALL'}))
      .toBe('NO_FAULT_FALL');
    expect(component.sprintNeutralCause({...incident,incidentType:'BICYCLE_DEFECT'}))
      .toBe('ESSENTIAL_BICYCLE_BREAKAGE');

    component.selected={id:12} as any;
    component.selectedSeasonId=44;
    spyOn(component,'activeSeason').and.returnValue({id:44} as any);
    component.sprintBrackets=[bracket];
    component.sprintNeutralBracketId=53;
    component.sprintNeutralIncidentId=7;
    component.sprintNeutralReference='Second documented panel ruling 2026/84';
    component.sprintNeutralReason='Panel explicitly authorizes a neutral restart in original order';
    component.sprintNeutralNoFaultConfirmed=false;
    component.sprintNeutralOrderConfirmed=false;
    component.sprintIncidentSaving=false;
    const save=jasmine.createSpy('authorizeNeutralSprintRestart')
      .and.returnValue(of({...incident,status:'NEUTRAL_RESTART_OK'}));
    (component as any).communityService={authorizeNeutralSprintRestart:save};
    spyOn<any>(component,'loadSprintBrackets').and.stub();
    component.saveSprintNeutralRestart();
    expect(save).not.toHaveBeenCalled();
    component.sprintNeutralNoFaultConfirmed=true;
    component.saveSprintNeutralRestart();
    expect(save).not.toHaveBeenCalled();
    component.sprintNeutralOrderConfirmed=true;
    component.saveSprintNeutralRestart();
    expect(save).toHaveBeenCalledWith(12,44,53,7,jasmine.objectContaining({
      cause:'PUNCTURE',orderedRiders:['r1','r24'],noFaultConfirmed:true
    }));
    const original=localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language','pt');
      expect(t('communities.trackCycling.neutralNoWinner')).toContain('Não atribui vencedor');
      localStorage.setItem('d24-language','en');
      expect(t('communities.trackCycling.neutralNoWinner')).toContain('Does not assign a winner');
    } finally {
      if(original===null)localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language',original);
    }
  });

  it('keeps overturned BO3 closed until explicit continuation with real riders and heat', () => {
    component.selected={id:12} as any;
    component.selectedSeasonId=44;
    spyOn(component,'activeSeason').and.returnValue({id:44} as any);
    component.sprintBrackets=[{
      id:53,
      incidents:[{id:7,seriesKey:'SP53-Q2',heatNumber:1,
        status:'OFFICIAL_SERIES_AWARDED'}],
      matches:[{seriesKey:'SP53-Q2',riderA:'r1',riderB:'r24',
        status:'READY',winner:null}]
    } as any];
    component.sprintReviewBracketId=53;
    component.sprintReviewIncidentId=7;
    component.sprintReviewHistory=[{
      id:101,incidentId:7,action:'OVERTURNED',
      officialName:'Fictional President',
      officialReference:'Synthetic official chair revocation 2026/111',
      panelReference:'Synthetic panel review 2026/110',
      reason:'The series result is overturned',
      recordedBy:'fixture_owner',recordedAt:'2026-10-26T00:00:00Z'
    }];
    component.sprintReviewMode='RECTIFY';
    component.sprintReviewPresident='Fictional President';
    component.sprintReviewReference='Synthetic new continuation document 2026/112';
    component.sprintReviewReason='Both riders can continue after a recorded annulment';
    const write=jasmine.createSpy('rectifySprintOfficialReview')
      .and.returnValue(of({action:'RECTIFIED'}));
    (component as any).communityService={rectifySprintOfficialReview:write};
    spyOn<any>(component,'loadSprintReviewHistory').and.stub();
    spyOn<any>(component,'loadSprintBrackets').and.stub();

    // Neither cyclist order nor reinstatement nor next heat may be assumed.
    component.saveSprintReview();
    expect(write).not.toHaveBeenCalled();
    component.sprintReviewSanctionAnnulledConfirmed=true;
    component.sprintReviewRiderOrderConfirmed=true;
    component.saveSprintReview();
    expect(write).not.toHaveBeenCalled();
    component.sprintReviewNextHeatNumber=1;
    component.saveSprintReview();
    expect(write).toHaveBeenCalledWith(12,44,53,7,jasmine.objectContaining({
      orderedRiders:['r1','r24'],nextHeatNumber:1,
      overturnedDecisionReference:'Synthetic official chair revocation 2026/111',
      sanctionAnnulledByPresident:true
    }));
    const current=localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language','pt');
      expect(t('communities.trackCycling.rectifyNoFake')).toContain('Sem nova vitória');
      localStorage.setItem('d24-language','en');
      expect(t('communities.trackCycling.rectifyNoFake')).toContain('No winner');
    } finally {
      if(current===null)localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language',current);
    }
  });

  it('requires a documented full-series decision for BO3 disqualification', () => {
    const bracket={format:'OLYMPIC_TWENTY_FOUR_REPECHAGE',interruption:null,
      matches:[{seriesKey:'SP53-Q1',status:'IN_PROGRESS',
        riderA:'r1',riderB:'r24',riderC:null,riderD:null}]} as any;
    const incident={seriesKey:'SP53-Q1',heatNumber:2,incidentType:'FALL',
      status:'ADJUDICATION_REQUIRED',sanctionType:'DISQUALIFICATION',
      sanctionedUsername:'r24'} as any;
    expect(component.sprintCanConfirmSeriesVerdict(bracket,incident)).toBeTrue();
    expect(component.sprintCanConfirmOfficialAward(bracket,incident)).toBeFalse();
    expect(component.sprintAwardEligibleWinner(bracket,incident)).toBe('r1');
    expect(component.sprintCanConfirmSeriesVerdict(bracket,{
      ...incident,sanctionType:'RELEGATION'})).toBeFalse();
    expect(component.sprintCanConfirmSeriesVerdict(bracket,{
      ...incident,status:'OFFICIAL_SERIES_AWARDED'})).toBeFalse();
    expect(component.sprintCanConfirmSeriesVerdict({...bracket,
      interruption:{stage:'BEFORE_QUARTERS'}},incident)).toBeFalse();
    const previous=localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language','pt');
      expect(t('communities.trackCycling.seriesVerdictExplain')).toContain('desclassificação');
      localStorage.setItem('d24-language','en');
      expect(t('communities.trackCycling.seriesVerdictNoFake')).toContain('awarded the series');
    } finally {
      if(previous===null)localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language',previous);
    }
  });

  it('clears hidden circuit metrics for flying 200m without changing Scratch history', () => {
    component.roundEntries = [
      { lapsCompleted: 3, bestLapSeconds: 10.25 } as any,
      { lapsCompleted: 4, bestLapSeconds: 9.89 } as any
    ];
    component.roundEventTypeDraft = 'TRACK_SCRATCH';
    component.onRoundEventTypeChange();
    expect(component.roundEntries[0].lapsCompleted).toBe(3);
    component.roundEventTypeDraft = 'TRACK_FLYING_200';
    component.onRoundEventTypeChange();
    expect(component.roundEntries.map(e => [e.lapsCompleted, e.bestLapSeconds]))
      .toEqual([[null, null], [null, null]]);
  });

  it('detects uploaded GIF avatars even with CDN query strings or a fragment', () => {
    expect(component.isAnimatedCommunityAvatar('https://cdn.jynlo.test/communities/8/avatar.gif')).toBeTrue();
    expect(component.isAnimatedCommunityAvatar('/media/communities/8/avatar.GIF?v=2')).toBeTrue();
    expect(component.isAnimatedCommunityAvatar('https://cdn.jynlo.test/a.gif#asset')).toBeTrue();
  });

  it('leaves static photos, missing photos and non-GIF paths using their existing crop', () => {
    expect(component.isAnimatedCommunityAvatar('https://cdn.jynlo.test/avatar.jpg')).toBeFalse();
    expect(component.isAnimatedCommunityAvatar('https://cdn.jynlo.test/avatar.webp?v=3')).toBeFalse();
    expect(component.isAnimatedCommunityAvatar(null)).toBeFalse();
    expect(component.isAnimatedCommunityAvatar(undefined)).toBeFalse();
    expect(component.isAnimatedCommunityAvatar('https://cdn.jynlo.test/avatar.gif.backup')).toBeFalse();
  });

  it('uses the active season ID rather than the selected historical season for new rounds', () => {
    component.selectedSeasonId = 17;
    component.competition = { seasons: [
      { id: 44, name: 'Época atual', active: true, sport: 'Futsal' }
    ] } as any;
    expect(component.roundTargetSeasonId).toBe(44);
    expect(component.selectedSeasonId).toBe(17);
    component.competition = { seasons: [] } as any;
    expect(component.roundTargetSeasonId).toBeNull();
  });

  it('restricts new round sports to the active sport-tagged season', () => {
    component.selected = { id: 7, sport: 'Futebol',
      sports: ['Futebol', 'Ténis', 'Karting'] } as any;
    component.roundSportDraft = 'Karting';
    component.competition = { seasons: [
      { id: 44, name: 'Época de Ténis', sport: 'Tenis', active: true }
    ] } as any;
    expect(component.communityRoundSports).toEqual(['Futebol', 'Ténis', 'Karting']);
    expect(component.roundEligibleSports).toEqual(['Ténis']);
    expect(component.newRoundSport).toBe('Ténis');
  });

  it('retains all declared sports when the active season is shared', () => {
    component.selected = { id: 7, sport: 'Futebol',
      sports: ['Futebol', 'Ténis'] } as any;
    component.roundSportDraft = 'Ténis';
    component.competition = { seasons: [
      { id: 44, name: 'Época partilhada', sport: null, active: true }
    ] } as any;
    expect(component.roundEligibleSports).toEqual(['Futebol', 'Ténis']);
    expect(component.newRoundSport).toBe('Ténis');
  });

  it('routes new rounds to the correct active sport season without guessing', () => {
    component.selected = { id: 7, sport: 'Futebol',
      sports: ['Futebol', 'Ténis', 'Karting'] } as any;
    component.competition = { seasons: [
      { id: 44, name: 'Época Futebol', sport: 'Futebol', active: true },
      { id: 45, name: 'Época Karting', sport: 'Karting', active: true }
    ] } as any;
    expect(component.roundEligibleSports).toEqual(['Futebol', 'Ténis', 'Karting']);
    component.roundSportDraft = 'Karting';
    expect(component.roundTargetSeasonId).toBe(45);
    component.roundSportDraft = 'Ténis';
    expect(component.roundTargetSeasonId).toBeNull();
    component.roundSportDraft = 'Futebol';
    expect(component.roundTargetSeasonId).toBe(44);
    expect(component.canCreateAdditionalSeason).toBeTrue();
  });

  it('excludes sports with active seasons from the create-season selector', () => {
    component.selected = { id: 7, sport: 'Futebol',
      sports: ['Futebol', 'Ténis', 'Karting'] } as any;
    component.competition = { seasons: [
      { id: 44, name: 'Futebol 2026', sport: 'futebol', active: true },
      { id: 45, name: 'Ténis 2026', sport: 'Tenis', active: true }
    ] } as any;
    expect(component.availableSeasonSports).toEqual(['Karting']);
    expect(component.canCreateAdditionalSeason).toBeTrue();
    component.competition = { seasons: [
      { id: 44, name: 'Partilhada', sport: null, active: true }
    ] } as any;
    expect(component.availableSeasonSports).toEqual([]);
    expect(component.canCreateAdditionalSeason).toBeFalse();
  });

  it('restores the season selector after a tagged season closes', () => {
    component.selected = { id: 7, sport: 'Futebol',
      sports: ['Futebol', 'Karting'] } as any;
    component.competition = { seasons: [
      { id: 44, name: 'Futebol 2026', sport: 'Futebol', active: false },
      { id: 45, name: 'Karting 2026', sport: 'Karting', active: true }
    ] } as any;
    expect(component.availableSeasonSports).toEqual(['Futebol']);
    expect(component.canCreateAdditionalSeason).toBeTrue();
  });

  it('confirms closing only the requested active sport season', () => {
    component.competition = { seasons: [
      { id: 44, name: 'Futebol', sport: 'Futebol', active: true },
      { id: 45, name: 'Karting', sport: 'Karting', active: true },
      { id: 46, name: 'Ténis', sport: 'Ténis', active: false }
    ] } as any;
    component.requestCloseSeason(45);
    expect(component.closeSeasonConfirming).toBeTrue();
    expect(component.closingSeasonId).toBe(45);
    component.requestCloseSeason(46);
    expect(component.closingSeasonId).toBe(45);
    component.cancelCloseSeason();
    expect(component.closeSeasonConfirming).toBeFalse();
    expect(component.closingSeasonId).toBeNull();
    component.requestCloseSeason(44);
    expect(component.closingSeasonId).toBe(44);
  });

  it('ignores a late create-season success after navigating to another community', () => {
    component.selected = { id: 7, sport: 'Futebol', sports: ['Futebol'] } as any;
    component.competition = { seasons: [] } as any;
    component.seasonName = '2026/27';
    component.seasonSport = 'Futebol';
    component.seasonStartsAt = '';
    component.seasonSaving = false;
    const oldResponse = new Subject<any>();
    const createSeason = jasmine.createSpy('createSeason').and.returnValue(oldResponse.asObservable());
    (component as any).communityService = { createSeason };
    const reload = spyOn(component, 'loadCompetition');

    component.createSeason();
    expect(createSeason).toHaveBeenCalledOnceWith(7, {
      name: '2026/27', startsAt: null, sport: 'Futebol'
    });
    expect(component.seasonSaving).toBeTrue();

    (component as any).resetSeasonManagementState();
    component.selected = { id: 8, sport: 'Karting', sports: ['Karting'] } as any;
    component.seasonName = 'Época Karting';
    component.selectedSeasonId = 45;

    oldResponse.next({ id: 44, name: '2026/27' });
    oldResponse.complete();
    expect(component.seasonSaving).toBeFalse();
    expect(component.seasonName).toBe('Época Karting');
    expect(component.selectedSeasonId).toBe(45);
    expect(reload).not.toHaveBeenCalled();
  });

  it('ignores a late create-season error after changing the community', () => {
    component.selected = { id: 7, sport: 'Futebol', sports: ['Futebol'] } as any;
    component.competition = { seasons: [] } as any;
    component.seasonName = '2026/27';
    component.seasonSport = 'Futebol';
    component.seasonStartsAt = '';
    component.seasonSaving = false;
    const oldResponse = new Subject<any>();
    (component as any).communityService = {
      createSeason: jasmine.createSpy('createSeason').and.returnValue(oldResponse.asObservable())
    };
    component.createSeason();
    (component as any).resetSeasonManagementState();
    component.selected = { id: 8, sport: 'Karting' } as any;
    component.errorMessage = '';
    oldResponse.error({ error: { message: 'Erro da comunidade antiga' } });
    expect(component.errorMessage).toBe('');
    expect(component.seasonSaving).toBeFalse();
  });

  it('ignores late rename results and does not unlock a newer season operation', () => {
    component.selected = { id: 7, sport: 'Futebol' } as any;
    component.seasonActionSaving = false;
    const oldResponse = new Subject<any>();
    const newResponse = new Subject<any>();
    const renameSeason = jasmine.createSpy('renameSeason').and.returnValues(
      oldResponse.asObservable(), newResponse.asObservable());
    (component as any).communityService = { renameSeason };
    const reload = spyOn(component, 'loadCompetition');

    const oldSeason = { id: 44, name: 'Época antiga' } as any;
    component.editSeason(oldSeason);
    component.editingSeasonName = 'Primeiro nome';
    component.saveSeasonName(oldSeason);

    (component as any).resetSeasonManagementState();
    component.selected = { id: 8, sport: 'Karting' } as any;
    const newSeason = { id: 45, name: 'Nova época' } as any;
    component.editSeason(newSeason);
    component.editingSeasonName = 'Segundo nome';
    component.saveSeasonName(newSeason);
    expect(component.seasonActionSaving).toBeTrue();

    oldResponse.next(oldSeason);
    oldResponse.complete();
    expect(component.seasonActionSaving).toBeTrue();
    expect(component.editingSeasonId).toBe(45);
    expect(reload).not.toHaveBeenCalled();

    newResponse.next(newSeason);
    newResponse.complete();
    expect(component.seasonActionSaving).toBeFalse();
    expect(component.editingSeasonId).toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ignores late delete responses after leaving the previous community', () => {
    component.selected = { id: 7, sport: 'Futebol' } as any;
    component.seasonActionSaving = false;
    const response = new Subject<any>();
    const deleteSeason = jasmine.createSpy('deleteSeason').and.returnValue(response.asObservable());
    (component as any).communityService = { deleteSeason };
    const reload = spyOn(component, 'loadCompetition');
    component.loadHistoricalLinks = jasmine.createSpy('loadHistoricalLinks');
    const season = { id: 44, name: 'Época antiga' } as any;

    component.requestDeleteSeason(season);
    component.seasonDeleteAcknowledged = true;
    component.confirmDeleteSeason(season);
    expect(deleteSeason).toHaveBeenCalledOnceWith(7, 44);

    (component as any).resetSeasonManagementState();
    component.selected = { id: 8, sport: 'Karting' } as any;
    component.selectedSeasonId = 45;
    response.next(undefined);
    response.complete();
    expect(component.selectedSeasonId).toBe(45);
    expect(component.deletingSeasonId).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    expect(component.loadHistoricalLinks).not.toHaveBeenCalled();
  });

  it('ignores a late season-close response after switching communities', () => {
    component.selected = { id: 7, sport: 'Futebol' } as any;
    component.competition = { seasons: [
      { id: 44, name: 'Futebol 2026', sport: 'Futebol', active: true }
    ] } as any;
    component.seasonSaving = false;
    component.selectedSeasonId = 44;
    const response = new Subject<any>();
    const closeSeason = jasmine.createSpy('closeSeason').and.returnValue(response.asObservable());
    (component as any).communityService = { closeSeason };
    const reload = spyOn(component, 'loadCompetition');
    component.requestCloseSeason(44);
    component.closeActiveSeason(44);
    expect(closeSeason).toHaveBeenCalledOnceWith(7, 44);
    component.selected = { id: 8, sport: 'Karting' } as any;
    component.selectedSeasonId = null;
    component.cancelCloseSeason();
    response.next({ id: 44, active: false });
    response.complete();
    expect(component.selectedSeasonId).toBeNull();
    expect(component.closingSeasonId).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it('allows editing scoring rules for the selected active season with multiple sports', () => {
    component.selected = { id: 7, sport: 'Futebol',
      sports: ['Futebol', 'Karting'], ownerUsername: 'owner' } as any;
    component.competition = { activeSeasonId: null, seasons: [
      { id: 44, name: 'Futebol 2026', sport: 'Futebol', active: true },
      { id: 45, name: 'Karting 2026', sport: 'Karting', active: true },
      { id: 46, name: 'Futebol 2025', sport: 'Futebol', active: false }
    ] } as any;
    component.selectedSeasonId = 44;
    expect(component.canEditSportPoints('Futebol')).toBeTrue();
    expect(component.canManageRaceChampionship()).toBeTrue();
    component.selectedSeasonId = 46;
    expect(component.canEditSportPoints('Futebol')).toBeFalse();
    expect(component.canManageRaceChampionship()).toBeFalse();
    component.selectedSeasonId = null;
    expect(component.canEditSportPoints('Futebol')).toBeFalse();
    expect(component.canManageRaceChampionship()).toBeFalse();
  });

  it('only shows cycling brackets for a cycling or legacy shared selected season', () => {
    component.selected = { id: 7, sport: 'Futebol',
      sports: ['Futebol', 'Ciclismo de Pista'] } as any;
    component.competition = { seasons: [
      { id: 44, name: 'Futebol', sport: 'Futebol', active: true },
      { id: 45, name: 'Pista', sport: 'Ciclismo de Pista', active: true },
      { id: 46, name: 'Antiga', sport: null, active: false }
    ] } as any;
    component.selectedSeasonId = 44;
    expect(component.selectedSeasonSupportsSport('Ciclismo de Pista')).toBeFalse();
    component.selectedSeasonId = 45;
    expect(component.selectedSeasonSupportsSport('Ciclismo de Pista')).toBeTrue();
    component.selectedSeasonId = 46;
    expect(component.selectedSeasonSupportsSport('Ciclismo de Pista')).toBeTrue();
    component.selectedSeasonId = null;
    expect(component.selectedSeasonSupportsSport('Ciclismo de Pista')).toBeFalse();
  });

  it('labels imported seasons by sport without assigning one to shared history', () => {
    const season = { id: 44, name: '2026/27', sport: 'Karting', active: true } as any;
    const label = component.seasonOptionLabel(season);
    expect(label).toContain('Karting · 2026/27');
    expect(label).toContain(t('communities.activeShort'));
    expect(component.seasonOptionLabel({ ...season, sport: null, active: false }))
      .toBe('2026/27');
  });

  it('selects the Excel import destination by sport with parallel active seasons', () => {
    component.selected = { id: 7, sport: 'Futebol',
      sports: ['Futebol', 'Ténis', 'Karting'] } as any;
    component.competition = { activeSeasonId: null, seasons: [
      { id: 44, name: 'Futebol 2026', sport: 'Futebol', active: true },
      { id: 45, name: 'Karting 2026', sport: 'Karting', active: true },
      { id: 40, name: 'Futebol 2025', sport: 'Futebol', active: false }
    ] } as any;
    component.selectedSeasonId = 40;
    component.importSeasonId = null;
    component.importSportDraft = 'Karting';
    expect(component.importDestinationSeasonId).toBe(45);
    component.importSportDraft = 'Ténis';
    expect(component.importDestinationSeasonId).toBeNull();
    component.importSportDraft = '';
    expect(component.importDestinationSeasonId).toBeNull();
    component.selectImportSeason(40);
    expect(component.importDestinationSeasonId).toBeNull();
    component.selectImportSeason(45);
    component.importSportDraft = 'Karting';
    expect(component.importDestinationSeasonId).toBe(45);
  });

  it('does not auto-import an unrelated sport into the only active tagged season', () => {
    component.selected = { id: 7, sports: ['Futebol', 'Karting'] } as any;
    component.competition = { seasons: [
      { id: 44, name: 'Futebol 2026', sport: 'Futebol', active: true }
    ] } as any;
    component.importSeasonId = null;
    component.importSportDraft = 'Karting';
    expect(component.importDestinationSeasonId).toBeNull();
    component.importSportDraft = 'Futebol';
    expect(component.importDestinationSeasonId).toBe(44);
  });

  it('rejects incompatible manually selected historical Excel seasons', () => {
    component.selected = { id: 7, sports: ['Futebol', 'Karting'] } as any;
    component.competition = { seasons: [
      { id: 11, name: 'Futebol antigo', sport: 'Futebol', active: false },
      { id: 12, name: 'Partilhada antiga', sport: null, active: false }
    ] } as any;
    component.importSportDraft = 'Karting';
    component.selectImportSeason(11);
    expect(component.importDestinationSeasonId).toBeNull();
    component.selectImportSeason(12);
    expect(component.importDestinationSeasonId).toBe(12);
    component.importSportDraft = 'Futebol';
    component.selectImportSeason(11);
    expect(component.importDestinationSeasonId).toBe(11);
    component.selectImportSeason(9999);
    expect(component.importDestinationSeasonId).toBeNull();
  });

  it('limits all ranking panels to the sport of the selected season', () => {
    component.selected = { id: 7, sport: 'Futebol',
      sports: ['Futebol', 'Karting', 'Ténis', 'Natação'] } as any;
    component.competition = { seasons: [
      { id: 44, name: 'Karting 2026', sport: 'Karting', active: true },
      { id: 45, name: 'Ténis 2026', sport: 'Ténis', active: true },
      { id: 46, name: 'Partilhada', sport: null, active: false }
    ], sportStandings: [
      { sport: 'Futebol', standings: [] },
      { sport: 'Ténis', standings: [] }
    ], raceStandings: [
      { sport: 'Karting', rule: null, standings: [] }
    ], racketStandings: [
      { sport: 'Ténis', matchFormat: 'SINGLES', standings: [] }
    ] } as any;
    component.selectedSeasonId = 44;
    expect(component.rankingContextSports).toEqual(['Karting']);
    expect(component.scopedMatchRankingGroups).toEqual([]);
    expect(component.showLegacyMatchRanking).toBeFalse();
    expect(component.raceRankingGroups.map(group => group.sport)).toEqual(['Karting']);
    expect(component.racketRankingGroups).toEqual([]);
    expect(component.specializedStatsUnavailableSports).toEqual([]);
    expect(component.usesMatchPointsModel()).toBeFalse();

    component.selectedSeasonId = 45;
    expect(component.rankingContextSports).toEqual(['Ténis']);
    expect(component.canEditSportPoints('Futebol')).toBeFalse();
    expect(component.raceRankingGroups).toEqual([]);
    expect(component.racketRankingGroups.map(group => group.sport)).toEqual(['Ténis']);
    expect(component.scopedMatchRankingGroups.map(group => group.sport)).toEqual(['Ténis']);
    expect(component.usesMatchPointsModel()).toBeTrue();

    component.selectedSeasonId = 46;
    expect(component.rankingContextSports).toEqual(['Futebol', 'Karting', 'Ténis', 'Natação']);
    component.selectedSeasonId = null;
    expect(component.rankingContextSports).toEqual(['Futebol', 'Karting', 'Ténis', 'Natação']);
  });

  it('uses typed Karting rounds to scope a legacy season without sport metadata', () => {
    component.selected = { id: 7, sport: 'Futebol',
      sports: ['Futebol', 'Karting'] } as any;
    component.selectedSeasonId = 77;
    component.competition = {
      seasons: [{ id: 77, name: 'Karting QA', active: true }],
      rounds: [{ id: 1, name: 'Corrida QA', sport: 'Karting', entries: [] }],
      raceStandings: [{ sport: 'Karting', rule: { pointsByPlace: [25,18,15] },
        standings: [] }]
    } as any;
    expect(component.rankingContextSports).toEqual(['Karting']);
    expect(component.usesMatchPointsModel()).toBeFalse();
    expect(component.raceRankingGroups.map(group => group.sport)).toEqual(['Karting']);

    // A legacy Football season is still a match-points season.
    component.competition = {
      seasons: [{ id: 77, name: 'Football QA', active: true }],
      rounds: [{ id: 2, name: 'Jogo QA', sport: 'Futebol', entries: [] }]
    } as any;
    expect(component.rankingContextSports).toEqual(['Futebol']);
    expect(component.usesMatchPointsModel()).toBeTrue();

    // Untyped historical rounds must not be guessed to be Karting-only.
    component.competition = {
      seasons: [{ id: 77, name: 'Partilhada antiga', active: true }],
      rounds: [{ id: 3, name: 'Histórico', sport: null, entries: [] }]
    } as any;
    expect(component.rankingContextSports).toEqual(['Futebol', 'Karting']);
  });

  it('normalizes accents for the selected season ranking sport', () => {
    component.selected = { id: 7, sports: ['Ténis', 'Karting'] } as any;
    component.selectedSeasonId = 99;
    component.competition = { seasons: [
      { id: 99, name: 'Ténis', sport: 'tenis', active: true }
    ] } as any;
    expect(component.rankingContextSports).toEqual(['Ténis']);
  });

  it('does not invent leaders for zero-result seasons but preserves real records', () => {
    const zero = { profileId: 5, fullName: 'Sem resultados',
      games: 0, wins: 0, points: 0, goals: 0, assists: 0,
      mvps: 0, cleanSheets: 0, winRate: 0, bestWinStreak: 0 } as any;
    component.competition = { standings: [zero] } as any;
    component.topGoalsStanding = zero;
    component.topAssistsStanding = zero;
    component.topMvpsStanding = zero;
    component.topCleanSheetsStanding = zero;
    component.mostGamesStanding = zero;
    component.bestWinRateStanding = zero;
    component.bestWinStreakStanding = zero;
    expect(component.leader()).toBeUndefined();
    expect(component.topGoals()).toBeUndefined();
    expect(component.topAssists()).toBeUndefined();
    expect(component.topMvps()).toBeUndefined();
    expect(component.topCleanSheets()).toBeUndefined();
    expect(component.mostGames()).toBeUndefined();
    expect(component.bestWinRate()).toBeUndefined();
    expect(component.bestWinStreak()).toBeUndefined();

    const played = { ...zero, games: 3, points: 9, goals: 2, assists: 1,
      mvps: 1, cleanSheets: 1, winRate: 100, bestWinStreak: 3 };
    component.competition = { standings: [played] } as any;
    component.topGoalsStanding = played;
    component.topAssistsStanding = played;
    component.topMvpsStanding = played;
    component.topCleanSheetsStanding = played;
    component.mostGamesStanding = played;
    component.bestWinRateStanding = played;
    component.bestWinStreakStanding = played;
    expect(component.leader()).toBe(played);
    expect(component.topGoals()).toBe(played);
    expect(component.topAssists()).toBe(played);
    expect(component.topMvps()).toBe(played);
    expect(component.topCleanSheets()).toBe(played);
    expect(component.mostGames()).toBe(played);
    expect(component.bestWinRate()).toBe(played);
    expect(component.bestWinStreak()).toBe(played);

    // Imported standings can have points without conventional match counts.
    component.competition = { standings: [{ ...zero, points: 6 }] } as any;
    expect(component.leader()).toBeDefined();
  });

  it('uses race-only statistics for Karting and leaves unsupported sports without football fields', () => {
    component.selected = { id: 7, sport:'Karting', sports:['Karting'] } as any;
    component.competition = { raceStandings: [], standings: [{ games:10,points:42 }] } as any;
    expect(component.usesMatchPointsModel()).toBeFalse();
    expect(component.raceRankingGroups.map(group=>group.sport)).toEqual(['Karting']);
    expect(component.specializedStatsUnavailableSports).toEqual([]);

    component.selected = { id:7, sport:'Natação',
      sports:['Natação','Futebol','Karting','Golfe'] } as any;
    expect(component.usesMatchPointsModel()).toBeTrue();
    expect(component.raceRankingGroups.map(group=>group.sport)).toEqual(['Karting']);
    expect(component.specializedStatsUnavailableSports).toEqual(['Natação','Golfe']);

    component.selected = { id:7, sport:'Atletismo', sports:['Atletismo'] } as any;
    expect(component.usesMatchPointsModel()).toBeFalse();
    expect(component.raceRankingGroups).toEqual([]);
    expect(component.specializedStatsUnavailableSports).toEqual(['Atletismo']);
  });

  it('does not label a race result unavailable when API sport casing differs', () => {
    component.selected = { id: 7, sport: 'Ciclismo de Pista',
      sports: ['Ciclismo de Pista', 'Atletismo'] } as any;
    component.competition = { raceStandings: [
      { sport: 'CICLISMO DE PISTA', rule: null, standings: [] }
    ] } as any;
    expect(component.raceRankingGroups.map(group => group.sport))
      .toEqual(['CICLISMO DE PISTA']);
    expect(component.specializedStatsUnavailableSports).toEqual(['Atletismo']);
  });

  it('shows racket standings only for currently selected community sports', () => {
    component.selected = { id: 7, sport: 'Ténis', sports: ['Ténis', 'Karting'] } as any;
    const group = (sport: string) => ({
      sport, matchFormat: 'SINGLES' as const, standings: []
    });
    component.competition = { racketStandings: [
      group('Tenis'), group('Padel'), group('Karting'), group('Xadrez')
    ] } as any;
    expect(component.racketRankingGroups.map(g => g.sport)).toEqual(['Tenis']);
    component.selected = { id: 7, sport: 'Padel', sports: ['Padel', 'Xadrez'] } as any;
    expect(component.racketRankingGroups.map(g => g.sport)).toEqual(['Padel', 'Xadrez']);
    component.selected = { id: 7, sport: 'Atletismo', sports: ['Atletismo'] } as any;
    expect(component.racketRankingGroups).toEqual([]);
    component.competition = { racketStandings: undefined } as any;
    expect(component.racketRankingGroups).toEqual([]);
  });

  it('allows configuring team points before matches without inventing competitors', () => {
    component.selected = { id: 7, sports: ['Futebol', 'Futsal', 'Karting'],
      sport: 'Futebol' } as any;
    component.selectedSeasonId = 44;
    component.competition = {
      activeSeasonId: 44,
      settings: {winPoints: 3, drawPoints: 1, lossPoints: 0},
      sportStandings: [
        {sport: 'Futebol', standings: [], scoring: {
          sport: 'Futebol', winPoints: 3, drawPoints: 1, lossPoints: 0
        }},
        {sport: 'Futsal', standings: [], scoring: {
          sport: 'Futsal', winPoints: 2, drawPoints: 1, lossPoints: 0
        }}
      ]
    } as any;
    component.sportPointsSaving = false;
    expect(component.scopedMatchRankingGroups.map(g => g.sport)).toEqual(['Futebol', 'Futsal']);
    expect(component.scopedMatchRankingGroups.every(g => g.standings.length === 0)).toBeTrue();
    expect(component.canEditSportPoints('Futsal')).toBeTrue();
    expect(component.canEditSportPoints('Karting')).toBeFalse();
    component.editSportPoints(component.scopedMatchRankingGroups[1]);
    expect(component.sportPointsEditor).toBe('Futsal');
    expect(component.sportPointsDraft).toEqual({winPoints: 2, drawPoints: 1, lossPoints: 0});
  });

  it('does not create a season for a sport removed from a multi-sport community', () => {
    component.selected = { id: 7, sport: 'Futebol', sports: ['Futebol', 'Ténis'] } as any;
    component.seasonName = '2026/27';
    component.seasonSport = 'Karting';
    component.seasonSaving = false;
    const createSeason = jasmine.createSpy('createSeason');
    (component as any).communityService = { createSeason };
    component.createSeason();
    expect(createSeason).not.toHaveBeenCalled();
    expect(component.seasonSaving).toBeFalse();
    expect(component.errorMessage).toBeTruthy();
  });

  it('uses independently-scoped standings when the backend provides them', () => {
    component.selected = { id: 7, sport: 'Futebol',
      sports: ['Futebol', 'Futsal', 'Karting'] } as any;
    const standing = (points: number) => ({
      position: 1, username: 'ana', games: 1, wins: 1, points
    });
    component.competition = {
      standings: [standing(99)],
      sportStandings: [
        { sport: 'Futsal', standings: [standing(3)] },
        { sport: 'Karting', standings: [standing(25)] },
        { sport: 'Futebol', standings: [standing(6)] },
        { sport: 'Padel', standings: [standing(100)] },
        { sport: 'futsal', standings: [standing(8)] }
      ]
    } as any;
    expect(component.hasScopedMatchRankingContract).toBeTrue();
    expect(component.showLegacyAggregateStats).toBeFalse();
    expect(component.showLegacyMatchRanking).toBeFalse();
    expect(component.scopedMatchRankingGroups.map(g => g.sport)).toEqual(['Futsal', 'Futebol']);
    expect(component.scopedMatchRankingGroups.map(g => g.standings[0].points)).toEqual([3, 6]);
    expect(component.competition!.standings[0].points).toBe(99);
  });

  it('keeps the legacy global leaderboard when the scoped contract is unavailable', () => {
    component.selected = { id: 7, sport: 'Futebol',
      sports: ['Futebol', 'Futsal'] } as any;
    component.competition = { standings: [{ games: 2, points: 7 }] } as any;
    expect(component.hasScopedMatchRankingContract).toBeFalse();
    expect(component.showLegacyMatchRanking).toBeTrue();
    expect(component.scopedMatchRankingGroups).toEqual([]);
    component.competition = { ...component.competition!, sportStandings: [] };
    expect(component.hasScopedMatchRankingContract).toBeTrue();
    expect(component.showLegacyAggregateStats).toBeFalse();
    expect(component.showLegacyMatchRanking).toBeFalse();
    expect(component.scopedMatchRankingGroups).toEqual([]);
    component.selected = { id: 7, sport: 'Futebol', sports: ['Futebol'] } as any;
    expect(component.showLegacyAggregateStats).toBeTrue();
    expect(component.showLegacyMatchRanking).toBeTrue();
  });

  it('saves scoring for the selected team sport without changing community-wide points', () => {
    component.selected = { id: 7, sports: ['Futebol', 'Futsal'], sport: 'Futebol' } as any;
    component.selectedSeasonId = 44;
    component.competition = {
      activeSeasonId: 44,
      settings: {winPoints: 3, drawPoints: 1, lossPoints: 0},
      sportStandings: [
        {sport: 'Futebol', standings: [], scoring: {
          sport: 'Futebol', winPoints: 3, drawPoints: 1, lossPoints: 0
        }},
        {sport: 'Futsal', standings: [], scoring: {
          sport: 'Futsal', winPoints: 2, drawPoints: 1, lossPoints: 0
        }}
      ]
    } as any;
    component.sportPointsSaving = false;
    const updateSportPointsRule = jasmine.createSpy('updateSportPointsRule')
      .and.returnValue(of({sport: 'Futsal', winPoints: 4, drawPoints: 2, lossPoints: 0}));
    (component as any).communityService = {updateSportPointsRule};
    spyOn(component, 'loadCompetition');
    component.editSportPoints(component.scopedMatchRankingGroups[1]);
    expect(component.sportPointsDraft).toEqual({winPoints: 2, drawPoints: 1, lossPoints: 0});
    component.sportPointsDraft.winPoints = 4;
    component.sportPointsDraft.drawPoints = 2;
    component.saveSportPoints();
    expect(updateSportPointsRule).toHaveBeenCalledOnceWith(7, 44, {
      sport: 'Futsal', winPoints: 4, drawPoints: 2, lossPoints: 0
    });
    expect(component.sportPointsEditor).toBeNull();
    expect(component.loadCompetition).toHaveBeenCalledWith(component.selected!, 44);
    expect(component.competition?.settings.winPoints).toBe(3);
  });

  it('rejects invalid team points and never offers generic scoring for races', () => {
    component.selected = { id: 7, sports: ['Futebol', 'Karting'], sport: 'Futebol' } as any;
    component.selectedSeasonId = 44;
    component.competition = {
      activeSeasonId: 44,
      settings: {winPoints: 3, drawPoints: 1, lossPoints: 0}
    } as any;
    component.sportPointsSaving = false;
    component.sportPointsEditor = 'Futebol';
    component.sportPointsDraft = {winPoints: -1, drawPoints: 1, lossPoints: 0};
    const updateSportPointsRule = jasmine.createSpy('updateSportPointsRule');
    (component as any).communityService = {updateSportPointsRule};
    component.saveSportPoints();
    expect(updateSportPointsRule).not.toHaveBeenCalled();
    expect(component.sportPointsError).toBeTruthy();
    expect(component.canEditSportPoints('Karting')).toBeFalse();
    component.selectedSeasonId = 43;
    expect(component.canEditSportPoints('Futebol')).toBeFalse();
  });

  it('does not save football scoring fields for a Karting-only community', () => {
    const updateCompetitionSettings = jasmine.createSpy('updateCompetitionSettings')
      .and.returnValue(of({ rankingsEnabled: true, winPoints: 3, drawPoints: 1, lossPoints: 0 }));
    component.selected = { id: 7, sport: 'Karting', sports: ['Karting'], myRole: 'OWNER' } as any;
    component.competitionSaving = false;
    component.rankingsEnabledDraft = true;
    component.winPointsDraft = 3;
    component.drawPointsDraft = 1;
    component.lossPointsDraft = 0;
    component.selectedSeasonId = null;
    (component as any).communityService = { updateCompetitionSettings };
    spyOn(component as any, 'replaceCommunity');
    spyOn(component, 'loadCompetition');

    expect(component.usesMatchPointsModel()).toBeFalse();
    component.saveCompetitionSettings();
    expect(updateCompetitionSettings).toHaveBeenCalledOnceWith(7, {
      rankingsEnabled: true, winPoints: null, drawPoints: null, lossPoints: null
    });

    component.selected = { id: 7, sport: 'Futebol', sports: ['Futebol', 'Karting'], myRole: 'OWNER' } as any;
    expect(component.usesMatchPointsModel()).toBeTrue();
  });

  it('keeps rankings activation as an explicit saved setting, independent of switch styling', () => {
    const updateCompetitionSettings = jasmine.createSpy('updateCompetitionSettings')
      .and.returnValue(of({ rankingsEnabled: false, winPoints: 3, drawPoints: 1, lossPoints: 0 }));
    component.selected = { id: 7, myRole: 'OWNER' } as any;
    component.competition = { settings: { rankingsEnabled: true } } as any;
    component.competitionSaving = false;
    component.rankingsEnabledDraft = true;
    component.winPointsDraft = 3;
    component.drawPointsDraft = 1;
    component.lossPointsDraft = 0;
    component.selectedSeasonId = null;
    (component as any).communityService = { updateCompetitionSettings };
    spyOn(component as any, 'replaceCommunity');
    spyOn(component, 'loadCompetition');

    component.rankingsEnabledDraft = false;
    expect(updateCompetitionSettings).not.toHaveBeenCalled();
    expect(component.competition?.settings.rankingsEnabled).toBeTrue();

    component.saveCompetitionSettings();
    expect(updateCompetitionSettings).toHaveBeenCalledOnceWith(7, {
      rankingsEnabled: false, winPoints: 3, drawPoints: 1, lossPoints: 0
    });
    expect(component.competition?.settings.rankingsEnabled).toBeFalse();
  });

  it('shows a new chat arrival counter only for the opened community', () => {
    component.selected = { id: 7 } as any;
    component.activeTab = 'chat';
    component.timelineEntries = [];
    component.newMessagesPending = 0;
    (component as any).readSync = { markVisible: jasmine.createSpy('markVisible') };
    const log = { scrollHeight: 900, scrollTop: 20, clientHeight: 230 };
    component.communityChatLog = { nativeElement: log } as any;
    const incoming = { id: 14, communityId: 7, username: 'bea',
      kind: 'CHAT', body: 'Olá!', createdAt: '2026-10-23T09:00:00Z' };
    component.onCommunityChatRealtime(incoming as any);
    component.onCommunityChatRealtime(incoming as any);
    component.onCommunityChatRealtime({ ...incoming, id: 15, communityId: 8 } as any);
    expect(component.newMessagesPending).toBe(1);
    expect(log.scrollTop).toBe(20);
    component.jumpToLatestMessages();
    expect(log.scrollTop).toBe(900);
    expect(component.newMessagesPending).toBe(0);
  });

  it('selects chat-only reply quotes and clears only on explicit cancellation', () => {
    const group = { id: 7, name: 'CNG' };
    component.selected = group as any;
    component.activeTab = 'chat';
    component.timelineSending = false;
    component.chatDeliveryUncertain = false;
    const entry = { id: 21, communityId: 7, kind: 'CHAT', username: 'ana',
      body: 'Vamos jogar?', createdAt: new Date().toISOString() };
    component.replyToCommunityMessage(entry as any);
    expect(component.replyingToCommunityMessage?.id).toBe(21);
    component.cancelCommunityReply();
    expect(component.replyingToCommunityMessage).toBeNull();
    component.replyToCommunityMessage({ ...entry, communityId: 9 } as any);
    expect(component.replyingToCommunityMessage).toBeNull();
    component.replyToCommunityMessage({ ...entry, kind: 'POST' } as any);
    expect(component.replyingToCommunityMessage).toBeNull();
  });

  it('supports Escape to cancel replies and preserves Shift+Enter and modified Enter', () => {
    component.selected = { id: 7 } as any;
    component.activeTab = 'chat';
    component.timelineSending = false;
    component.chatDeliveryUncertain = false;
    component.chatDraft = 'Olá';
    component.replyingToCommunityMessage = {
      id: 21, communityId: 7, kind: 'CHAT', username: 'ana', body: 'Vamos jogar?'
    } as any;
    const send = spyOn(component, 'sendTimeline');
    const key = (value: string, flags: Partial<KeyboardEvent> = {}) => ({
      key: value, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
      isComposing: false, keyCode: 0, preventDefault: jasmine.createSpy('preventDefault'),
      ...flags
    });
    const escape = key('Escape');
    component.onCommunityChatEnter(escape as unknown as Event);
    expect(component.replyingToCommunityMessage).toBeNull();
    expect(component.chatDraft).toBe('Olá');
    expect(escape.preventDefault).toHaveBeenCalled();

    for (const event of [key('Enter', { shiftKey: true }), key('Enter', { ctrlKey: true }),
      key('a'), key('Enter', { isComposing: true })]) {
      component.onCommunityChatEnter(event as unknown as Event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    const enter = key('Enter');
    component.onCommunityChatEnter(enter as unknown as Event);
    expect(enter.preventDefault).toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);

    component.replyingToCommunityMessage = { id: 22 } as any;
    component.chatDeliveryUncertain = true;
    const locked = key('Escape');
    component.onCommunityChatEnter(locked as unknown as Event);
    expect(component.replyingToCommunityMessage?.id).toBe(22);
    expect(locked.preventDefault).not.toHaveBeenCalled();
  });

  it('shows Portuguese labels for standard English Excel headers without changing source mappings', () => {
    const previous = localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language', 'pt');
      expect(component.importColumnHeaderLabel('Player')).toBe('Nome do jogador');
      expect(component.importColumnHeaderLabel('WIN')).toBe('Vitória');
      expect(component.importColumnHeaderLabel('Draw')).toBe('Empate');
      expect(component.importColumnHeaderLabel('loss')).toBe('Derrota');
      expect(component.importColumnHeaderLabel('Wins')).toBe('Vitórias');
      expect(component.importColumnHeaderLabel('Custom Excel Header')).toBe('Custom Excel Header');
      component.importMappings = [{ columnIndex: 0, header: 'Player', field: 'PLAYER', confidence: 1 }];
      expect(component.importColumnHeaderLabel(component.importMappings[0].header)).toBe('Nome do jogador');
      expect(component.importMappings[0].header).toBe('Player');
      expect(component.importMappings[0].field).toBe('PLAYER');
    } finally {
      if (previous == null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', previous);
    }
  });

  it('localizes WIN/DRAW/LOSS in normalized Excel previews but retains internal result codes', () => {
    const previous = localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language', 'pt');
      expect(component.importPreviewResultLabel({ result: 'WIN' })).toBe('Vitória');
      expect(component.importPreviewResultLabel({ result: 'DRAW' })).toBe('Empate');
      expect(component.importPreviewResultLabel({ result: 'LOSS' })).toBe('Derrota');
      expect(component.importPreviewResultLabel({ win: true })).toBe('Vitória');
      expect(component.importPreviewResultLabel({ draw: true })).toBe('Empate');
      expect(component.importPreviewResultLabel({ loss: true })).toBe('Derrota');
      expect(component.importPreviewResultLabel({})).toBe('—');
      expect(component.importPreviewResultLabel({ result: 'PENDING' })).toBe('PENDING');
      localStorage.setItem('d24-language', 'en');
      expect(component.importColumnHeaderLabel('Player')).toBe('Player name');
      expect(component.importPreviewResultLabel({ result: 'WIN' })).toBe('Win');
    } finally {
      if (previous == null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', previous);
    }
  });

  it('accepts Excel, CSV and TSV history files regardless of extension casing', () => {
    for (const name of ['histórico.xlsx', 'antigo.XLS', 'jornadas.csv', 'resultados.TSV']) {
      const file = new File(['Jogador;Golos\\nAna;2'], name, { type: 'application/octet-stream' });
      const input = { files: [file], value: name } as unknown as HTMLInputElement;
      component.onImportFileChange({ target: input } as unknown as Event);
      expect(component.importFile).toBe(file);
      expect(component.importFileName).toBe(name);
      expect(component.importFileError).toBe('');
    }
  });

  it('rejects unsupported formats and oversized imports without keeping old previews', () => {
    const previous = new File(['data'], 'jornadas.xlsx');
    const select = (file: File) => {
      const input = { files: [file], value: file.name } as unknown as HTMLInputElement;
      component.onImportFileChange({ target: input } as unknown as Event);
      return input;
    };
    select(previous);
    component.importPreview = { fileName: previous.name, sheets: [] };
    component.importFinalPlan = { rounds: [] };
    component.importResult = { createdRounds: 1, skippedDuplicateRounds: 0, createdEntries: 2 };

    const invalid = select(new File(['content'], 'historico.pdf'));
    expect(invalid.value).toBe('');
    expect(component.importFile).toBeUndefined();
    expect(component.importFileName).toBe('');
    expect(component.importFileError).toContain('.csv');
    expect(component.importPreview).toBeUndefined();
    expect(component.importFinalPlan).toBeUndefined();
    expect(component.importResult).toBeUndefined();

    const large = select(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'grande.csv'));
    expect(large.value).toBe('');
    expect(component.importFile).toBeUndefined();
    expect(component.importFileError).toContain('10 MB');
  });

  it('clears stale import data when file selection is cancelled', () => {
    component.importSourceCompetition = 'Taça antiga';
    component.importSourceRound = 'Jornada 4';
    component.importFile = new File(['data'], 'jornadas.csv');
    component.importFileName = 'jornadas.csv';
    component.importPreview = { fileName: 'jornadas.csv', sheets: [] };
    component.onImportFileChange({
      target: { files: [], value: '' } as unknown as HTMLInputElement
    } as unknown as Event);

    expect(component.importFile).toBeUndefined();
    expect(component.importFileName).toBe('');
    expect(component.importPreview).toBeUndefined();
    expect(component.importSourceCompetition).toBe('');
    expect(component.importSourceRound).toBe('');
  });

  it('requires explicit confirmation when mapped spreadsheet points will not be persisted', () => {
    component.importMappings = [{ columnIndex: 2, header: 'Pontos', field: 'POINTS', confidence: 0.9 }];
    component.importPointsAcknowledged = false;
    expect(component.importIncludesPoints).toBeTrue();

    component.selected = { id: 9 } as any;
    component.importFile = new File(['history'], 'historico.csv');
    component.importSheetName = 'Dados';
    component.selectedSeasonId = 21;
    component.importFinalPlan = { invalidDates: 0, roundsNeedingYear: 0, rounds: [] };
    component.confirmHistoricalImport();

    expect(component.importFileError).not.toBe('');
    expect(component.importConfirming).toBeFalsy();

    component.importPointsAcknowledged = true;
    component.setImportMapping(2, 'IGNORE');
    expect(component.importIncludesPoints).toBeFalse();
    expect(component.importPointsAcknowledged).toBeFalse();
  });

  it('resets points acknowledgement when import planning context changes', () => {
    component.importMappings = [{ columnIndex: 1, header: 'Points', field: 'POINTS', confidence: 0.9 }];
    component.importPointsAcknowledged = true;
    component.invalidateImportPlan();
    expect(component.importPointsAcknowledged).toBeFalse();
    component.importPointsAcknowledged = true;
    component.onImportFileChange({ target: {
      files: [new File(['x'], 'season.xlsx')], value: 'season.xlsx'
    } as unknown as HTMLInputElement } as unknown as Event);
    expect(component.importPointsAcknowledged).toBeFalse();
  });

  it('supports distinct history types and clears stale preview on mode change', () => {
    component.importMode = 'ROUNDS';
    component.importFile = new File(['dummy'], 'historico.csv');
    component.importPreview = { fileName: 'historico.csv', sheets: [] };
    component.importMappings = [{ columnIndex: 0, header: 'Jogador', field: 'PLAYER', confidence: 0.9 }];
    component.selectImportMode('STANDINGS');
    expect(component.importMode).toBe('STANDINGS');
    expect(component.importFields).toContain('POINTS');
    expect(component.importFields).toContain('NAME');
    expect(component.importFields).not.toContain('DATE');
    expect(component.importPreview).toEqual({ fileName: 'historico.csv', sheets: [] });
    expect(component.importMappings).toEqual([]);
    expect(component.importFile?.name).toBe('historico.csv');
    expect(component['suggestArchiveField']('Pts', 'POINTS')).toBe('POINTS');
    expect(component['suggestArchiveField']('Equipa', 'IGNORE')).toBe('NAME');
  });

  it('maps tournament match headers and clears stale previews on mapping and mode changes', () => {
    component.importMode = 'MATCHES';
    expect(component.importFields).toEqual(
      ['IGNORE', 'HOME', 'AWAY', 'SCORE', 'HOME_SCORE', 'AWAY_SCORE', 'DATE', 'ROUND']);
    expect(component['suggestMatchField']('Equipa A', 'PLAYER')).toBe('HOME');
    expect(component['suggestMatchField']('Equipa B', 'PLAYER')).toBe('AWAY');
    expect(component['suggestMatchField']('Resultado', 'RESULT')).toBe('SCORE');
    expect(component['suggestMatchField']('Golos Casa', 'IGNORE')).toBe('HOME_SCORE');
    expect(component['suggestMatchField']('Golos Fora', 'IGNORE')).toBe('AWAY_SCORE');
    expect(component['suggestMatchField']('Jornada', 'IGNORE')).toBe('ROUND');
    // A historical knockout Excel is likely to name the phase column Fase,
    // not Jornada. The importer must keep it for source-stage navigation.
    for (const header of [
      'Fase', 'Fase do torneio', 'Fase da competição', 'Fase eliminatória',
      'Eliminatória', 'Etapa', 'Stage', 'Phase', 'Knockout Round',
      'Round name', 'Meia-final'
    ]) {
      const expected = header === 'Meia-final' ? 'IGNORE' : 'ROUND';
      expect(component['suggestMatchField'](header, 'IGNORE'))
        .withContext(header).toBe(expected);
    }
    expect(component['suggestMatchField']('Fase', 'DATE')).toBe('ROUND');
    expect(component['suggestMatchField']('Fase de grupos', 'IGNORE')).toBe('IGNORE');

    expect(component['suggestMatchField']('Equipa', 'PLAYER')).toBe('IGNORE');
    component.importMappings = [{ columnIndex: 0, header: 'Equipa A', field: 'HOME', confidence: 1 }];
    component.matchPreview = { sheetName: 'Dados', sourceRows: 1, acceptedRows: 1,
      potentialDuplicates: 0, warnings: [], rows: [] };
    component.setImportMapping(0, 'AWAY');
    expect(component.matchPreview).toBeUndefined();
    component.matchPreview = { sheetName: 'Dados', sourceRows: 1, acceptedRows: 1,
      potentialDuplicates: 0, warnings: [], rows: [] };
    component.selectImportMode('STANDINGS');
    expect(component.matchPreview).toBeUndefined();
    expect(component.importMode).toBe('STANDINGS');
  });

  it('maps Fase to source ROUND across sheet inspection and retains the original header', () => {
    component.importMode = 'MATCHES';
    component.importPreview = {
      fileName: 'torneio.xlsx',
      sheets: [{
        name: 'Torneio 2024', nonEmptyRows: 7, structure: 'TABULAR',
        headers: ['Casa', 'Fora', 'Resultado', 'Data', 'Fase'],
        sampleRows: [['Águias', 'Lobos', '2-1', '2024-04-01', 'Quartos de final']],
        columnSuggestions: [
          { columnIndex: 3, header: 'Data', field: 'DATE', confidence: 1 },
          { columnIndex: 4, header: 'Fase', field: 'DATE', confidence: 0.3 }
        ]
      }]
    };
    component.selectImportSheet('Torneio 2024');
    expect(component.importMappings.map(mapping => mapping.field))
      .toEqual(['HOME', 'AWAY', 'SCORE', 'DATE', 'ROUND']);
    expect(component.importMappings[4].header).toBe('Fase');
    expect(component.importSheetName).toBe('Torneio 2024');
  });

  it('only previews historical matches and never invokes any persistence endpoint', () => {
    component.selected = { id: 7 } as any;
    component.importMode = 'MATCHES';
    component.importFile = new File(['data'], 'jogos.csv');
    component.importSheetName = 'Dados';
    component.importMappings = [
      { columnIndex: 0, header: 'Casa', field: 'HOME', confidence: 1 },
      { columnIndex: 1, header: 'Fora', field: 'AWAY', confidence: 1 },
      { columnIndex: 2, header: 'Resultado', field: 'SCORE', confidence: 1 }
    ];
    const preview = { sheetName: 'Dados', sourceRows: 2, acceptedRows: 2, potentialDuplicates: 1,
      warnings: ['Linha 3: confronto potencialmente repetido'], rows: [
        { sourceRow: 2, home: 'Águias', away: 'Lobos', homeScore: 2, awayScore: 1,
          sourceDate: '2020-10-01', sourceRound: '1', potentialDuplicate: false }
      ] };
    const fetchMatches = jasmine.createSpy('previewHistoricalMatches').and.returnValue(of(preview));
    const confirmStandings = jasmine.createSpy('confirmHistoricalStandings');
    (component as any).communityService = {
      previewHistoricalMatches: fetchMatches, confirmHistoricalStandings: confirmStandings
    };
    component.previewHistoricalMatches();
    expect(fetchMatches).toHaveBeenCalledWith(7, jasmine.any(File), {
      sheetName: 'Dados',
      columns: [
        { columnIndex: 0, field: 'HOME' }, { columnIndex: 1, field: 'AWAY' },
        { columnIndex: 2, field: 'SCORE' }
      ]
    });
    expect(component.matchPreview?.rows[0].homeScore).toBe(2);
    expect(component.matchPreview?.potentialDuplicates).toBe(1);
    expect(confirmStandings).not.toHaveBeenCalled();
  });


  it('saves tournament matches only after reviewing title and explicit acknowledgement', () => {
    component.selected = { id: 7 } as any;
    component.importMode = 'MATCHES';
    component.importFile = new File(['data'], 'jogos.tsv');
    component.importSheetName = 'Dados';
    component.importMappings = [{ columnIndex: 0, header: 'Casa', field: 'HOME', confidence: 1 }];
    component.matchPreview = {
      sheetName: 'Dados', sourceRows: 2, acceptedRows: 2, potentialDuplicates: 1, warnings: [],
      rows: [{ sourceRow: 2, home: 'Águias', away: 'Lobos', homeScore: 2, awayScore: 1,
        sourceDate: '01/10/2022', sourceRound: 'Final', potentialDuplicate: true }]
    };
    const confirmed = { id: 12, title: 'Taça antiga', entryType: 'TEAM' as const,
      sourceFilename: 'jogos.tsv', createdAt: '2026-10-17T20:00:00Z', rows: component.matchPreview.rows };
    const confirm = jasmine.createSpy('confirmHistoricalMatches').and.returnValue(of(confirmed));
    const list = jasmine.createSpy('listHistoricalMatches').and.returnValue(of([confirmed]));
    (component as any).communityService = { confirmHistoricalMatches: confirm, listHistoricalMatches: list };
    component.matchArchiveTitle = 'Taça antiga';
    component.matchArchiveEntryType = 'TEAM';
    component.matchArchiveAcknowledged = false;
    component.confirmMatchArchive();
    expect(confirm).not.toHaveBeenCalled();
    component.matchArchiveAcknowledged = true;
    component.confirmMatchArchive();
    expect(confirm).toHaveBeenCalledOnceWith(7, jasmine.any(File), {
      sheetName: 'Dados', columns: [{ columnIndex: 0, field: 'HOME' }]
    }, { title: 'Taça antiga', entryType: 'TEAM' });
    expect(component.matchArchiveOpen?.rows[0].potentialDuplicate).toBeTrue();
    expect(component.matchArchiveOpen?.rows[0].sourceDate).toBe('01/10/2022');
    expect(component.matchPreview).toBeUndefined();
    expect(component.matchArchiveAcknowledged).toBeFalse();
    expect(list).toHaveBeenCalledWith(7);
  });

  it('does not confirm an empty preview or allow non-managers to save historical matches', () => {
    component.selected = { id: 7 } as any;
    component.importMode = 'MATCHES';
    component.importFile = new File(['x'], 'jogos.xlsx');
    component.importSheetName = 'Folha1';
    component.matchPreview = { sheetName: 'Folha1', sourceRows: 0, acceptedRows: 0,
      potentialDuplicates: 0, warnings: [], rows: [] };
    component.matchArchiveTitle = 'Torneio 2020';
    component.matchArchiveAcknowledged = true;
    const confirm = jasmine.createSpy('confirmHistoricalMatches');
    (component as any).communityService = { confirmHistoricalMatches: confirm };
    component.confirmMatchArchive();
    expect(confirm).not.toHaveBeenCalled();
    component.matchPreview.acceptedRows = 1;
    (component.canManage as jasmine.Spy).and.returnValue(false);
    component.confirmMatchArchive();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('clears another community\'s history and reloads it after accepting an invitation', () => {
    component.selected = { id: 7 } as any;
    component.selectedSeasonId = 99;
    component.competition = { selectedSeasonId: 99 } as any;
    component.communities = [{ id: 7 } as any];
    component.invites = [{ id: 10 } as any];
    component.archiveSummaries = [{ id: 51 } as any];
    component.matchArchiveSummaries = [{ id: 52 } as any];
    component.archiveOpen = { id: 51 } as any;
    component.matchArchiveOpen = { id: 52 } as any;
    const standings = jasmine.createSpy('listHistoricalStandings').and.returnValue(of([]));
    const matches = jasmine.createSpy('listHistoricalMatches').and.returnValue(of([]));
    (component as any).communityService = {
      acceptInvite: () => of({ id: 8, members: [] }),
      listHistoricalStandings: standings,
      listHistoricalMatches: matches
    };
    spyOn<any>(component, 'prepareRoundEntries');
    spyOn(component, 'loadCompetition');
    spyOn(component, 'loadCommunitySessions');

    component.acceptInvite({ id: 10 } as any);

    expect(component.selected?.id).toBe(8);
    expect(component.selectedSeasonId).toBeNull();
    expect(component.competition).toBeUndefined();
    expect(component.archiveSummaries).toEqual([]);
    expect(component.matchArchiveSummaries).toEqual([]);
    expect(component.archiveOpen).toBeUndefined();
    expect(component.matchArchiveOpen).toBeUndefined();
    expect(standings).toHaveBeenCalledWith(8);
    expect(matches).toHaveBeenCalledWith(8);
  });

  it('ignores older reload groups and invites while preserving the latest loading state', () => {
    const firstMine = new Subject<any[]>();
    const secondMine = new Subject<any[]>();
    const firstInvites = new Subject<any[]>();
    const secondInvites = new Subject<any[]>();
    (component as any).communityService = {
      mine: jasmine.createSpy('mine')
        .and.returnValues(firstMine.asObservable(), secondMine.asObservable()),
      myInvites: jasmine.createSpy('myInvites')
        .and.returnValues(firstInvites.asObservable(), secondInvites.asObservable())
    };
    (component as any).route = {
      snapshot: { paramMap: { get: () => null }, queryParamMap: { get: () => null } }
    };
    component.selected = undefined;
    component.communities = [];
    component.invites = [];

    component.reload();
    component.reload();
    firstMine.next([{ id: 7 }]);
    firstMine.complete();
    firstInvites.next([{ id: 70 }]);
    firstInvites.complete();
    expect(component.communities).toEqual([]);
    expect(component.invites).toEqual([]);
    expect(component.loading).toBeTrue();

    secondMine.next([{ id: 8 }]);
    secondMine.complete();
    secondInvites.next([{ id: 80 }]);
    secondInvites.complete();
    expect(component.communities.map(group => group.id)).toEqual([8]);
    expect(component.invites.map(invite => invite.id)).toEqual([80]);
    expect(component.loading).toBeFalse();
  });

  it('ignores stale reload failures without hiding current group or invite results', () => {
    const firstMine = new Subject<any[]>();
    const secondMine = new Subject<any[]>();
    const firstInvites = new Subject<any[]>();
    const secondInvites = new Subject<any[]>();
    (component as any).communityService = {
      mine: jasmine.createSpy('mine')
        .and.returnValues(firstMine.asObservable(), secondMine.asObservable()),
      myInvites: jasmine.createSpy('myInvites')
        .and.returnValues(firstInvites.asObservable(), secondInvites.asObservable())
    };
    (component as any).route = {
      snapshot: { paramMap: { get: () => null }, queryParamMap: { get: () => null } }
    };
    component.selected = undefined;
    component.invites = [{ id: 4 } as any];

    component.reload();
    component.reload();
    firstMine.error(new Error('stale groups failure'));
    firstInvites.error(new Error('stale invites failure'));
    expect(component.errorMessage).toBe('');
    expect(component.invites.map(invite => invite.id)).toEqual([4]);
    expect(component.loading).toBeTrue();

    secondMine.next([{ id: 9 }]);
    secondMine.complete();
    secondInvites.next([{ id: 90 }]);
    secondInvites.complete();
    expect(component.errorMessage).toBe('');
    expect(component.communities.map(group => group.id)).toEqual([9]);
    expect(component.invites.map(invite => invite.id)).toEqual([90]);
    expect(component.loading).toBeFalse();
  });

  it('ignores an obsolete community presentation and keeps the latest one loading', () => {
    const older = new Subject<any>();
    const newer = new Subject<any>();
    (component as any).pendingJoinLookupVersion = 0;
    (component as any).communityService = {
      presentation: jasmine.createSpy('presentation')
        .and.returnValues(older.asObservable(), newer.asObservable())
    };
    const lookup = spyOn<any>(component, 'loadMyPendingJoinRequest');
    (component as any).loadCommunityPresentation(901);
    (component as any).loadCommunityPresentation(902);

    older.next({ id: 901, name: 'Antiga', visibility: 'PRIVATE' });
    older.complete();
    expect(component.communityPresentation).toBeUndefined();
    expect(component.presentationLoading).toBeTrue();
    expect(lookup).not.toHaveBeenCalled();

    newer.next({ id: 902, name: 'Atual', visibility: 'PRIVATE' });
    newer.complete();
    expect(component.communityPresentation?.id).toBe(902);
    expect(component.presentationLoading).toBeFalse();
    expect(lookup).toHaveBeenCalledOnceWith(902);
  });

  it('ignores an earlier presentation failure while a newer community loads', () => {
    const older = new Subject<any>();
    const newer = new Subject<any>();
    (component as any).pendingJoinLookupVersion = 0;
    (component as any).communityService = {
      presentation: jasmine.createSpy('presentation')
        .and.returnValues(older.asObservable(), newer.asObservable())
    };
    (component as any).loadCommunityPresentation(901);
    (component as any).loadCommunityPresentation(902);

    older.error(new Error('stale'));
    expect(component.errorMessage).toBe('');
    expect(component.presentationLoading).toBeTrue();

    newer.next({ id: 902, name: 'Atual', visibility: 'PUBLIC' });
    newer.complete();
    expect(component.communityPresentation?.id).toBe(902);
    expect(component.errorMessage).toBe('');
    expect(component.presentationLoading).toBeFalse();
  });

  it('shows only the latest match archive list and ignores stale errors and loading completion', () => {
    component.selected = { id: 7 } as any;
    const first = new Subject<any[]>();
    const second = new Subject<any[]>();
    (component as any).communityService = {
      listHistoricalMatches: jasmine.createSpy('listHistoricalMatches')
        .and.returnValues(first.asObservable(), second.asObservable())
    };
    component.loadMatchArchives(7);
    component.loadMatchArchives(7);
    const newest = [{ id: 51, title: 'Recentes' }];
    second.next(newest);
    first.error(new Error('stale'));
    expect(component.matchArchiveSummaries).toEqual(newest as any);
    expect(component.matchArchivesError).toBe('');
    expect(component.matchArchivesLoading).toBeTrue();
    second.complete();
    expect(component.matchArchivesLoading).toBeFalse();
  });

  it('shows only the latest historical standings list when requests finish out of order', () => {
    component.selected = { id: 7 } as any;
    const first = new Subject<any[]>();
    const second = new Subject<any[]>();
    (component as any).communityService = {
      listHistoricalStandings: jasmine.createSpy('listHistoricalStandings')
        .and.returnValues(first.asObservable(), second.asObservable())
    };
    component.loadArchivedStandings(7);
    component.loadArchivedStandings(7);
    second.next([{ id: 60, title: 'Época 2026' }]);
    first.next([{ id: 59, title: 'Época antiga' }]);
    first.complete();
    expect(component.archiveSummaries.map(item => item.id)).toEqual([60]);
    expect(component.archivesLoading).toBeTrue();
    second.complete();
    expect(component.archivesLoading).toBeFalse();
  });

  it('ignores old match details after navigating and unblocks the new community', () => {
    const older = new Subject<any>();
    const newer = new Subject<any>();
    const details = jasmine.createSpy('historicalMatchDetails')
      .and.returnValues(older.asObservable(), newer.asObservable());
    (component as any).communityService = { historicalMatchDetails: details };
    component.selected = { id: 7 } as any;
    component.openMatchArchive(50);
    expect(component.matchArchiveOpeningId).toBe(50);
    (component as any).invalidateArchiveRequests();
    component.selected = { id: 8 } as any;
    component.matchArchiveOpen = undefined;
    component.openMatchArchive(51);
    older.next({ id: 50, rows: [] });
    older.complete();
    expect(component.matchArchiveOpen).toBeUndefined();
    expect(component.matchArchiveOpeningId).toBe(51);
    newer.next({ id: 51, rows: [] });
    newer.complete();
    expect((component as any).matchArchiveOpen?.id).toBe(51);
    expect(component.matchArchiveOpeningId).toBeUndefined();
    expect(details).toHaveBeenCalledWith(8, 51);
  });

  it('ignores stale standings detail errors and allows opening a new archive', () => {
    const older = new Subject<any>();
    const newer = new Subject<any>();
    (component as any).communityService = {
      historicalStandingDetails: jasmine.createSpy('historicalStandingDetails')
        .and.returnValues(older.asObservable(), newer.asObservable())
    };
    component.selected = { id: 7 } as any;
    component.openArchivedStanding(50);
    (component as any).invalidateArchiveRequests();
    component.selected = { id: 8 } as any;
    component.archiveOpen = undefined;
    component.openArchivedStanding(51);
    older.error(new Error('old request'));
    expect(component.archivesError).toBe('');
    expect(component.archiveOpeningId).toBe(51);
    newer.next({ id: 51, rows: [] });
    newer.complete();
    expect((component as any).archiveOpen?.id).toBe(51);
    expect(component.archiveOpeningId).toBeUndefined();
  });

  it('only displays match archives from the selected community and keeps repeated rows', () => {
    component.selected = { id: 9 } as any;
    const archive = { id: 50, title: '2021', entryType: 'INDIVIDUAL' as const,
      sourceFilename: 'jogos.csv', createdAt: '2026-10-17T20:00:00Z',
      rows: [
        { sourceRow: 4, home: 'A', away: 'B', homeScore: 1, awayScore: 0,
          sourceDate: '1/5/2021', sourceRound: '2', potentialDuplicate: false },
        { sourceRow: 5, home: 'A', away: 'B', homeScore: 1, awayScore: 0,
          sourceDate: '1/5/2021', sourceRound: '2', potentialDuplicate: true }
      ] };
    (component as any).communityService = {
      listHistoricalMatches: () => of([archive]),
      historicalMatchDetails: jasmine.createSpy().and.returnValue(of(archive))
    };
    component.loadMatchArchives(9);
    component.openMatchArchive(50);
    expect(component.matchArchiveSummaries.length).toBe(1);
    expect(component.matchArchiveOpen?.rows.length).toBe(2);
    expect(component.matchArchiveOpen?.rows[1].potentialDuplicate).toBeTrue();
    component.selected = { id: 10 } as any;
    component.openMatchArchive(50);
    expect(component.matchArchiveOpen).toBeUndefined();
  });


  it('recognizes player results from a CNG-like sheet and suggests rounds without forcing the choice', () => {
    component.importMode = 'MATCHES';
    component.importPreview = { fileName: 'grupo.xlsx', sheets: [{
      name: 'Sheet1', structure: 'TABULAR', nonEmptyRows: 41,
      headers: ['Data', 'Cepo', 'V', 'D', 'Pontos'],
      sampleRows: [['31 Ago', 'Jogador A', '1', '', '3'], ['7 Set', 'Jogador B', '', '1', '0']],
      columnSuggestions: [
        { columnIndex: 0, header: 'Data', field: 'DATE', confidence: 0.95 },
        { columnIndex: 1, header: 'Cepo', field: 'UNKNOWN', confidence: 0 },
        { columnIndex: 2, header: 'V', field: 'WIN', confidence: 0.9 },
        { columnIndex: 3, header: 'D', field: 'UNKNOWN', confidence: 0 },
        { columnIndex: 4, header: 'Pontos', field: 'POINTS', confidence: 0.9 }
      ]
    }] };
    component.selectImportSheet('Sheet1');
    expect(component.recommendedImportMode).toBe('ROUNDS');
    expect(component.importMode).toBe('MATCHES');
    const cachedInspection = component.importPreview;
    component.selectImportMode('ROUNDS');
    expect(component.importPreview).toBe(cachedInspection);
    expect(component.importMappings.map(x => x.field)).toEqual(['DATE', 'PLAYER', 'WIN', 'LOSS', 'POINTS']);
    expect(component.sourceDatesNeedYear).toBeTrue();
    expect(component.importDefaultYear).toBeNull();
  });

  it('gives helpful errors rather than calling the API with fields meant for a different history type', () => {
    component.selected = { id: 7 } as any;
    component.importFile = new File(['dummy'], 'group.xlsx');
    component.importSheetName = 'Sheet1';
    component.importMappings = [{ columnIndex: 0, field: 'DATE', header: 'Data', confidence: 1 }];
    const matches = jasmine.createSpy('previewHistoricalMatches');
    const standings = jasmine.createSpy('previewHistoricalStandings');
    (component as any).communityService = {
      previewHistoricalMatches: matches, previewHistoricalStandings: standings
    };
    component.importMode = 'MATCHES';
    component.previewHistoricalMatches();
    expect(matches).not.toHaveBeenCalled();
    expect(component.importFileError).toContain('Casa');
    component.importMode = 'STANDINGS';
    component.previewArchiveImport();
    expect(standings).not.toHaveBeenCalled();
    expect(component.importFileError).toContain('Nome');
  });

  it('requires the organizer to provide the year for dates such as 31 Ago', () => {
    component.selected = { id: 7 } as any;
    component.importFile = new File(['dummy'], 'group.xlsx');
    component.importSheetName = 'Sheet1';
    component.selectedSeasonId = 19;
    component.importMappings = [
      { columnIndex: 0, field: 'DATE', header: 'Data', confidence: 1 },
      { columnIndex: 1, field: 'PLAYER', header: 'Cepo', confidence: 1 }
    ];
    component.sourceDatesNeedYear = true;
    component.importDefaultYear = null;
    const plan = jasmine.createSpy('finalImportPlan');
    (component as any).communityService = { finalImportPlan: plan };
    component.buildImportFinalPlan();
    expect(plan).not.toHaveBeenCalled();
    expect(component.importFileError).not.toBe('');
    component.importDefaultYear = 2025;
    plan.and.returnValue(of({ rounds: [] }));
    component.buildImportFinalPlan();
    expect(plan).toHaveBeenCalled();
  });

  it('sends optional source competition and round identifiers to both plan and confirmation', () => {
    component.selected = { id: 7 } as any;
    component.importFile = new File(['data'], 'single-round.csv');
    component.importSheetName = 'Dados';
    component.selectedSeasonId = 19;
    component.importDefaultYear = 2026;
    component.importSourceCompetition = ' Liga de Verão ';
    component.importSourceRound = ' Jornada 2 ';
    component.importMappings = [
      { columnIndex: 0, field: 'PLAYER', header: 'Jogador', confidence: 1 },
      { columnIndex: 1, field: 'DATE', header: 'Data', confidence: 1 }
    ];
    const plan = jasmine.createSpy('finalImportPlan').and.returnValue(of({
      invalidDates: 0, roundsNeedingYear: 0, rounds: []
    }));
    const confirm = jasmine.createSpy('confirmImportRounds').and.returnValue(of({
      createdRounds: 1, skippedDuplicateRounds: 0, createdEntries: 2
    }));
    (component as any).communityService = { finalImportPlan: plan, confirmImportRounds: confirm };
    spyOn(component, 'loadCompetition');
    component.buildImportFinalPlan();
    expect(plan).toHaveBeenCalledWith(7, component.importFile, jasmine.anything(), {
      seasonId: 19, defaultYear: 2026,
      sourceCompetition: 'Liga de Verão', sourceRound: 'Jornada 2'
    });
    component.confirmHistoricalImport();
    expect(confirm).toHaveBeenCalledWith(7, component.importFile, jasmine.anything(), {
      seasonId: 19, defaultYear: 2026,
      sourceCompetition: 'Liga de Verão', sourceRound: 'Jornada 2'
    });
    component.importSourceRound = 'Jornada 3';
    component.invalidateImportPlan();
    expect(component.importFinalPlan).toBeUndefined();
  });

  it('requires review and a title before writing final standings', () => {
    component.selected = { id: 7 } as any;
    component.importMode = 'STANDINGS';
    component.importFile = new File(['data'], 'tabela.csv');
    component.importSheetName = 'Dados';
    component.importMappings = [
      { columnIndex: 0, header: 'Equipa', field: 'NAME', confidence: 1 },
      { columnIndex: 1, header: 'Pts', field: 'POINTS', confidence: 1 }
    ];
    component.archivePreview = {
      sheetName: 'Dados', sourceRows: 1, acceptedRows: 1, duplicateRows: 0,
      warnings: [], rows: [{ position: 1, name: 'Águias', played: null,
        wins: null, draws: null, losses: null, points: 8, goalsFor: null, goalsAgainst: null }]
    };
    component.archiveTitle = 'Época antiga';
    component.archiveAcknowledged = false;
    const confirm = jasmine.createSpy('confirmHistoricalStandings');
    (component as any).communityService = { confirmHistoricalStandings: confirm };
    component.confirmArchiveImport();
    expect(confirm).not.toHaveBeenCalled();
    expect(component.importFileError).not.toBe('');

    component.archiveAcknowledged = true;
    confirm.and.returnValue(of({ id: 15, title: 'Época antiga', entryType: 'TEAM', seasonId: null,
      sourceFilename: 'tabela.csv', createdAt: '2026-10-17T20:00:00Z', rows: component.archivePreview.rows }));
    (component as any).communityService.listHistoricalStandings = () => of([]);
    component.archiveEntryType = 'TEAM';
    component.archiveSeasonId = null;
    component.confirmArchiveImport();
    expect(confirm).toHaveBeenCalledWith(7, jasmine.any(File), {
      sheetName: 'Dados',
      columns: [{ columnIndex: 0, field: 'NAME' }, { columnIndex: 1, field: 'POINTS' }]
    }, { title: 'Época antiga', entryType: 'TEAM', seasonId: null });
    expect(component.archiveConfirmed?.rows[0].points).toBe(8);
    expect(component.archivePreview).toBeUndefined();
  });


  it('ignores older season responses and keeps the latest competition loading state', () => {
    const earlier = new Subject<any>();
    const latest = new Subject<any>();
    component.selected = { id: 7 } as any;
    (component as any).communityService = {
      competition: jasmine.createSpy('competition').and.returnValues(
        earlier.asObservable(), latest.asObservable())
    };
    const overview = (winPoints: number) => ({
      standings: [], seasons: [], selectedSeasonId: null, activeSeasonId: null,
      settings: { rankingsEnabled: true, winPoints, drawPoints: 1, lossPoints: 0 },
      rounds: []
    });
    component.loadCompetition(component.selected, 11);
    component.loadCompetition(component.selected, 12);
    earlier.next(overview(3));
    earlier.complete();
    expect(component.competition).toBeUndefined();
    expect(component.competitionLoading).toBeTrue();
    latest.next(overview(4));
    latest.complete();
    expect(component.competition?.settings.winPoints).toBe(4);
    expect(component.competitionLoading).toBeFalse();
  });

  it('never displays sessions from another community after navigation', () => {
    const earlier = new Subject<SessionSummary[]>();
    const latest = new Subject<SessionSummary[]>();
    const a = { id: 7 } as any;
    const b = { id: 8 } as any;
    (component as any).communityService = {
      sessions: jasmine.createSpy('sessions').and.returnValues(
        earlier.asObservable(), latest.asObservable())
    };
    component.selected = a;
    component.loadCommunitySessions(a);
    component.selected = b;
    component.loadCommunitySessions(b);
    latest.next([{ ...session, id: 80 }]);
    earlier.next([{ ...session, id: 70 }]);
    expect(component.communitySessions.map(item => item.id)).toEqual([80]);
    earlier.complete();
    expect(component.sessionsLoading).toBeTrue();
    latest.complete();
    expect(component.sessionsLoading).toBeFalse();
  });

  it('renders imported names without @null and displays verified handles', () => {
    const imported = { profileId: null, username: null, fullName: 'Ferreirinha' };
    expect(component.roundEntryHandle(imported)).not.toContain('@null');
    expect(component.roundEntryHandle(imported)).not.toContain('@undefined');
    expect(component.roundEntryHandle(imported)).not.toBe('');
    expect(component.roundEntryHandle({ username: 'TMF14' }))
      .toBe('@TMF14');
  });

  it('keeps the ranking empty until results exist unless zero-game members are requested', () => {
    component.competition = { standings: [
      { profileId: 17, username: 'TMF14', fullName: 'Miguel Ferreira', games: 0, points: 0 }
    ] } as any;
    component.showAllStandings = false;

    expect(component.displayedRankings).toEqual([]);
    component.showAllStandings = true;
    expect(component.displayedRankings).toHaveSize(1);
    expect(component.displayedRankings[0].username).toBe('TMF14');
    component.showAllStandings = false;
    expect(component.displayedRankings).toEqual([]);
  });

  it('keeps non-participants out of rankings by default but allows showing every member', () => {
    component.competition = { standings: [
      { profileId: null, username: null, fullName: 'Ferreirinha', games: 3, points: 6 },
      { profileId: 17, username: 'TMF14', fullName: 'Miguel Ferreira', games: 0, points: 0 }
    ] } as any;
    expect(component.rankingParticipants.map(row => row.fullName)).toEqual(['Ferreirinha']);
    expect(component.displayedRankings).toHaveSize(1);
    component.showAllStandings = true;
    expect(component.displayedRankings).toHaveSize(2);
  });


  it('allows an ordinary member to claim their own unlinked historical name only after confirmation', () => {
    component.selected = { id: 7, myRole: 'MEMBER' } as any;
    component.historicalPlayers = [{ playerId: 5, historicalName: 'Ferreirinha',
      linkedUsername: null, linkStatus: 'UNLINKED' }];
    component.historicalPlayerId = 5;
    component.historicalClaimAcknowledged = false;
    const claim = jasmine.createSpy('claimHistoricalPlayer').and.returnValue(of({
      id: 60, playerId: 5, historicalName: 'Ferreirinha', targetUsername: 'TMF14', status: 'ACCEPTED'
    }));
    (component as any).communityService = { claimHistoricalPlayer: claim };
    component.claimHistoricalName();
    expect(claim).not.toHaveBeenCalled();
    component.historicalClaimAcknowledged = true;
    spyOn(component, 'loadHistoricalLinks');
    spyOn(component, 'loadCompetition');
    component.claimHistoricalName();
    expect(claim).toHaveBeenCalledOnceWith(7, 5);
    expect(component.historicalPlayerId).toBeNull();
    expect(component.historicalClaimAcknowledged).toBeFalse();
    expect(component.loadCompetition).toHaveBeenCalled();
  });

  it('does not allow linked or pending names to be claimed', () => {
    component.selected = { id: 7, myRole: 'MEMBER' } as any;
    component.historicalPlayers = [
      { playerId: 5, historicalName: 'Ferreirinha', linkedUsername: null, linkStatus: 'ACCEPTED' },
      { playerId: 6, historicalName: 'Outro', linkedUsername: null, linkStatus: 'PENDING' }
    ];
    component.historicalClaimAcknowledged = true;
    const claim = jasmine.createSpy('claimHistoricalPlayer');
    (component as any).communityService = { claimHistoricalPlayer: claim };
    for (const id of [5, 6]) {
      component.historicalPlayerId = id;
      component.claimHistoricalName();
    }
    expect(claim).not.toHaveBeenCalled();
  });

  it('allows an owner to unlink only a claim already loaded as their own', () => {
    component.selected = { id: 7, myRole: 'MEMBER' } as any;
    const item = { id: 60, playerId: 5, historicalName: 'Ferreirinha',
      targetUsername: 'TMF14', status: 'ACCEPTED' as const };
    const release = jasmine.createSpy('releaseHistoricalClaim').and.returnValue(of(undefined));
    (component as any).communityService = { releaseHistoricalClaim: release };
    component.historicalClaims = [];
    component.historicalReleaseId = null;
    component.releaseHistoricalName(item);
    expect(release).not.toHaveBeenCalled();
    component.historicalClaims = [item];
    spyOn(component, 'loadHistoricalLinks');
    spyOn(component, 'loadCompetition');
    component.releaseHistoricalName(item);
    expect(release).toHaveBeenCalledOnceWith(7, 60);
    expect(component.loadCompetition).toHaveBeenCalled();
  });

  it('does not show historical claims from another community after navigation', () => {
    const pending = new Subject<any[]>();
    component.selected = { id: 7, myRole: 'MEMBER' } as any;
    component.historicalClaims = [];
    (component as any).communityService = {
      myHistoricalClaims: () => pending.asObservable(),
      historicalPlayerCandidates: () => of([])
    };
    component.loadHistoricalLinks(7);
    component.selected = { id: 8, myRole: 'MEMBER' } as any;
    pending.next([{ id: 60, playerId: 5, historicalName: 'Ferreirinha',
      targetUsername: 'TMF14', status: 'ACCEPTED' }]);
    expect(component.historicalClaims).toEqual([]);
  });

  it('allows joining an upcoming open community session', () => {
    expect(component.canJoinCommunitySession(session)).toBeTrue();
  });

  it('hides joining when a community session has started or ended', () => {
    session.gameDate = new Date(Date.now() - 60_000).toISOString();
    expect(component.canJoinCommunitySession(session)).toBeFalse();
    session.gameDate = new Date(Date.now() + 3_600_000).toISOString();
    for (const status of ['CANCELLED', 'COMPLETED']) {
      session.status = status;
      expect(component.canJoinCommunitySession(session)).toBeFalse();
    }
  });

  it('hides joining for private games or existing participation', () => {
    session.privateGame = true;
    expect(component.canJoinCommunitySession(session)).toBeFalse();
    session.privateGame = false;
    session.joinedByViewer = true;
    expect(component.canJoinCommunitySession(session)).toBeFalse();
    session.joinedByViewer = false;
    session.waitlistedByViewer = true;
    expect(component.canJoinCommunitySession(session)).toBeFalse();
  });

  it('allows opening an upcoming community-only session', () => {
    expect(component.canOpenSessionToPublic(session)).toBeTrue();
  });

  it('hides the action for sessions that already started', () => {
    session.gameDate = new Date(Date.now() - 60_000).toISOString();
    expect(component.canOpenSessionToPublic(session)).toBeFalse();
  });

  it('hides the action for cancelled and completed sessions', () => {
    for (const status of ['CANCELLED', 'COMPLETED']) {
      session.status = status;
      expect(component.canOpenSessionToPublic(session)).toBeFalse();
    }
  });

  it('hides the action for full and already public sessions', () => {
    session.participantCount = session.maxParticipants;
    expect(component.canOpenSessionToPublic(session)).toBeFalse();
    session.participantCount = 2;
    session.audience = 'PUBLIC';
    expect(component.canOpenSessionToPublic(session)).toBeFalse();
  });

  it('lets managers return a public future session to members-only even when full', () => {
    session.audience = 'PUBLIC';
    expect(component.canRestrictSessionToMembers(session)).toBeTrue();
    session.participantCount = session.maxParticipants;
    session.status = 'FULL';
    expect(component.canRestrictSessionToMembers(session)).toBeTrue();
    session.status = 'CANCELLED';
    expect(component.canRestrictSessionToMembers(session)).toBeFalse();
    session.status = 'OPEN';
    session.gameDate = new Date(Date.now() - 60_000).toISOString();
    expect(component.canRestrictSessionToMembers(session)).toBeFalse();
    session.gameDate = new Date(Date.now() + 3600_000).toISOString();
    session.audience = 'COMMUNITY_ONLY';
    expect(component.canRestrictSessionToMembers(session)).toBeFalse();
    session.audience = 'PUBLIC';
    (component.canManage as jasmine.Spy).and.returnValue(false);
    expect(component.canRestrictSessionToMembers(session)).toBeFalse();
  });

  it('changes the audience only for the selected community after the API accepts it', () => {
    component.selected = { id: 12 } as any;
    component.communitySessions = [session];
    session.audience = 'PUBLIC';
    const update = jasmine.createSpy('restrictSessionToMembers').and.returnValue(
      of({...session,audience:'COMMUNITY_ONLY'}));
    (component as any).communityService = { restrictSessionToMembers:update };
    component.restrictSessionToMembers(session);
    expect(update).toHaveBeenCalledOnceWith(12,42);
    expect(component.communitySessions[0].audience).toBe('COMMUNITY_ONLY');
  });

  it('hides the action for non-managers', () => {
    (component.canManage as jasmine.Spy).and.returnValue(false);
    expect(component.canOpenSessionToPublic(session)).toBeFalse();
  });
  it('shows discovery sports with legacy and no-sport fallback', () => {
    expect(component.communitySports({
      sport: 'Futebol', sports: ['Futebol', 'Padel', 'Natação']
    })).toEqual(['Futebol', 'Padel', 'Natação']);
    expect(component.communitySports({ sport: 'Ténis' })).toEqual(['Ténis']);
    expect(component.communitySports({ sport: null, sports: [] })).toEqual([]);
  });

  it('reads both legacy single-sport groups and the new sports array', () => {
    const group = {
      id: 7, name: 'CNG', description: null, sport: 'Futebol',
      visibility: 'PRIVATE', myRole: 'OWNER', memberCount: 2
    } as any;
    expect(component.communitySports(group)).toEqual(['Futebol']);
    group.sports = ['Futebol', 'Padel'];
    expect(component.communitySports(group)).toEqual(['Futebol', 'Padel']);
    group.sport = null;
    group.sports = [];
    expect(component.communitySports(group)).toEqual([]);
  });


  it('preserves all optional modules for legacy responses but hides disabled ones', () => {
    const group = { id: 7, rankingsEnabled: false } as any;
    expect(component.hasCompetitions(group)).toBeTrue();
    group.individualTournamentsEnabled = false;
    group.teamTournamentsEnabled = false;
    expect(component.hasCompetitions(group)).toBeFalse();
    group.teamTournamentsEnabled = true;
    expect(component.hasCompetitions(group)).toBeTrue();
    component.selected = group;
    expect(component.canBrowseHistoricalArchives).toBeTrue();
    component.setTab('ranking');
    expect(component.activeTab).toBe('ranking');
    component.setTab('stats');
    expect(component.activeTab).toBe('ranking');
    group.individualTournamentsEnabled = false;
    group.teamTournamentsEnabled = false;
    component.setTab('home');
    expect(component.canBrowseHistoricalArchives).toBeFalse();
    component.setTab('ranking');
    expect(component.activeTab).toBe('home');
    group.rankingsEnabled = true;
    component.setTab('ranking');
    expect(component.activeTab).toBe('ranking');
  });

  it('shows archived history without enabling live standings or tournament features', () => {
    component.selected = {
      id: 7, rankingsEnabled: false, individualTournamentsEnabled: false,
      teamTournamentsEnabled: false
    } as any;
    component.archiveSummaries = [];
    component.matchArchiveSummaries = [];
    component.activeTab = 'home';
    expect(component.canBrowseHistoricalArchives).toBeFalse();
    component.matchArchiveSummaries = [{
      id: 10, title: 'Taça 2020', entryType: 'TEAM',
      sourceFilename: 'games.csv', createdAt: '2026-10-17T20:00:00Z'
    }];
    expect(component.canBrowseHistoricalArchives).toBeTrue();
    component.setTab('ranking');
    expect(component.activeTab).toBe('ranking');
    expect(component.selected?.rankingsEnabled).toBeFalse();
    component.setTab('stats');
    expect(component.activeTab).toBe('ranking');
    component.matchArchiveSummaries = [];
    component.archiveSummaries = [{
      id: 11, title: 'Época 2021', entryType: 'INDIVIDUAL', seasonId: null,
      sourceFilename: 'table.xlsx', createdAt: '2026-10-17T20:00:00Z'
    }];
    expect(component.canBrowseHistoricalArchives).toBeTrue();
  });

  it('allows admins to configure member session creation without modifying past games', () => {
    const group = { id: 7, name: 'Grupo', membersCanCreateSessions: true, myRole: 'OWNER' } as any;
    component.selected = group;
    component.communities = [group];
    (component.canManage as jasmine.Spy).and.returnValue(true);
    const save = jasmine.createSpy('updateSessionCreationPolicy').and.returnValue(
      of({ ...group, membersCanCreateSessions: false }));
    (component as any).communityService = { updateSessionCreationPolicy: save };
    component.editSessionPolicy();
    expect(component.sessionPolicyDraft).toBeTrue();
    component.sessionPolicyDraft = false;
    component.saveSessionPolicy();
    expect(save).toHaveBeenCalledOnceWith(7, false);
    expect(component.selected?.membersCanCreateSessions).toBeFalse();
    expect(component.sessionPolicyEditing).toBeFalse();
    (component.canManage as jasmine.Spy).and.returnValue(false);
    component.editSessionPolicy();
    expect(component.sessionPolicyEditing).toBeFalse();
  });

  it('allows manager to configure independent modules and saves without clearing history', () => {
    const original = { id: 7, rankingsEnabled: true,
      individualTournamentsEnabled: true, teamTournamentsEnabled: false } as any;
    component.selected = original;
    (component.canManage as jasmine.Spy).and.returnValue(true);
    const update = jasmine.createSpy('updateFeatures').and.returnValue(
      of({ ...original, rankingsEnabled: false,
        individualTournamentsEnabled: false, teamTournamentsEnabled: true }));
    const groups = { updateFeatures: update } as any;
    (component as any).communityService = groups;
    component.communities = [original];
    spyOn(component as any, 'loadCompetition');
    component.editFeatures();
    expect(component.featuresEditing).toBeTrue();
    component.featuresDraft.rankingsEnabled = false;
    component.featuresDraft.individualTournamentsEnabled = false;
    component.featuresDraft.teamTournamentsEnabled = true;
    component.saveFeatures();
    expect(update).toHaveBeenCalledWith(7, {
      rankingsEnabled: false, individualTournamentsEnabled: false,
      teamTournamentsEnabled: true
    });
    expect(component.selected?.teamTournamentsEnabled).toBeTrue();
    expect(component.featuresEditing).toBeFalse();
  });

  it('lets organizers edit sport lists but prevents members changing them', () => {
    const group = {
      id: 7, name: 'CNG', sport: 'Futebol', sports: ['Futebol'],
      myRole: 'OWNER'
    } as any;
    component.selected = group;
    (component.canManage as jasmine.Spy).and.returnValue(true);
    component.editSports();
    expect(component.editingSports).toBeTrue();
    component.sportsSearch = 'pad';
    expect(component.availableSportSuggestions).toContain('Padel');
    component.addCommunitySport('Padel');
    component.addCommunitySport('Padel');
    expect(component.sportsDraft).toEqual(['Futebol', 'Padel']);
    component.removeCommunitySport('Futebol');
    expect(component.sportsDraft).toEqual(['Padel']);
    component.cancelSportsEdit();
    expect(component.editingSports).toBeFalse();
    (component.canManage as jasmine.Spy).and.returnValue(false);
    component.editSports();
    expect(component.editingSports).toBeFalse();
  });

  it('offers real World Skate 2026 heat recording when optional standings are disabled', () => {
    component.selected = {
      id: 7, name: 'Patinagem', sport: 'Patinagem de Velocidade',
      sports: ['Patinagem de Velocidade', 'Futebol'],
      rankingsEnabled: false, individualTournamentsEnabled: true
    } as any;
    expect(component.canRecordInlineSpeedWithoutRankings).toBeTrue();
    expect(component.newRoundSport).toBe('Patinagem de Velocidade');
    const options = component.eventOptions(component.newRoundSport).map(e => e.code);
    expect(options).toContain('INLINE_TRACK_500D_FIRST_ROUND');
    expect(options).toContain('INLINE_ROAD_LAP_SEMI_HEAT');
    expect(options).toContain('INLINE_TRACK_500D_FINAL_A');
    expect(options).not.toContain('INLINE_TRACK_200_TT');
    expect(options).not.toContain('INLINE_TRACK_500D_FINAL_B');
    expect(component.eventOptions('Futebol')).toEqual([]);
  });

  it('records skating for an existing competition even when it differs from community sports', () => {
    component.selected = {
      id: 9, sport: 'Futebol', sports: ['Futebol'],
      rankingsEnabled: false, individualTournamentsEnabled: true
    } as any;
    component.speedTournamentPresent = true;
    expect(component.canRecordInlineSpeedWithoutRankings).toBeTrue();
    expect(component.newRoundSport).toBe('Patinagem de Velocidade');
    expect(component.eventOptions(component.newRoundSport).map(option => option.code))
      .toContain('INLINE_ROAD_LAP_FIRST_ROUND');
    component.speedTournamentPresent = false;
    expect(component.canRecordInlineSpeedWithoutRankings).toBeFalse();
  });

  it('does not expose standalone heat recording to a disabled or unrelated community', () => {
    component.selected = {
      id: 8, sport: 'Futebol', rankingsEnabled: false,
      individualTournamentsEnabled: true
    } as any;
    expect(component.canRecordInlineSpeedWithoutRankings).toBeFalse();
    component.selected = {
      id: 8, sport: 'Patinagem de Velocidade', rankingsEnabled: false,
      individualTournamentsEnabled: false
    } as any;
    expect(component.canRecordInlineSpeedWithoutRankings).toBeFalse();
  });

  it('keeps all existing World Skate event choices when general rankings remain active', () => {
    component.selected = {
      id: 7, sport: 'Patinagem de Velocidade',
      rankingsEnabled: true, individualTournamentsEnabled: true
    } as any;
    expect(component.canRecordInlineSpeedWithoutRankings).toBeFalse();
    expect(component.eventOptions('Patinagem de Velocidade').map(e => e.code))
      .toContain('INLINE_TRACK_200_TT');
  });


  it('keeps backend import validation details in PT and translates unknown errors in EN', () => {
    const original = localStorage.getItem('d24-language');
    try {
      const failure = { error: { message: 'Linha 4: mapeamento inválido' }, status: 422 };
      localStorage.setItem('d24-language', 'pt');
      expect((component as any).importRequestError(failure, 'communities.archive.previewError'))
        .toBe('Linha 4: mapeamento inválido');
      localStorage.setItem('d24-language', 'en');
      expect((component as any).importRequestError(failure, 'communities.archive.previewError'))
        .toBe('We could not analyse these standings. Check the Name and Points columns.');
      expect((component as any).importRequestError(failure, 'communities.matches.confirmError'))
        .toBe('Could not save these historical matches.');
      localStorage.setItem('d24-language', 'pt');
      expect((component as any).importRequestError({ error: { message: '  ' } }, 'communities.import.inspectError'))
        .toBe('Não foi possível analisar este ficheiro.');
      expect((component as any).importRequestError({
        error: { message: 'x'.repeat(241) }
      }, 'communities.import.inspectError')).toBe('Não foi possível analisar este ficheiro.');
    } finally {
      if (original === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', original);
    }
  });

  it('localizes community feature changes and preserves saved module settings', () => {
    const original = localStorage.getItem('d24-language');
    const saved = { id: 7, rankingsEnabled: false,
      individualTournamentsEnabled: true, teamTournamentsEnabled: true } as any;
    component.selected = saved;
    component.communities = [saved];
    const update = jasmine.createSpy('updateFeatures').and.returnValue(of(saved));
    (component as any).communityService = { updateFeatures: update };
    spyOn(component as any, 'loadCompetition');
    try {
      localStorage.setItem('d24-language', 'en');
      component.editFeatures();
      component.saveFeatures();
      expect(component.featuresFeedback).toBe('Features updated. Existing history has been preserved.');
      expect(update).toHaveBeenCalledOnceWith(7, {
        rankingsEnabled: false, individualTournamentsEnabled: true, teamTournamentsEnabled: true
      });
      localStorage.setItem('d24-language', 'pt');
      component.editFeatures();
      component.saveFeatures();
      expect(component.featuresFeedback).toBe('Funcionalidades atualizadas. O histórico foi preservado.');
    } finally {
      if (original === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', original);
    }
  });

});
