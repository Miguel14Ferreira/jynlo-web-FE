import { Component, HostListener, OnDestroy, QueryList, ViewChildren, inject } from '@angular/core';
import { CALL_BACKGROUND_IMAGES } from './call-backgrounds';
import { Router } from '@angular/router';
import { CommunityService } from '../services/community.service';
import { FriendSummary } from '../pages/model/friend-summary';
import { timeout } from 'rxjs';
import { CommonModule } from '@angular/common';
import { LocalParticipant, RemoteParticipant, Track } from 'livekit-client';
import { FormsModule } from '@angular/forms';
import { CallParticipantTileComponent } from './call-participant-tile.component';
import { DirectCallChatPanelComponent } from './direct-call-chat-panel.component';
import { combineLatest, map, Observable, Subscription, timer } from 'rxjs';
import { TranslatePipe } from '../i18n/translate.pipe';
import { appTranslate } from '../i18n/i18n.service';
import { DirectCallClientService } from '../services/direct-call-client.service';

/**
 * Compact, responsive call surface with persistent call controls, a duration
 * clock, connection diagnostics and in-call media device recovery.
 */
@Component({
  selector: 'app-direct-call-overlay',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, CallParticipantTileComponent, DirectCallChatPanelComponent],
  template: `
    @if (calls.state$ | async; as call) {
      @if (call.phase === 'incoming') {
        <!-- Call notifications are global but non-modal: never block navigation
             until the recipient explicitly accepts. -->
        <section class="call-incoming-float" role="alertdialog" aria-modal="false"
          [attr.aria-label]="'calls.incoming' | t" (keydown.escape)="calls.decline()">
          <div class="call-incoming-card">
            <header class="call-incoming-topline">
              <strong>JYNLO</strong>
              <span class="call-incoming-pulse" aria-hidden="true"></span>
              <span>{{ 'calls.incoming' | t }}</span>
            </header>
            <div class="call-incoming-person">
              <div class="call-incoming-avatar" aria-hidden="true">
                @if (profilePhoto(call.peer); as photo) {
                  <img [src]="photo" alt="" referrerpolicy="no-referrer" (error)="hideBrokenPhoto(call.peer)">
                } @else { {{ call.peer.slice(0,1).toUpperCase() }} }
              </div>
              <div class="call-incoming-person-copy">
                <h2>{{ call.peer }}</h2>
                <p>{{ (call.media === 'video' ? 'calls.video' : 'calls.voice') | t }}</p>
              </div>
            </div>
            @if (calls.ringtoneBlocked$ | async) {
              <div class="call-incoming-audio">
                <p role="status">{{ 'calls.ringtoneBlocked' | t }}</p>
                <button type="button" (click)="calls.allowRingtone()">
                  {{ 'calls.enableRingtone' | t }}
                </button>
              </div>
            }
            <div class="call-incoming-actions">
              <button type="button" class="call-incoming-decline"
                (click)="calls.decline()">
                <span aria-hidden="true">✕</span> {{ 'calls.decline' | t }}
              </button>
              @if (call.media === 'video') {
                <button type="button" class="call-incoming-accept call-incoming-accept--audio"
                  (click)="calls.accept(false)">
                  <span aria-hidden="true">✓</span>
                  {{ 'calls.acceptCameraOff' | t }}
                </button>
                <button type="button" class="call-incoming-accept"
                  (click)="calls.accept(true)">
                  <span aria-hidden="true">▣</span>
                  {{ 'calls.acceptWithVideo' | t }}
                </button>
              } @else {
                <button type="button" class="call-incoming-accept"
                  (click)="calls.accept()">
                  <span aria-hidden="true">✓</span>
                  {{ 'calls.accept' | t }}
                </button>
              }
            </div>
          </div>
        </section>
      } @else if (minimized && call.phase !== 'error') {
        <div class="connect-mini" role="group" [attr.aria-label]="'calls.title' | t">
          <!-- Subscribe to LiveKit track revisions even while minimized, so
               audio-only tiles receive new microphone/screen-audio tracks. -->
          <span class="call-refresh" aria-hidden="true">{{ calls.mediaChanged$ | async }}</span>
          <!-- Remote sound stays attached even while the full call view is minimized. -->
          <div class="connect-mini-audio" aria-hidden="true">
            @for (person of participants; track person.identity) {
              @if (person !== calls.room?.localParticipant) {
                <app-call-participant-tile [participant]="person" [label]="participantLabel(person)" [avatarUrl]="profilePhoto(participantUsername(person))"
                  [audioOnly]="true" [volume]="volumeFor(person.identity)"
                  [microphoneVolume]="volumeFor(person.identity)"
                  [screenShareVolume]="screenVolumeFor(person.identity)"
                  [audioOutputDeviceId]="(calls.selectedDevices$ | async)?.audiooutput"/>
              }
            }
          </div>
          <div class="connect-mini-name"><span class="call-incoming-pulse"></span>
            <strong>{{ call.peer }}</strong>
            <small>{{ (call.phase === 'connecting' ? 'calls.reconnecting' : (call.startedAt ? 'calls.connected' : 'calls.ringing')) | t }}</small>
          </div>
          <button type="button" class="connect-mini-chat" (click)="openChat(call.peer)"
            [attr.aria-label]="'calls.openChatKeepCall' | t">{{ 'Chat' | t }}</button>
          <button type="button" class="connect-mini-expand" (click)="minimized=false">{{ 'calls.expand' | t }}</button>
          <button type="button" class="connect-mini-hangup" (click)="calls.end()"
            [attr.aria-label]="'calls.hangUp' | t">✕</button>
        </div>
      } @else {
      <!-- With an image background the self-view is not mirrored, otherwise its text reads backwards. -->
      <section class="call-backdrop" role="dialog" aria-modal="true"
          [class.call-bg-image]="isImageBackground(calls.backgroundMode$ | async)"
          [attr.aria-label]="'calls.title' | t" (keydown.escape)="minimize()">
        <div class="call-panel" [class.call-panel--chat-open]="showCallChat" tabindex="-1">
          <header class="call-topline">
            <strong class="call-brand">Jynlo <span class="call-brand-dot">●</span>
              <span class="connect-brand-label">{{ 'Connect' | t }}</span></strong>
            <div class="connect-head-actions">
              <span class="call-kind">{{ (videoActive ? 'calls.video' : 'calls.voice') | t }}</span>
              @if (call.phase !== 'error') {
                <button type="button" class="connect-minimize" (click)="minimize()"
                  [attr.aria-label]="'calls.minimize' | t">−</button>
              }
            </div>
          </header>
          <div class="call-info">
            <button type="button" class="call-peer-profile" (click)="openPeerProfile(call.peer)"
              [attr.aria-label]="('Ver perfil de {{peer}}' | t:{peer: call.peer})" [title]="('Ver perfil de {{peer}}' | t:{peer: call.peer})">
              <span class="call-avatar" aria-hidden="true">
                @if (profilePhoto(call.peer); as photo) {
                  <img [src]="photo" alt="" referrerpolicy="no-referrer" (error)="hideBrokenPhoto(call.peer)">
                } @else { {{ call.peer.slice(0,1).toUpperCase() }} }
              </span>
              <span class="call-peer-name">{{ call.peer }}</span>
            </button>
            <div class="call-summary">
              <p class="call-phase" role="status">
                <span class="call-status-dot" [class.call-status-connected]="call.phase === 'active'"></span>
                {{ (call.phase === 'dialing' ? 'calls.ringing' :
                  call.phase === 'connecting' ? (call.startedAt ? 'calls.reconnecting' : 'calls.connecting') :
                  call.phase === 'error' ? 'calls.connectionLost' : 'calls.connected') | t }}
              </p>
            </div>
          </div>
          @if (call.phase !== 'error') {
            <div class="call-metrics">
              @if (call.startedAt) {
                <span class="call-metric"><span aria-hidden="true">◷</span> {{ elapsed$ | async }}</span>
              }
              @if (call.phase === 'active') {
                <span class="call-metric call-quality" [class.is-poor]="(calls.connectionQuality$ | async) === 'poor' || (calls.connectionQuality$ | async) === 'lost'">
                  <span aria-hidden="true">▰</span>
                  {{ (qualityKey(calls.connectionQuality$ | async) | t) }}
                </span>
                <span class="call-metric">{{ 'calls.participants' | t }}: {{ participantCount }}</span>
              }
            </div>
          }
          @if (showCallChat && call.phase !== 'error') {
            <aside class="call-chat-dock" [attr.aria-label]="'calls.callChat' | t">
              <app-direct-call-chat-panel [peer]="call.peer"></app-direct-call-chat-panel>
              <button type="button" class="call-chat-full" (click)="openChat(call.peer)"
                [attr.aria-label]="'calls.openChatKeepCall' | t">
                {{ 'calls.openFullChat' | t }}
              </button>
            </aside>
          }
          @if (call.phase !== 'error') {
            <!-- LiveKit's track events can run outside Angular's change detection.
                 Keep the expanded view subscribed just like the minimized view:
                 otherwise a camera can publish successfully while its tile
                 continues to display the placeholder until another UI action. -->
            <span class="call-refresh" aria-hidden="true">{{ calls.mediaChanged$ | async }}</span>
            @if (call.phase === 'dialing' || (call.phase === 'connecting' && !call.startedAt)) {
              <div class="connect-waiting">
                <div class="connect-wait-avatar" aria-hidden="true">
                  @if (profilePhoto(call.peer); as photo) {
                    <img [src]="photo" alt="" referrerpolicy="no-referrer" (error)="hideBrokenPhoto(call.peer)">
                  } @else { {{ call.peer.slice(0,1).toUpperCase() }} }
                </div>
                <h3>{{ call.peer }}</h3>
                <p>{{ 'calls.waitingForAnswer' | t }}</p>
                <div class="connect-wait-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
              </div>
            } @else {
              @if (call.cameraEnabled && !ownCameraPublished && !(calls.busyMedia$ | async)) {
                <div class="connect-camera-health" role="status">
                  <span>{{ 'calls.cameraNoVideo' | t }}</span>
                  <button type="button" (click)="calls.setCamera(true)">{{ 'calls.retryCamera' | t }}</button>
                </div>
              }
              <div class="connect-participants" [class.connect-participants--video]="videoActive"
                [class.connect-participants--presenting]="showPresentation"
                [class.connect-participants--camera-focus]="!showPresentation && !!focusedCamera"
                [class.connect-participants--camera-zoom]="!showPresentation && cameraZoomed">
                @if (showPresentation) {
                  <div class="connect-share-bar">
                    <span class="connect-share-live"><span aria-hidden="true">●</span>
                      {{ 'calls.liveShare' | t }}
                    </span>
                    <button type="button" class="connect-focus-toggle"
                      [attr.aria-pressed]="focusOnly"
                      (click)="focusOnly = !focusOnly">
                      {{ (focusOnly ? 'calls.showMembers' : 'calls.hideMembers') | t }}
                    </button>
                    @if (presentingParticipants.length > 1) {
                      <nav class="connect-share-switcher" [attr.aria-label]="'calls.chooseSharedScreen' | t">
                        @for (person of presentingParticipants; track person.identity) {
                          <button type="button"
                            [class.is-selected]="focusedPresentation?.identity === person.identity"
                            [attr.aria-pressed]="focusedPresentation?.identity === person.identity"
                            (click)="focusPresentation(person.identity)">
                            {{ participantLabel(person) }}
                          </button>
                        }
                      </nav>
                    }
                  </div>
                  @if (focusedPresentation; as presenter) {
                    <div class="connect-presentation-stage" [class.is-zoomed]="presentationZoomed"
                      [attr.aria-label]="'calls.sharedScreens' | t">
                      <app-call-participant-tile class="connect-presentation-tile"
                        [participant]="presenter" [presentation]="true"
                        [label]="participantLabel(presenter) + ' · ' + appTranslateLabel('calls.screen')"
                        [local]="presenter === calls.room?.localParticipant">
                      </app-call-participant-tile>
                      <button type="button" class="connect-presentation-zoom-hit"
                        [attr.aria-label]="(presentationZoomed ? 'calls.restoreSharedScreen' : 'calls.enlargeSharedScreen') | t"
                        [attr.aria-pressed]="presentationZoomed"
                        (click)="togglePresentationZoom()"
                        (keydown.escape)="presentationZoomed=false; $event.stopPropagation()">
                        <span class="connect-presentation-zoom-chip">
                          <span aria-hidden="true">{{ presentationZoomed ? '↙' : '⤢' }}</span>
                          {{ (presentationZoomed ? 'calls.restoreSharedScreen' : 'calls.enlargeSharedScreen') | t }}
                        </span>
                      </button>
                    </div>
                  }
                  <div class="connect-camera-strip" [class.is-focus-hidden]="focusOnly"
                    [attr.aria-label]="'calls.callParticipants' | t">
                    @for (person of participants; track person.identity) {
                      <div class="connect-camera-slot">
                        <app-call-participant-tile [participant]="person"
                          [label]="participantLabel(person)" [avatarUrl]="profilePhoto(participantUsername(person))" [local]="person === calls.room?.localParticipant"
                          [volume]="volumeFor(person.identity)"
                          [microphoneVolume]="volumeFor(person.identity)"
                          [screenShareVolume]="screenVolumeFor(person.identity)"
                          [audioOutputDeviceId]="(calls.selectedDevices$ | async)?.audiooutput">
                        </app-call-participant-tile>
                        <!-- Enlarging a camera during a share temporarily shows it in full; ↙ or Escape returns to the screen. -->
                        <button type="button" class="connect-camera-maximize"
                          [attr.aria-label]="('calls.maximizeCamera' | t) + ': ' + participantLabel(person)"
                          (click)="zoomCamera(person.identity)">
                          <span aria-hidden="true">⛶</span>
                        </button>
                      </div>
                    }
                  </div>
                  @if (localHasScreenShare) {
                    <div class="connect-self-share-preview" [class.is-collapsed]="!showOwnSharePreview">
                      <div class="connect-self-share-heading">
                        <strong>{{ 'calls.selfSharePreview' | t }}</strong>
                        <span>{{ 'calls.selfShareHelp' | t }}</span>
                        <button type="button" (click)="showOwnSharePreview = !showOwnSharePreview"
                          [attr.aria-expanded]="showOwnSharePreview">
                          {{ (showOwnSharePreview ? 'calls.hideSharePreview' : 'calls.showSharePreview') | t }}
                        </button>
                        <button type="button" class="connect-self-stop" [disabled]="calls.busyMedia$ | async"
                          (click)="calls.setScreenShare(false)">{{ 'calls.stopSharing' | t }}</button>
                      </div>
                      @if (showOwnSharePreview && calls.room?.localParticipant; as self) {
                        <app-call-participant-tile class="connect-self-share-tile"
                          [participant]="self" [presentation]="true" [local]="true"
                          [label]="'calls.selfSharePreview' | t">
                        </app-call-participant-tile>
                      }
                    </div>
                  }
                } @else {
                  @for (person of participants; track person.identity) {
                    <div class="connect-camera-slot"
                      [class.is-focused]="focusedCamera?.identity === person.identity">
                      <app-call-participant-tile [participant]="person"
                        [label]="participantLabel(person)" [avatarUrl]="profilePhoto(participantUsername(person))" [local]="person === calls.room?.localParticipant"
                        [volume]="volumeFor(person.identity)"
                        [microphoneVolume]="volumeFor(person.identity)"
                        [screenShareVolume]="screenVolumeFor(person.identity)"
                        [audioOutputDeviceId]="(calls.selectedDevices$ | async)?.audiooutput">
                      </app-call-participant-tile>
                      <button type="button" class="connect-camera-focus-hit"
                        [attr.aria-label]="((focusedCamera?.identity === person.identity ? 'calls.restoreCameraGrid' : 'calls.focusCamera') | t) + ': ' + participantLabel(person)"
                        [attr.aria-pressed]="focusedCamera?.identity === person.identity"
                        (click)="toggleCameraFocus(person.identity)"
                        (keydown.escape)="clearCameraFocus(); $event.stopPropagation()">
                        <span aria-hidden="true">{{ focusedCamera?.identity === person.identity ? '↙' : '⤢' }}</span>
                      </button>
                      <button type="button" class="connect-camera-maximize"
                        [attr.aria-label]="((cameraZoomed && focusedCamera?.identity === person.identity ? 'calls.restoreCameraFocus' : 'calls.maximizeCamera') | t) + ': ' + participantLabel(person)"
                        [attr.aria-pressed]="cameraZoomed && focusedCamera?.identity === person.identity"
                        (click)="zoomCamera(person.identity)"
                        (keydown.escape)="clearCameraFocus(); $event.stopPropagation()">
                        <span aria-hidden="true">{{ cameraZoomed && focusedCamera?.identity === person.identity ? '↙' : '⛶' }}</span>
                      </button>
                    </div>
                  }
                }
              </div>
              @if (participantCount > 1) {
                  <div class="connect-share-audio" [attr.aria-label]="'calls.shareAudioMixer' | t">
                    @for (person of participants; track person.identity) {
                      @if (person !== calls.room?.localParticipant) {
                        <label>
                          {{ participantLabel(person) }} · {{ 'calls.microphoneVolume' | t }}
                          <input type="range" min="0" max="100" step="5"
                            [value]="volumeFor(person.identity) * 100"
                            (input)="setVolume(person.identity,$any($event.target).value)"
                            [attr.aria-label]="('calls.microphoneVolume' | t) + ' · ' + participantLabel(person)">
                          <strong>{{ volumeFor(person.identity) * 100 | number:'1.0-0' }}%</strong>
                        </label>
                        @if (personHasScreenShare(person)) {
                          <label>
                            {{ participantLabel(person) }} · {{ 'calls.sharedAudioVolume' | t }}
                            <input type="range" min="0" max="100" step="5"
                              [value]="screenVolumeFor(person.identity) * 100"
                              (input)="setScreenVolume(person.identity,$any($event.target).value)"
                              [attr.aria-label]="('calls.sharedAudioVolume' | t) + ' · ' + participantLabel(person)">
                            <strong>{{ screenVolumeFor(person.identity) * 100 | number:'1.0-0' }}%</strong>
                          </label>
                        }
                      }
                    }
                  </div>
              }
            }
          }
          <div class="call-feedback" aria-live="polite">
            @if (call.error) {
              <p class="call-error" role="alert">{{ call.error | t }}</p>
              @if (recoveryHintKey(call.error); as hint) {
                <p class="call-audio-help" role="status">{{ hint | t }}</p>
              }
              @if (call.error.startsWith('calls.camera') && !call.cameraEnabled && call.phase !== 'error') {
                <div class="call-recovery-actions">
                  <button type="button" class="call-retry" [disabled]="calls.busyMedia$ | async"
                    (click)="calls.setCamera(true)">{{ 'calls.retryCamera' | t }}</button>
                  <button type="button" class="call-retry" [disabled]="calls.busyMedia$ | async"
                    (click)="toggleSettings(true)">{{ 'calls.chooseCamera' | t }}</button>
                </div>
              }
              @if (call.error.startsWith('calls.microphone') && !call.micEnabled && call.phase !== 'error') {
                <div class="call-recovery-actions">
                  <button type="button" class="call-retry" [disabled]="calls.busyMedia$ | async"
                    (click)="calls.setMicrophone(true)">{{ 'calls.retryMicrophone' | t }}</button>
                  <button type="button" class="call-retry" (click)="toggleSettings(true)">
                    {{ 'calls.chooseMicrophone' | t }}
                  </button>
                </div>
              }
            }
            @if (call.phase === 'dialing' && (calls.ringtoneBlocked$ | async)) {
              <p class="call-audio-help" role="status">{{ 'calls.ringtoneBlocked' | t }}</p>
            }
          </div>
          <footer class="call-footer">
            @if (backgroundTray && call.cameraEnabled && calls.backgroundSupported && !settingsOpen) {
              <div class="call-bg-tray" role="dialog" [attr.aria-label]="'Escolhe um fundo para a câmara' | t">
                <div class="call-bg-tray-head">
                  <span>{{ 'A tua câmara está ligada. Queres um fundo?' | t }}</span>
                  <button type="button" class="call-bg-tray-close" (click)="backgroundTray=false" [attr.aria-label]="'Fechar sugestões de fundo' | t">✕</button>
                </div>
                <ng-container *ngTemplateOutlet="backgroundPicker"></ng-container>
              </div>
            }
            <div class="call-buttons">
              @if (call.phase === 'dialing' && (calls.ringtoneBlocked$ | async)) {
                <button type="button" class="call-enable-sound" (click)="calls.allowRingtone()">
                  {{ 'calls.enableRingtone' | t }}
                </button>
              }
              @if (call.phase === 'error') {
                <button type="button" class="call-decline" (click)="calls.closeError()">
                  {{ 'calls.close' | t }}
                </button>
              } @else {
                <button type="button" (click)="calls.setMicrophone(!call.micEnabled)"
                  [attr.aria-pressed]="!call.micEnabled" [class.call-off]="!call.micEnabled">
                  @if (call.micEnabled) {
                    <svg class="call-action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></svg>
                  } @else {
                    <svg class="call-action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 9v3a3 3 0 0 0 5.2 2M15 9V5a3 3 0 0 0-5.3-1.9M5 10v2a7 7 0 0 0 12 4.9M19 10v2a7 7 0 0 1-.3 2M12 19v3m-4 0h8M3 3l18 18"/></svg>
                  }
                  {{ (call.micEnabled ? 'calls.mute' : 'calls.unmute') | t }}
                </button>
                <button type="button" [disabled]="calls.busyMedia$ | async"
                    (click)="toggleCamera(!call.cameraEnabled)"
                    [attr.aria-pressed]="!call.cameraEnabled" [class.call-off]="!call.cameraEnabled">
                    @if (call.cameraEnabled) {
                      <svg class="call-action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="15" height="14" rx="2"/><path d="m17 10 5-3v10l-5-3"/></svg>
                    } @else {
                      <svg class="call-action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="15" height="14" rx="2"/><path d="m17 10 5-3v10l-5-3M3 3l18 18"/></svg>
                    }
                    {{ (call.cameraEnabled ? 'calls.cameraOff' : 'calls.cameraOn') | t }}
                  </button>
                @if (calls.canShareScreen) {
                  <button type="button" [disabled]="calls.busyMedia$ | async"
                    (click)="calls.setScreenShare(!calls.screenShareEnabled$.value)"
                    [attr.aria-pressed]="calls.screenShareEnabled$ | async">
                    <svg class="call-action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8M12 16v5"/></svg>
                    {{ ((calls.screenShareEnabled$ | async) ? 'calls.stopSharing' : 'calls.shareScreen') | t }}
                  </button>
                }
                @if (calls.screenShareFeedback$ | async; as screenFeedback) {
                  <p class="connect-screen-share-feedback" role="status">{{ screenFeedback | t }}</p>
                }
                @if (calls.canShareScreen && call.phase === 'active' && !(calls.screenShareEnabled$ | async)) {
                  <span class="connect-screen-share-tip">{{ 'calls.fullScreenShareHint' | t }}</span>
                } @else if (!calls.canShareScreen && call.phase === 'active') {
                  <span class="connect-screen-share-tip" role="status">{{ 'calls.screenShareUnsupported' | t }}</span>
                }
                @if (calls.audioPlaybackBlocked$ | async) {
                  <button type="button" class="call-enable-sound" (click)="allowCallAudio()">
                    {{ 'calls.sound' | t }}
                  </button>
                }
                @if (call.phase === 'active') {
                  <button type="button" class="connect-invite-button" [attr.aria-expanded]="inviteOpen"
                    (click)="toggleInvites()">
                    <svg class="call-action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg> {{ 'calls.inviteMembers' | t }}
                  </button>
                }
                <button type="button" class="connect-chat-button"
                  (click)="toggleCallChat()" [attr.aria-expanded]="showCallChat"
                   [attr.aria-label]="(showCallChat?'calls.hideCallChat':'calls.showCallChat') | t">
                  <svg class="call-action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5Z"/></svg> {{ 'Chat' | t }}
                </button>
                <button type="button" class="call-settings-button"
                  [attr.aria-expanded]="settingsOpen" (click)="toggleSettings();inviteOpen=false">
                  <svg class="call-action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l-1.8 1.8a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21h-2.5v-1.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-1.8-1.8a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H5v-2.5h1.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l1.8-1.8a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V3h2.5v1.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l1.8 1.8a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1H21v2.5h-1.1a1.7 1.7 0 0 0-1.5 1Z"/></svg> {{ 'calls.settings' | t }}
                </button>
                <button type="button" class="call-decline" (click)="calls.end()">
                  <svg class="call-action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg> {{ 'calls.hangUp' | t }}
                </button>
              }
            </div>
            @if (inviteOpen && call.phase === 'active') {
              <section class="connect-invite-panel" [attr.aria-label]="'calls.inviteMembers' | t">
                <div class="connect-invite-heading">
                  <div>
                    <span class="connect-invite-eyebrow">{{ 'Jynlo Connect' | t }}</span>
                    <h3>{{ 'calls.inviteMembers' | t }}</h3>
                    <p>{{ 'Adiciona amigos à chamada atual. Só entram depois de aceitar o convite.' | t }}</p>
                  </div>
                  <button type="button" class="connect-invite-close" (click)="inviteOpen=false"
                    [attr.aria-label]="'Fechar convites' | t" [title]="'Fechar convites' | t">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                      stroke-width="2" stroke-linecap="round" aria-hidden="true">
                      <path d="M18 6 6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
                <form class="connect-invite-form" (ngSubmit)="inviteMember()">
                  <label for="connect-invite-name">{{ 'Procurar por nome de utilizador' | t }}</label>
                  <div class="connect-invite-search">
                    <input id="connect-invite-name" type="search" autocomplete="off"
                      name="inviteUsername" [ngModel]="inviteUsername" (ngModelChange)="inviteUsername=$event"
                      maxlength="128" [disabled]="(calls.invitationBusy$ | async) ?? false"
                      [placeholder]="'Pesquisar amigos ou escrever @username' | t">
                    <button type="submit"
                      [disabled]="(calls.invitationBusy$ | async) || !inviteUsername.trim()">
                      {{ (calls.invitationBusy$ | async) ? ('A enviar…' | t) : ('Convidar' | t) }}
                    </button>
                  </div>
                </form>
                @if (calls.invitationError$ | async; as inviteError) {
                  <p class="connect-invite-error" role="alert">{{ inviteError | t }}</p>
                }
                <div class="connect-invite-list-heading">
                  <strong>{{ inviteUsername.trim() ? ('Resultados da pesquisa' | t) : ('Amigos disponíveis' | t) }}</strong>
                  @if (contactsLoading) { <span role="status">{{ 'A procurar…' | t }}</span> }
                </div>
                @if (contactsError) {
                  <p class="connect-invite-empty" role="alert">{{ 'Não foi possível carregar os amigos. Podes continuar a convidar pelo nome de utilizador.' | t }}</p>
                } @else if (!contactsLoading && !matchingContacts.length) {
                  <p class="connect-invite-empty">
                    {{ inviteUsername.trim() ? ('Sem correspondências na lista de amigos. Podes convidar pelo nome de utilizador acima.' | t) : ('Não há amigos disponíveis neste momento.' | t) }}
                  </p>
                }
                @if (matchingContacts.length) {
                  <div class="connect-contact-results">
                    @for (contact of matchingContacts; track contact.username) {
                      <button type="button" class="connect-contact-option"
                        [disabled]="(calls.invitationBusy$ | async) ?? false"
                        [attr.aria-label]="'Convidar ' + (contact.nickname || contact.fullName || contact.username)"
                        (click)="inviteContact(contact.username)">
                        <span class="connect-contact-avatar">
                          @if (contact.profilePicUrl) {
                            <img [src]="contact.profilePicUrl" alt="" loading="lazy" referrerpolicy="no-referrer">
                          } @else { {{ contact.username.slice(0,1).toUpperCase() }} }
                        </span>
                        <span class="connect-contact-names">
                          <strong>{{ contact.nickname || contact.fullName || contact.username }}</strong>
                          <small>&#64;{{ contact.username }}</small>
                        </span>
                        <span class="connect-contact-action">{{ 'Convidar' | t }} <span aria-hidden="true">＋</span></span>
                      </button>
                    }
                  </div>
                }
                @if (calls.members$ | async; as members) {
                  <div class="connect-member-list">
                    <div class="connect-member-heading">
                      <strong>{{ 'Na chamada' | t }}</strong>
                      <span>{{ participantCount }} {{ participantCount===1?'pessoa':'pessoas' }}</span>
                    </div>
                    @for (person of members.participants; track person.identity) {
                      <div class="connect-member-item">
                        <span class="connect-member-avatar" aria-hidden="true">
                          @if (profilePhoto(person.username); as photo) {
                            <img [src]="photo" alt="" referrerpolicy="no-referrer" (error)="hideBrokenPhoto(person.username)">
                          } @else { {{ person.username.slice(0,1).toUpperCase() }} }
                        </span>
                        <span class="connect-member-details">
                          <strong>{{ person.username }}</strong>
                          <small><span class="connect-presence-dot" aria-hidden="true"></span> {{ 'Na chamada' | t }}</small>
                        </span>
                        @if (person.identity !== calls.room?.localParticipant?.identity) {
                          <label class="connect-member-volume">
                            <span class="connect-volume-label">{{ 'calls.volume' | t }} {{ volumeFor(person.identity) * 100 | number:'1.0-0' }}%</span>
                            <input type="range" min="0" max="100" step="5"
                              [ngModel]="volumeFor(person.identity) * 100"
                              (ngModelChange)="setVolume(person.identity,$event)"
                              [ngModelOptions]="{standalone:true}"
                              [attr.aria-label]="('calls.volume' | t) + ' ' + person.username">
                          </label>
                        } @else {
                          <small class="connect-member-you">{{ 'Tu' | t }}</small>
                        }
                      </div>
                    }
                    @if (members.pending.length) {
                      <div class="connect-member-heading connect-pending-heading">
                        <strong>{{ 'Convites pendentes' | t }}</strong>
                        <span>{{ members.pending.length }}</span>
                      </div>
                      @for (pending of members.pending; track pending) {
                        <div class="connect-member-pending">
                          <span aria-hidden="true">◷</span> &#64;{{ pending }} <small>{{ 'A aguardar resposta' | t }}</small>
                        </div>
                      }
                    }
                  </div>
                }
              </section>
            }
            @if (settingsOpen && call.phase !== 'error') {
              <div class="call-device-panel" role="group" [attr.aria-label]="'calls.settings' | t">
                <div class="call-settings-head">
                  <strong>{{ 'calls.devices' | t }}</strong>
                  @if ((calls.deviceScanStatus$ | async) === 'scanning') {
                    <span class="call-device-auto-refresh" role="status">{{ 'A procurar dispositivos…' | t }}</span>
                  } @else if ((calls.deviceScanStatus$ | async) === 'unavailable') {
                    <span class="call-device-auto-refresh" role="alert">{{ 'O navegador não permite consultar os dispositivos.' | t }}</span>
                  } @else {
                    <span class="call-device-auto-refresh">{{ 'Dispositivos detetados automaticamente' | t }}</span>
                  }
                </div>
                @if (calls.devices$ | async; as devices) {
                  <label for="call-camera">{{ 'calls.cameraDevice' | t }}</label>
                    <select id="call-camera" [disabled]="(calls.busyMedia$ | async) || (calls.deviceScanStatus$ | async) === 'scanning' || (calls.deviceScanStatus$ | async) === 'unavailable'"
                      (change)="selectDevice('videoinput', $event)">
                      <option value="">{{ 'calls.selectDevice' | t }}</option>
                      @for (device of devices; track device.deviceId) {
                        @if (device.kind === 'videoinput') {
                          <option [value]="device.deviceId" [selected]="(calls.selectedDevices$ | async)?.videoinput === device.deviceId">
                            {{ device.label || ('calls.cameraDevice' | t) + ' ' + ($index+1) }}
                          </option>
                        }
                      }
                    </select>
                  <label for="call-microphone">{{ 'calls.microphoneDevice' | t }}</label>
                  <select id="call-microphone" [disabled]="(calls.busyMedia$ | async) || (calls.deviceScanStatus$ | async) === 'scanning' || (calls.deviceScanStatus$ | async) === 'unavailable'"
                    (change)="selectDevice('audioinput', $event)">
                    <option value="">{{ 'calls.selectDevice' | t }}</option>
                    @for (device of devices; track device.deviceId) {
                      @if (device.kind === 'audioinput') {
                        <option [value]="device.deviceId" [selected]="(calls.selectedDevices$ | async)?.audioinput === device.deviceId">
                          {{ device.label || ('calls.microphoneDevice' | t) + ' ' + ($index+1) }}
                        </option>
                      }
                    }
                  </select>
                  @if (speakerSelectionSupported) {
                  <label for="call-speaker">{{ 'calls.speakerDevice' | t }}</label>
                  <select id="call-speaker" [disabled]="(calls.busyMedia$ | async) || (calls.deviceScanStatus$ | async) === 'scanning' || (calls.deviceScanStatus$ | async) === 'unavailable'"
                    (change)="selectDevice('audiooutput', $event)">
                    <option value="">{{ 'calls.selectDevice' | t }}</option>
                    @for (device of devices; track device.deviceId) {
                      @if (device.kind === 'audiooutput') {
                        <option [value]="device.deviceId" [selected]="(calls.selectedDevices$ | async)?.audiooutput === device.deviceId">
                          {{ device.label || ('calls.speakerDevice' | t) + ' ' + ($index+1) }}
                        </option>
                      }
                    }
                  </select>
                }
                  @if ((calls.deviceScanStatus$ | async) === 'ready' && devices.length === 0) {
                    <p role="status">{{ 'Não foram encontrados dispositivos. Confirma as permissões no navegador.' | t }}</p>
                  }
                }
                <ng-container *ngTemplateOutlet="backgroundPicker"></ng-container>
                <p>{{ 'calls.devicesHelp' | t }}</p>
              </div>
            }
          </footer>
          <span class="call-refresh" aria-hidden="true">{{ calls.mediaChanged$ | async }}</span>
        </div>
      </section>
      }
    }
      <ng-template #backgroundPicker>
        <section class="call-bg" role="group" [attr.aria-label]="'Fundo da câmara' | t">
          <div class="call-bg-head">
            <strong>{{ 'Fundo da câmara' | t }}</strong>
            @if ((calls.backgroundBusy$ | async)) { <small role="status">{{ 'A aplicar fundo…' | t }}</small> }
          </div>
          <div class="call-bg-grid">
            <button type="button" class="call-bg-tile call-bg-none" [disabled]="(calls.backgroundBusy$ | async) || (calls.busyMedia$ | async)"
              [class.is-active]="(calls.backgroundMode$ | async) === 'none'" [attr.aria-pressed]="(calls.backgroundMode$ | async) === 'none'"
              (click)="chooseBackground('none')"><span class="call-bg-icon" aria-hidden="true">⊘</span><span class="call-bg-label">{{ 'Sem fundo' | t }}</span></button>
            <button type="button" class="call-bg-tile call-bg-blur" [disabled]="!calls.backgroundSupported || (calls.backgroundBusy$ | async) || (calls.busyMedia$ | async)"
              [class.is-active]="(calls.backgroundMode$ | async) === 'blur'" [attr.aria-pressed]="(calls.backgroundMode$ | async) === 'blur'"
              (click)="chooseBackground('blur')"><span class="call-bg-icon" aria-hidden="true">◌</span><span class="call-bg-label">{{ 'Desfocar' | t }}</span></button>
            @for (bg of backgroundImages; track bg.id) {
              <button type="button" class="call-bg-tile" [disabled]="!calls.backgroundSupported || (calls.backgroundBusy$ | async) || (calls.busyMedia$ | async)"
                [class.is-active]="(calls.backgroundMode$ | async) === bg.id" [attr.aria-pressed]="(calls.backgroundMode$ | async) === bg.id"
                [attr.aria-label]="bg.label | t" (click)="chooseBackground(bg.id)">
                <img [src]="bg.file" alt="" loading="lazy"><span class="call-bg-label">{{ bg.label | t }}</span>
              </button>
            }
          </div>
          @if (!calls.backgroundSupported) {
            <small>{{ 'Este navegador não suporta fundos virtuais. A câmara normal continua disponível.' | t }}</small>
          }
          @if (calls.backgroundError$ | async; as backgroundError) {
            <p class="call-background-error" role="alert">{{ backgroundError }}</p>
          }
        </section>
      </ng-template>
  `,
  styles: [`
    :host{display:contents}
    /* Persistent, route-independent, non-modal incoming invitation.
       The rest of the website remains clickable until the user answers. */
    .call-incoming-float {
      position: fixed;
      z-index: 6200;
      top: calc(76px + env(safe-area-inset-top, 0px));
      right: max(18px, env(safe-area-inset-right, 0px));
      width: min(390px, calc(100vw - 30px));
      max-height: calc(100dvh - 95px);
      pointer-events: none;
      overflow: visible;
    }
    .call-incoming-card {
      box-sizing: border-box;
      width: 100%;
      max-height: inherit;
      padding: 17px;
      overflow-y: auto;
      pointer-events: auto;
      background: linear-gradient(145deg, #103b42 0%, #0a2431 74%);
      border: 1px solid rgba(69, 228, 180, .7);
      border-radius: 19px;
      color: #ecfff9;
      box-shadow: 0 24px 65px rgba(0, 10, 20, .55), 0 0 0 4px rgba(69, 228, 180, .08);
      animation: call-incoming-enter .19s ease-out both;
    }
    .call-incoming-topline {
      display: flex;
      align-items: center;
      gap: 7px;
      color: #9fead3;
      font-size: .73rem;
      font-weight: 750;
    }
    .call-incoming-topline strong { margin-right: auto; color: #51efbc; font-size: .7rem; letter-spacing: .12em; }
    .call-incoming-pulse {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #41e4a8;
      box-shadow: 0 0 0 4px rgba(65, 228, 168, .15);
      animation: call-incoming-pulse 1.8s infinite;
    }
    .call-incoming-person { display: flex; align-items: center; gap: 12px; margin: 17px 0 20px; }
    .call-incoming-avatar {
      display: grid;
      flex: 0 0 54px;
      place-items: center;
      width: 54px;
      height: 54px;
      border: 1px solid #60c7ac;
      border-radius: 50%;
      background: #303f50;overflow:hidden;
      color: #eafff6;
      font-size: 1.3rem;
      font-weight: 850;
    }
    .call-incoming-person-copy { min-width: 0; }
    .call-incoming-person h2 { margin: 0 0 4px; font-size: 1.17rem; overflow-wrap: anywhere; }
    .call-incoming-person p { margin: 0; color: #b9d8d6; font-size: .85rem; }
    .call-incoming-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .call-incoming-actions button {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      border: 1px solid transparent;
      border-radius: 11px;
      color: #fff;
      font: inherit;
      font-size: .84rem;
      font-weight: 800;
      cursor: pointer;
    }
    .call-incoming-decline { background: #803d48; border-color: #bf6b76 !important; }
    .call-incoming-accept { background: #147d5c; border-color: #35e2aa !important; }
    .call-incoming-accept--audio { background: transparent; }
    .call-incoming-actions button:hover { filter: brightness(1.14); }
    .call-incoming-actions button:focus-visible,
    .call-incoming-audio button:focus-visible { outline: 3px solid #83ffdf; outline-offset: 3px; }
    .call-incoming-audio {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      padding: 9px 10px;
      margin: 0 0 13px;
      border: 1px solid rgba(245, 195, 118, .35);
      border-radius: 10px;
      background: rgba(93, 68, 34, .26);
    }
    .call-incoming-audio p { flex: 1; margin: 0; color: #f5deb2; font-size: .72rem; }
    .call-incoming-audio button {
      border: 1px solid #e0b971;
      border-radius: 8px;
      padding: 7px;
      background: transparent;
      color: #ffe4a9;
      cursor: pointer;
      font: inherit;
      font-size: .74rem;
    }
    @keyframes call-incoming-enter { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes call-incoming-pulse { 50% { box-shadow: 0 0 0 8px rgba(65, 228, 168, 0); } }
    @media (max-width: 600px) {
      .call-incoming-float {
        top: auto;
        left: max(12px, env(safe-area-inset-left, 0px));
        right: max(12px, env(safe-area-inset-right, 0px));
        bottom: max(14px, env(safe-area-inset-bottom, 0px));
        width: auto;
        max-height: calc(100dvh - 40px);
      }
      .call-incoming-card { padding: 15px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .call-incoming-card, .call-incoming-pulse { animation: none; }
    }
    .call-backdrop{position:fixed;inset:0;z-index:6000;display:grid;place-items:center;
      padding:clamp(8px,2vh,24px);background:rgba(0,13,23,.9);backdrop-filter:blur(8px);}

    /* Keep participant avatars/video mounted while the authenticated DM
       occupies its own Teams-like column. */
    .call-panel.call-panel--chat-open{width:min(100%,1540px);padding-right:374px;position:relative}
    .call-chat-dock{position:absolute;right:14px;top:84px;bottom:85px;width:344px;min-height:0;
      display:flex;flex-direction:column;gap:7px;z-index:6}
    .call-chat-dock app-direct-call-chat-panel{flex:1;min-height:0}
    .call-chat-full{min-height:38px;background:#174c58;color:#d6fff0;border:1px solid #59a99a;
      border-radius:10px;font:inherit;font-size:.75rem;font-weight:800;cursor:pointer}
    .call-chat-full:focus-visible{outline:3px solid #aaffdf;outline-offset:2px}
    @media(max-width:900px){
      .call-panel.call-panel--chat-open{width:min(100%,1180px);padding-right:clamp(12px,2vw,22px)}
      .call-chat-dock{top:auto;bottom:87px;right:12px;left:12px;width:auto;
        height:min(48dvh,430px);background:#08222f;border-radius:16px;
        box-shadow:0 8px 36px #000a}
    }
    @media(max-height:580px){
      .call-chat-dock{top:66px;bottom:65px;height:auto}
    }
    .call-panel{box-sizing:border-box;width:min(100%,1180px);max-height:calc(100dvh - 20px);
      display:flex;flex-direction:column;min-height:0;padding:clamp(12px,2vw,22px);
      color:#ecfcf9;background:linear-gradient(144deg,#0b2332,#133e49);
      border:1px solid rgba(104,201,198,.43);border-radius:22px;
      box-shadow:0 20px 90px rgba(0,0,0,.55);overflow:hidden;}
    .call-topline,.call-info,.call-metrics,.call-buttons,.call-settings-head{
      display:flex;align-items:center;justify-content:space-between;gap:10px}
    .call-topline{color:#8ee9d5;font-size:.78rem;font-weight:850}
    .call-brand-dot{font-size:.62rem;color:#4de3be}
    .call-kind{color:#e0eef4;font-weight:650}
    .call-info{justify-content:center;gap:12px;margin:8px 0 2px;min-height:55px}
    .call-peer-profile{display:inline-flex;align-items:center;gap:12px;min-width:0;padding:3px 6px;
      border:1px solid transparent;border-radius:12px;background:transparent;color:#ecfcf9;
      cursor:pointer;font:inherit;text-align:left}
    .call-peer-profile:hover{background:#ffffff12;border-color:#69d6c166}
    .call-peer-profile:focus-visible{outline:3px solid #83ffdf;outline-offset:2px}
    .call-peer-name{font-size:clamp(1.12rem,2.2vw,1.42rem);font-weight:750;overflow-wrap:anywhere}
    .call-avatar{display:grid;place-items:center;flex:0 0 auto;width:50px;height:50px;
      border-radius:50%;background:#303f50;color:#e0fff8;font-size:1.25rem;font-weight:850;overflow:hidden}
    .call-incoming-avatar img,.call-avatar img,.connect-wait-avatar img,.connect-contact-avatar img{
      display:block;width:100%;height:100%;object-fit:cover;border-radius:50%}
    .call-summary{min-width:0;text-align:left}
    .call-summary h2{font-size:clamp(1.12rem,2.2vw,1.42rem);margin:0 0 4px;overflow-wrap:anywhere}
    .call-phase{display:flex;gap:8px;align-items:center;margin:0;font-size:.8rem;color:#bbd5db}
    .call-status-dot{width:7px;height:7px;flex:0 0 auto;border-radius:50%;background:#f5b75d}
    .call-status-connected{background:#57edc2}
    .call-metrics{justify-content:center;gap:6px;flex-wrap:wrap;margin:9px 0 10px}
    .call-metric{display:inline-flex;gap:6px;align-items:center;padding:5px 10px;
      font-size:.77rem;border:1px solid #375b66;border-radius:99px;color:#cde8e9;
      background:rgba(5,26,38,.65);font-variant-numeric:tabular-nums;}
    .call-quality.is-poor{color:#ffd3aa;border-color:#b16b46}
    .call-videos{position:relative;flex:1 1 auto;min-height:150px;max-height:min(55dvh,480px);
      overflow:hidden;background:#081b28;border-radius:16px;margin-bottom:10px;}
    .call-videos video:first-of-type{display:block;width:100%;height:100%;min-height:150px;
      max-height:min(55dvh,480px);object-fit:cover;background:#0a1d29;}
    .call-videos video:nth-of-type(2){position:absolute;right:12px;bottom:12px;
      width:clamp(76px,18%,142px);height:clamp(90px,22%,165px);min-height:100px;
      object-fit:cover;border-radius:12px;border:1px solid #9be8d8;background:#1d4955;
      transform:scaleX(-1);z-index:2;box-shadow:0 3px 14px #07171c;}
    .call-remote-placeholder{position:absolute;inset:0;display:grid;place-content:center;
      justify-items:center;gap:8px;pointer-events:none;color:#b4d9dd;font-size:.86rem}
    .call-remote-placeholder p{margin:0}
    .call-avatar-remote{width:72px;height:72px;font-size:1.7rem}
    .call-local-off{position:absolute;right:12px;bottom:12px;width:clamp(76px,18%,142px);
      height:clamp(90px,22%,165px);min-height:100px;border-radius:12px;
      border:1px solid #6a999f;background:#163a46;z-index:2;display:grid;
      place-content:center;justify-items:center;gap:5px;color:#c4e3e9;font-size:1.2rem}
    .call-local-off small{font-size:.65rem}
    .call-voice-surface{display:grid;justify-items:center;align-content:center;gap:8px;
      min-height:160px;color:#c4d9da}
    .call-avatar-large{width:94px;height:94px;font-size:2.2rem}
    .call-voice-surface p{margin:0;font-size:.83rem}
    .call-feedback{flex:0 0 auto;display:grid;justify-items:center}
    .call-error{color:#ffc2c1;font-size:.82rem;line-height:1.35;text-align:center;margin:3px 0 6px}
    .call-retry,.call-enable-sound{border:1px solid #5ec2d1;background:#175e73;color:#e5faff;
      padding:7px 12px;border-radius:9px;font:inherit;font-size:.78rem;cursor:pointer}
    .call-audio-help{color:#f2dfb4;font-size:.77rem;text-align:center;margin:3px 0 8px}
    .call-footer{flex:0 0 auto;min-height:0}
    .call-buttons{justify-content:center;flex-wrap:wrap;gap:7px;padding:8px 0 0}
    .call-buttons button{display:inline-flex;align-items:center;justify-content:center;gap:7px;
      padding:10px 13px;min-height:43px;border-radius:11px;
      border:1px solid #427871;background:#1c5654;color:#ecfff8;
      cursor:pointer;font:inherit;font-size:.83rem;font-weight:650}
    /* Stable, centered icons across platforms instead of font/emoji baselines. */
    .call-buttons .call-action-icon{box-sizing:border-box;display:block;width:18px;height:18px;
      min-width:18px;flex:0 0 18px;align-self:center;vertical-align:middle;pointer-events:none}
    .call-buttons button{line-height:1.25;text-align:center}
    .call-buttons button:hover,.call-retry:hover{filter:brightness(1.16)}
    .call-buttons button:disabled,.call-retry:disabled{opacity:.5;cursor:wait}
    .call-buttons button:focus-visible,.call-device-panel :is(button,select):focus-visible{
      outline:2px solid #83ffdf;outline-offset:3px}
    .call-buttons .call-off{background:#284b59;border-color:#4e8192}
    .call-buttons .call-decline{background:#923d49;border-color:#d57780;color:white}
    .call-buttons .call-accept{background:#127e61;border-color:#26dfad}
    .call-buttons .call-settings-button{background:#183c51;border-color:#4c8393}
    .connect-screen-share-feedback{flex-basis:100%;text-align:center;margin:2px 0;color:#ffd5bb;font-size:.76rem}
    .connect-screen-share-tip{flex-basis:100%;text-align:center;font-size:.72rem;line-height:1.4;color:#b9dedb;margin:2px 0 0}
    .call-buttons .connect-chat-button{background:#174c58;border-color:#59a99a}
    .call-device-panel{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));
      gap:8px 14px;margin-top:10px;padding:16px;max-height:min(62dvh,560px);overflow-y:auto;
      background:linear-gradient(160deg,#0b2c3b,#08202c);border:1px solid #2f5d68;border-radius:16px;
      box-shadow:0 18px 40px #00000059}
    .call-settings-head{grid-column:1/-1;display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;
      padding-bottom:8px;margin-bottom:2px;border-bottom:1px solid #ffffff14}
    .call-settings-head strong{font-size:.95rem;letter-spacing:.01em}
    .call-device-auto-refresh{font-size:.7rem;color:#8fd8c8;display:inline-flex;align-items:center;gap:6px}
    .call-device-auto-refresh::before{content:'';width:7px;height:7px;border-radius:50%;background:#57edc2}
    .call-device-panel label{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#8fb9c1;align-self:end}
    .call-device-panel select{grid-row:3;min-width:0;width:100%;font:inherit;font-size:.82rem;appearance:none;cursor:pointer;
      background:#11303f url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%2357f2c0' stroke-width='2'/%3E%3C/svg%3E") no-repeat right 12px center;
      color:#f4fffe;border:1px solid #3c6874;border-radius:10px;padding:10px 34px 10px 12px}
    .call-device-panel select:hover{border-color:#57f2c0}
    .call-device-panel p{grid-column:1/-1;color:#8fb2ba;font-size:.7rem;margin:4px 0 0}
    .call-device-panel .call-bg{grid-column:1/-1}
    .call-bg{display:grid;gap:9px;margin-top:8px}
    .call-bg-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .call-bg-head strong{font-size:.86rem}
    .call-bg-head small{color:#9fe8d6;font-size:.72rem}
    .call-bg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px}
    .call-bg-tile{position:relative;aspect-ratio:16/10;padding:0;overflow:hidden;cursor:pointer;
      border:2px solid #2c5560;border-radius:11px;background:#123746;color:#eafffa;font:inherit;transition:transform .12s,border-color .12s}
    .call-bg-tile:hover:not(:disabled){transform:translateY(-1px);border-color:#6fd9c2}
    .call-bg-tile.is-active{border-color:#57f2c0;box-shadow:0 0 0 2px #57f2c055}
    .call-bg-tile:disabled{opacity:.45;cursor:not-allowed}
    .call-bg-tile img{width:100%;height:100%;object-fit:cover;display:block}
    .call-bg-label{position:absolute;left:0;right:0;bottom:0;padding:14px 6px 5px;font-size:.68rem;font-weight:700;
      text-align:left;background:linear-gradient(transparent,#000000b3)}
    .call-bg-none,.call-bg-blur{display:grid;place-items:center}
    .call-bg-blur{background:radial-gradient(circle at 40% 40%,#5ea7b7,#1d4b59 70%)}
    .call-bg-icon{font-size:1.4rem;color:#bff7e9;margin-top:-10px}
    .call-background-error{color:#ffb8be;font-size:.77rem}
    .call-bg-tray{margin:8px auto 4px;max-width:760px;padding:12px 14px;border-radius:16px;
      background:#0a2836f2;border:1px solid #3d7a80;box-shadow:0 14px 34px #0000006b;animation:call-bg-in .2s ease-out}
    .call-bg-tray-head{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:.82rem;font-weight:700;color:#e6fff8}
    .call-bg-tray .call-bg{margin-top:6px}
    .call-bg-tray .call-bg-head{display:none}
    .call-bg-tray .call-bg-grid{display:flex;overflow-x:auto;gap:8px;padding-bottom:4px;scroll-snap-type:x mandatory}
    .call-bg-tray .call-bg-tile{flex:0 0 112px;scroll-snap-align:start}
    .call-bg-tray-close{border:0;background:#ffffff14;color:#e6fff8;width:28px;height:28px;border-radius:50%;cursor:pointer}
    @keyframes call-bg-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
    @media (max-width:640px){.call-device-panel{grid-template-columns:1fr}.call-device-panel select{grid-row:auto}}
    .call-swap{position:absolute;top:10px;right:10px;z-index:5;background:#092b38de;
      border:1px solid #66a9a0;color:#e1fffa;border-radius:10px;padding:7px 11px;cursor:pointer;font-size:.78rem}
    .call-swap:disabled{opacity:.4;cursor:default}
    .call-videos--swapped video:first-of-type{position:absolute;right:12px;bottom:12px;
      width:clamp(76px,18%,142px);height:clamp(90px,22%,165px);min-height:100px;
      border-radius:12px;z-index:3;border:1px solid #9be8d8}
    .call-videos--swapped video:nth-of-type(2){position:relative;inset:auto;display:block;
      width:100%;height:100%;min-height:0;max-height:none;border:0;border-radius:0;box-shadow:none;z-index:1}
    .call-recovery-actions{display:flex;justify-content:center;flex-wrap:wrap;gap:8px;margin:5px 0}
    .call-voice-surface.is-active .call-avatar-large{box-shadow:0 0 0 10px #40dfbd22}
    .call-panel{width:min(100%,1020px);height:min(710px,calc(100dvh - 20px))}
    .call-videos{flex:1 1 0;min-height:0;max-height:none}
    .call-videos video:first-of-type{min-height:0;max-height:none}
    .call-voice-surface{flex:1 1 0;min-height:75px}
    .call-footer{position:relative}
    .call-device-panel{position:absolute;right:0;bottom:calc(100% + 6px);
      width:min(100%,650px);box-sizing:border-box;z-index:10;max-height:48dvh;
      overflow-y:auto;box-shadow:0 16px 45px #0008}
    .call-buttons button{min-width:76px}
.call-refresh{display:none}
    .connect-brand-label{color:#b3dcd7;font-weight:500;margin-left:7px}
    .connect-head-actions{display:flex;align-items:center;gap:12px}
    .connect-minimize{display:grid;place-items:center;width:34px;height:30px;border:1px solid #568d91;
      background:#173a48;border-radius:9px;color:#dbfff4;font:inherit;font-size:1.2rem;cursor:pointer}
    .connect-waiting{flex:1;min-height:145px;display:flex;flex-direction:column;align-items:center;
      justify-content:center;gap:13px;padding:20px;background:radial-gradient(circle at 50% 50%,#194950,#0c2634 70%);border-radius:17px}
    .connect-wait-avatar{width:108px;height:108px;display:grid;place-items:center;border-radius:50%;background:#286d69;
      border:3px solid #8b9cab;box-shadow:0 0 0 13px #8299af18;font-size:2.8rem;font-weight:850;overflow:hidden}
    .connect-waiting h3,.connect-waiting p{margin:0}.connect-waiting p{color:#a6d2d5;font-size:.82rem}
    .connect-wait-bars{display:flex;align-items:center;gap:5px;height:25px}
    .connect-wait-bars i{width:4px;height:9px;border-radius:9px;background:#56f2c5;animation:connect-wave 1s ease-in-out infinite alternate}
    .connect-wait-bars i:nth-child(2),.connect-wait-bars i:nth-child(4){animation-delay:.22s}.connect-wait-bars i:nth-child(3){animation-delay:.44s}
    @keyframes connect-wave{to{height:24px}}
    .connect-camera-health{display:flex;align-items:center;justify-content:center;
      flex-wrap:wrap;gap:12px;margin:2px 4px 8px;padding:9px 12px;
      border:1px solid #b38c50;border-radius:10px;background:#30291e;color:#ffe4b9;
      font-size:.8rem}
    .connect-camera-health button{border:1px solid #d3ae70;border-radius:8px;
      background:#5b4223;color:#fff4db;padding:6px 11px;cursor:pointer;font:inherit}
    .connect-camera-health button:focus-visible{outline:2px solid #fff4db;outline-offset:2px}
    .connect-participants{flex:1;min-height:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));
      grid-auto-rows:minmax(150px,1fr);gap:12px;overflow:auto;padding:4px}
    .connect-participants:has(app-call-participant-tile:only-child){grid-template-columns:1fr}
    /* A focused camera reflows the existing LiveKit tile rather than
       mounting a second video/audio element. This prevents double audio and
       unnecessary detach/attach cycles during participant changes. */
    .call-bg-image ::ng-deep .connect-tile.local-camera video{transform:none}
    .connect-camera-slot{position:relative;min-width:0;min-height:150px;height:100%}
    .connect-camera-slot app-call-participant-tile{display:block;width:100%;height:100%}
    .connect-camera-focus-hit{position:absolute;z-index:3;inset:0;
      width:100%;height:100%;border:0;border-radius:14px;background:transparent;
      color:#f3fffa;cursor:zoom-in;text-align:right}
    .connect-camera-focus-hit span{position:absolute;top:11px;right:11px;
      display:grid;place-items:center;width:36px;height:36px;border-radius:10px;
      border:1px solid #83b6b1;background:#0b2839d9;font-size:1.15rem}
    .connect-camera-slot.is-focused .connect-camera-focus-hit{cursor:zoom-out}
    .connect-camera-maximize{position:absolute;z-index:5;top:11px;right:55px;
      display:grid;place-items:center;width:36px;height:36px;border-radius:10px;
      border:1px solid #83b6b1;background:#0b2839e8;color:#f3fffa;
      cursor:pointer;font-size:1.2rem}
    .connect-camera-focus-hit:hover span,.connect-camera-focus-hit:focus-visible span,
    .connect-camera-maximize:hover,.connect-camera-maximize:focus-visible{
      outline:2px solid #70ecd3;outline-offset:2px;background:#205a63}
    /* The enlarged video consumes the remaining call viewport; thumbnails
       occupy a fixed bottom rail instead of creating nested vertical scroll. */
    .call-panel:has(.connect-participants--camera-focus){
      height:calc(100dvh - 20px);max-height:calc(100dvh - 20px)}
    .connect-participants--camera-focus{
      display:grid;grid-template-columns:repeat(auto-fit,minmax(min(130px,100%),1fr));
      grid-template-rows:minmax(0,1fr) minmax(90px,115px);
      grid-auto-rows:0;align-content:stretch;gap:10px;overflow:hidden}
    .connect-participants--camera-focus .connect-camera-slot{
      height:100%;min-height:0;min-width:0;grid-row:2}
    .connect-participants--camera-focus .connect-camera-slot.is-focused{
      grid-column:1/-1;grid-row:1;height:100%;min-height:0}
    .connect-participants--camera-zoom .connect-camera-slot.is-focused{
      position:fixed;inset:10px;z-index:9000;height:auto!important;
      width:auto;max-width:none;min-height:0;border-radius:17px;background:#091f2c;
      box-shadow:0 0 0 100vmax #000c;overflow:hidden}
    .connect-participants--camera-zoom .connect-camera-slot.is-focused
      .connect-camera-focus-hit span{top:15px;right:15px}
    .connect-participants--camera-zoom .connect-camera-slot.is-focused
      .connect-camera-maximize{top:15px;right:59px}
    @media(max-width:600px){
      .connect-participants--camera-focus{
        grid-template-rows:minmax(0,1fr) minmax(72px,95px)}
      .connect-participants--camera-focus .connect-camera-slot.is-focused{
        height:100%;min-height:0}
      .connect-participants--camera-focus .connect-camera-slot{
        height:100%;min-height:0}
    }

    /* Presentations use a dedicated stage and a compact camera filmstrip.
       The complete shared desktop remains visible while both cameras stay accessible. */
    .call-panel:has(.connect-participants--presenting){width:min(100%,1600px);height:calc(100dvh - 20px)}
    .connect-participants--presenting{display:flex;flex-direction:column;overflow:hidden;gap:10px}
    .connect-share-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;min-height:32px}
    .connect-share-live{display:inline-flex;align-items:center;gap:8px;padding:5px 10px;border:1px solid #3e8276;border-radius:99px;background:#0a353d;color:#a3f5df;font-size:.74rem;font-weight:750}
    .connect-share-live span{color:#54ebaf;font-size:.6rem}
    .connect-share-switcher{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .connect-share-switcher button{font:inherit;font-size:.75rem;border:1px solid #42736c;border-radius:9px;background:#153b47;color:#defff2;padding:5px 10px;cursor:pointer}
    .connect-share-switcher button.is-selected{border-color:#54e5bf;background:#20665d}
    .connect-focus-toggle{margin-left:auto;border:1px solid #41766f;border-radius:9px;
      padding:7px 11px;background:#143c48;color:#e5fff5;cursor:pointer;font:inherit;font-size:.76rem}
    .connect-focus-toggle:hover{background:#205b62}
    .connect-focus-toggle:focus-visible{outline:2px solid #9bffe1;outline-offset:2px}
    /* Keep participant tiles mounted for remote audio while hiding the video filmstrip. */
    .connect-camera-strip.is-focus-hidden{position:absolute!important;width:1px!important;height:1px!important;
      min-height:0!important;padding:0!important;border:0!important;overflow:hidden!important;
      clip-path:inset(50%);pointer-events:none}

    .connect-share-switcher button:focus-visible,.connect-self-share-heading button:focus-visible{outline:2px solid #9bffe1;outline-offset:2px}
    .connect-self-share-preview{flex:0 0 auto;display:flex;flex-direction:column;gap:7px;padding:8px 11px;border:1px solid #356961;border-radius:13px;background:#0a2531}
    .connect-self-share-heading{display:flex;align-items:center;flex-wrap:wrap;gap:10px}
    .connect-self-share-heading strong{color:#a8ffe2;font-size:.8rem}
    .connect-self-share-heading span{font-size:.72rem;color:#b6d0d0;margin-right:auto}
    .connect-self-share-heading button{font:inherit;font-size:.72rem;cursor:pointer;padding:5px 9px;border-radius:8px;border:1px solid #478879;background:#123c44;color:#e4fff8}
    .connect-self-share-heading .connect-self-stop{border-color:#a96d72;color:#ffe0e1;background:#512e38}
    .connect-self-share-tile{display:block;height:clamp(95px,12vh,165px);width:min(320px,100%);align-self:flex-start}
    .connect-self-share-tile::ng-deep .connect-tile{min-height:0}
    @media(max-width:600px){.connect-self-share-heading span{display:none}.connect-self-share-tile{height:105px}}
    .connect-presentation-stage{position:relative}
    .connect-presentation-zoom-hit{position:absolute;inset:0;display:flex;justify-content:flex-end;align-items:flex-start;
      color:#eafff6;background:transparent;border:0;border-radius:11px;padding:12px;
      font:inherit;font-size:.77rem;cursor:zoom-in;z-index:2;text-align:right}
    .connect-presentation-zoom-chip{display:inline-flex;align-items:center;gap:7px;
      border:1px solid #51998b;border-radius:11px;padding:9px 12px;background:#0b2737e8;
      box-shadow:0 4px 16px #001a21a8}
    .connect-presentation-zoom-hit:hover .connect-presentation-zoom-chip{background:#1d5b5e}
    .connect-presentation-zoom-hit:focus-visible{outline:3px solid #a0ffe6;outline-offset:2px}
    .connect-presentation-stage.is-zoomed{position:fixed;inset:max(10px,env(safe-area-inset-top,0px)) max(10px,env(safe-area-inset-right,0px));
      z-index:9000;border:1px solid #56a69a;border-radius:17px;background:#081a23;box-shadow:0 0 0 100vmax #000c}
    .connect-presentation-stage.is-zoomed .connect-presentation-zoom-hit{cursor:zoom-out}
    .connect-presentation-tile{min-height:0}
    .connect-share-audio{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:7px 0}
    .connect-share-audio label{display:flex;gap:8px;align-items:center;flex-wrap:wrap;
      font-size:.76rem;color:#d9f8f0}
    .connect-share-audio input{accent-color:#56e8c0;width:clamp(80px,10vw,145px)}
    .connect-share-audio strong{color:#b9e9dc;font-variant-numeric:tabular-nums;font-weight:650}
    .connect-presentation-stage{flex:1;min-height:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr));gap:10px;overflow:auto}
    .connect-presentation-tile{min-height:0;min-width:0;height:100%;width:100%}
    .connect-camera-strip{flex:0 0 auto;display:flex;gap:10px;overflow-x:auto;overflow-y:hidden;min-height:130px;padding:2px}
    .connect-camera-strip app-call-participant-tile{flex:0 0 clamp(140px,18vw,220px);height:130px;min-height:130px}
    .connect-camera-strip .connect-camera-slot{flex:0 0 clamp(140px,18vw,220px);height:130px;min-height:130px}
    .connect-camera-strip .connect-camera-slot app-call-participant-tile{flex:none;width:100%;height:100%}
    .connect-camera-strip .connect-camera-maximize{top:6px;right:6px;width:30px;height:30px;font-size:1rem}
    .connect-camera-strip app-call-participant-tile::ng-deep .connect-tile{min-height:0}
    .connect-camera-strip app-call-participant-tile::ng-deep .connect-avatar{width:54px;font-size:1.4rem}
    .connect-camera-strip app-call-participant-tile::ng-deep .connect-person{bottom:5px;left:5px;padding:4px 7px;font-size:.7rem}
    @media(max-width:600px){
      .connect-camera-strip{min-height:100px}
      .connect-camera-strip app-call-participant-tile{flex-basis:120px;height:100px;min-height:100px}
      .connect-camera-strip .connect-camera-slot{flex-basis:120px;height:100px;min-height:100px}
    }
    /* Self-contained people drawer: never overflow outside the call or cover
       the page unpredictably when chat or screen sharing is active. */
    .call-panel{position:relative}
    .connect-invite-panel{position:absolute;z-index:20;right:14px;top:70px;bottom:75px;
      width:min(430px,calc(100% - 28px));box-sizing:border-box;display:flex;flex-direction:column;
      gap:12px;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:18px;
      background:linear-gradient(155deg,#0d3440,#082430);border:1px solid #4b9990;
      border-radius:17px;box-shadow:0 20px 55px #000b;scrollbar-width:thin}
    .connect-invite-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
    .connect-invite-eyebrow{display:block;color:#5be8c0;font-size:.67rem;font-weight:850;letter-spacing:.1em;text-transform:uppercase}
    .connect-invite-heading h3{margin:3px 0 6px;font-size:1.18rem}
    .connect-invite-heading p{margin:0;color:#b7d6d5;font-size:.78rem;line-height:1.5}
    .connect-invite-close{display:grid;place-items:center;flex:0 0 36px;height:36px;
      border:1px solid #426f76;border-radius:10px;background:#163f4b;color:#d8fff3;cursor:pointer}
    .connect-invite-close:hover{background:#235765}
    .connect-invite-form{display:grid;gap:8px}
    .connect-invite-form label{font-size:.76rem;font-weight:750;color:#d9f9ee}
    .connect-invite-search{display:flex;gap:7px;min-width:0}
    .connect-invite-search input{min-width:0;flex:1;box-sizing:border-box;width:100%;
      border:1px solid #528f89;background:#081f2c;color:#effffb;border-radius:10px;padding:11px;font:inherit;font-size:.78rem}
    .connect-invite-search button{padding:10px 13px;border-radius:10px;background:#43e6bd;
      color:#062f36;border:0;font:inherit;font-size:.75rem;font-weight:850;cursor:pointer}
    .connect-invite-search button:disabled{opacity:.45;cursor:not-allowed}
    .connect-invite-error{color:#ffd0cd!important;font-size:.78rem}
    .connect-invite-list-heading,.connect-member-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .connect-invite-list-heading strong,.connect-member-heading strong{font-size:.82rem}
    .connect-invite-list-heading span,.connect-member-heading span{font-size:.72rem;color:#a6c9cb}
    .connect-invite-empty{margin:0;padding:12px;background:#123947;border-radius:10px;color:#bbd8d6;font-size:.76rem}
    .connect-contact-results{display:grid;gap:7px;overflow-y:auto;min-height:0;max-height:min(32dvh,265px);scrollbar-width:thin}
    .connect-contact-option{display:flex;align-items:center;gap:10px;width:100%;min-width:0;
      padding:10px;border-radius:12px;background:#123b46;border:1px solid #36796f;color:#e6fff8;text-align:left;cursor:pointer}
    .connect-contact-option:hover{background:#1b5656;border-color:#54daba}
    .connect-contact-option:focus-visible,.connect-invite-panel button:focus-visible,
    .connect-invite-panel input:focus-visible{outline:2px solid #a4ffe1;outline-offset:2px}
    .connect-contact-option:disabled{opacity:.5;cursor:wait}
    .connect-contact-avatar,.connect-member-avatar{display:grid;place-items:center;flex:0 0 42px;
      width:42px;height:42px;border-radius:50%;background:#286b68;color:#eafff9;font-weight:800;overflow:hidden}
    .connect-contact-avatar img,.connect-member-avatar img{display:block;width:100%;height:100%;object-fit:cover}
    .connect-contact-names{display:grid;gap:3px;min-width:0;flex:1}
    .connect-contact-names strong,.connect-contact-names small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .connect-contact-names strong{font-size:.82rem}.connect-contact-names small{color:#a5d7cf;font-size:.72rem}
    .connect-contact-action{display:inline-flex;align-items:center;gap:4px;color:#76efd0;font-size:.72rem;font-weight:800}
    .connect-member-list{display:grid;gap:9px;border-top:1px solid #416a70;padding-top:13px}
    .connect-member-item{display:flex;align-items:center;gap:10px;padding:8px;
      border:1px solid #2e6268;border-radius:11px;background:#102f3d;min-width:0}
    .connect-member-avatar{flex-basis:35px;width:35px;height:35px;font-size:.84rem}
    .connect-member-details{display:grid;gap:4px;flex:1;min-width:0}
    .connect-member-details strong{font-size:.79rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .connect-member-details small{display:inline-flex;align-items:center;gap:5px;color:#add3ce;font-size:.68rem}
    .connect-presence-dot{width:6px;height:6px;border-radius:50%;background:#4de3ad}
    .connect-member-volume{display:grid;justify-items:end;gap:4px;max-width:105px}
    .connect-member-volume input{width:98px;max-width:100%;accent-color:#45dfb9}
    .connect-volume-label,.connect-member-you{font-size:.66rem;color:#9de4d3}
    .connect-member-pending{display:flex;align-items:center;gap:6px;flex-wrap:wrap;
      padding:9px 11px;border:1px solid #786a43;border-radius:10px;background:#322e26;
      color:#f5ddb0;font-size:.76rem}
    .connect-member-pending small{margin-left:auto;color:#decba8}
    .connect-pending-heading{margin-top:5px}
    @media(max-width:650px){.connect-invite-panel{top:52px;bottom:60px;right:6px;
      width:calc(100% - 12px);padding:14px}.connect-contact-results{max-height:25dvh}}
    @media(max-height:560px){.connect-invite-panel{top:42px;bottom:48px;gap:8px;padding:12px}
      .connect-contact-results{max-height:22dvh}}
    /* Keep the persistent call away from the message composer and Send button.
       Only the small floating surface receives pointer events. */
    .connect-mini{position:fixed;top:max(76px,env(safe-area-inset-top));right:20px;bottom:auto;
      z-index:6000;display:flex;align-items:center;gap:10px;padding:10px;
      max-width:min(460px,calc(100vw - 20px));box-sizing:border-box;
      border:1px solid #48bfa8;border-radius:16px;
      background:#0b303e;color:#ebfff8;box-shadow:0 12px 48px #0008}
    .connect-mini-name{display:grid;grid-template-columns:8px 1fr;column-gap:10px;font-size:.78rem}
    .connect-mini-name strong,.connect-mini-name small{grid-column:2}.connect-mini-name span{grid-row:1/3;align-self:center}
    .connect-mini-name small{color:#a9d1d5}.connect-mini button{padding:9px;border-radius:9px;border:1px solid #468e89;
      color:white;background:#155551;cursor:pointer;font:inherit;font-size:.76rem}
    .connect-mini .connect-mini-chat{background:#174c58;border-color:#59a99a}
    .connect-mini .connect-mini-hangup{background:#903e50;border-color:#b85d6a}
    .connect-mini button:focus-visible{outline:2px solid #a7fce2;outline-offset:2px}
    .connect-mini-name{min-width:0}
    .connect-mini-name strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    @media(max-width:650px){
      .connect-mini{top:max(66px,env(safe-area-inset-top));left:10px;right:10px;gap:6px;
        padding:8px;max-width:none;flex-wrap:wrap;justify-content:flex-end}
      .connect-mini-name{margin-right:auto;min-width:90px}
      .connect-mini button{padding:8px 7px;font-size:.72rem}
    }
    .connect-mini-audio{position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none}
    @media(max-width:600px){
      .call-backdrop{padding:6px}
      .call-panel{max-height:calc(100dvh - 12px);padding:12px;border-radius:15px}
      .call-videos{min-height:0;max-height:none}
      .call-videos video:first-of-type{max-height:none}
      .call-info{margin:5px 0 0}
      .call-metrics{margin:6px 0}
      .call-device-panel{grid-template-columns:1fr;max-height:34dvh}
      .call-settings-head,.call-device-panel p{grid-column:1}
      .call-device-panel select{grid-row:auto}
      .call-buttons button{padding:8px 10px;font-size:.75rem;min-height:40px}
    }
    @media(max-height:620px){
      .call-videos{max-height:none;min-height:0}
      .call-videos video:first-of-type{max-height:none;min-height:0}
      .call-avatar{width:38px;height:38px}
      .call-voice-surface{min-height:75px}
    }
  `]
})
export class DirectCallOverlayComponent implements OnDestroy {
  @ViewChildren(CallParticipantTileComponent) private callTiles?: QueryList<CallParticipantTileComponent>;

  /** Playback must start in the same user gesture, before the first await. */
  allowCallAudio(): void {
    this.callTiles?.forEach(tile => tile.resumeAudioFromGesture());
    void this.calls.allowAudio();
  }

  private readonly mediaSubscription: Subscription;
  private readonly memberPhotoSubscription: Subscription;
  private readonly cameraLifecycleSubscription: Subscription;
  private readonly photos = new Map<string, string | null>();
  private readonly photoRequests = new Set<string>();
  private readonly photoFailures = new Set<string>();

  profilePhoto(username: string | null): string | null {
    if (!username) return null;
    const key = username.toLowerCase();
    return this.photoFailures.has(key) ? null : (this.photos.get(key) ?? null);
  }
  hideBrokenPhoto(username: string): void {
    this.photoFailures.add(username.toLowerCase());
  }
  participantUsername(person: LocalParticipant | RemoteParticipant): string | null {
    const known = this.calls.members$.value.participants
      .find(member => member.identity === person.identity)?.username;
    // A remaining sole remote might be a group guest after the original
    // peer disconnects. Identity is authoritative; guessing would expose the
    // wrong person's photo and name.
    return known ?? null;
  }
  private requestPhoto(username: string | null | undefined): void {
    const name = username?.trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (this.photoRequests.has(key)) return;
    this.photoRequests.add(key);
    this.community.publicProfile(name).pipe(timeout(10000)).subscribe({
      next: profile => { this.photos.set(key, profile.profilePicUrl || null); },
      error: () => { this.photos.set(key, null); }
    });
  }
  settingsOpen = false;
  /** Background suggestions shown right after the camera turns on (Teams style). */
  backgroundTray = false;
  readonly backgroundImages = CALL_BACKGROUND_IMAGES;
  inviteOpen = false;
  inviteUsername = '';
  contacts: FriendSummary[] = [];
  contactsLoading = false;
  contactsError = false;
  private contactsRequested = false;
  minimized = false;
  focusedPresentationIdentity: string | null = null;
  showOwnSharePreview = true;
  presentationZoomed = false;
  focusOnly = false;
  focusedCameraIdentity: string | null = null;
  cameraZoomed = false;
  get focusedCamera(): LocalParticipant | RemoteParticipant | null {
    return this.participants.find(person => person.identity === this.focusedCameraIdentity) ?? null;
  }
  toggleCameraFocus(identity: string): void {
    if (this.focusedCameraIdentity === identity) {
      this.clearCameraFocus();
    } else {
      this.focusedCameraIdentity = identity;
      this.cameraZoomed = false;
    }
  }
  isImageBackground(mode: string | null): boolean { return !!mode && mode !== 'none' && mode !== 'blur'; }
  /** A maximized camera temporarily takes the place of the shared screen. */
  get showPresentation(): boolean { return this.hasPresentation && !this.cameraZoomed; }
  zoomCamera(identity: string): void {
    if (this.focusedCameraIdentity === identity && this.cameraZoomed) {
      this.cameraZoomed = false;
    } else {
      this.focusedCameraIdentity = identity;
      this.cameraZoomed = true;
    }
  }
  clearCameraFocus(): void {
    this.focusedCameraIdentity = null;
    this.cameraZoomed = false;
  }

  // Escape restores the normal camera layout even when the tile's control
  // lost focus (e.g. after clicking elsewhere). Do not intercept chat input.
  @HostListener('document:keydown.escape')
  onEscapeCameraFocus(): void {
    if (this.cameraZoomed || this.focusedCameraIdentity !== null) this.clearCameraFocus();
  }
  private screenVolumes: Record<string, number> = {};
  screenVolumeFor(identity: string): number { return this.screenVolumes[identity] ?? 1; }
  setScreenVolume(identity: string, percent: number | string): void {
    const value = Number(percent);
    if (Number.isFinite(value)) this.screenVolumes[identity] = Math.max(0, Math.min(1, value / 100));
  }
  togglePresentationZoom(): void { this.presentationZoomed = !this.presentationZoomed; }

  appTranslateLabel(key: string): string { return appTranslate(key); }
  get presentingParticipants(): (LocalParticipant | RemoteParticipant)[] {
    return this.participants.filter(person => this.personHasScreenShare(person));
  }
  get focusedPresentation(): LocalParticipant | RemoteParticipant | null {
    const people = this.presentingParticipants;
    return people.find(person => person.identity === this.focusedPresentationIdentity)
      ?? people.find(person => person !== this.calls.room?.localParticipant)
      ?? people[0] ?? null;
  }
  get localHasScreenShare(): boolean {
    const local = this.calls.room?.localParticipant;
    return !!local && this.personHasScreenShare(local);
  }
  focusPresentation(identity: string): void {
    this.focusedPresentationIdentity = identity;
  }

  private volumes: Record<string,number> = {};

  volumeFor(identity: string): number { return this.volumes[identity] ?? 1; }
  setVolume(identity: string, percent: number | string): void {
    const value=Number(percent);
    if (Number.isFinite(value)) this.volumes[identity]=Math.max(0,Math.min(1,value/100));
  }

  get participants(): (LocalParticipant | RemoteParticipant)[] {
    const room = this.calls.room;
    return room ? [room.localParticipant, ...room.remoteParticipants.values()] : [];
  }

  get ownCameraPublished(): boolean {
    const local = this.calls.room?.localParticipant;
    if (!local?.videoTrackPublications) return false;
    return [...local.videoTrackPublications.values()].some(pub =>
      pub.source===Track.Source.Camera && !!pub.track && !pub.isMuted
      && pub.track.mediaStreamTrack?.readyState !== 'ended');
  }

  get videoActive(): boolean {
    // Screen sharing is tracked separately. A live screen track does not
    // mean a webcam is working (particularly on mobile and reconnect).
    return this.participants.some(p=>[...p.videoTrackPublications.values()]
      .some(pub=>pub.source===Track.Source.Camera && !!pub.track && !pub.isMuted));
  }
  personHasScreenShare(person: LocalParticipant | RemoteParticipant): boolean {
    return [...person.videoTrackPublications.values()].some(
      pub => pub.source===Track.Source.ScreenShare && !!pub.track && !pub.isMuted);
  }
  get hasPresentation(): boolean {
    return this.participants.some(person => this.personHasScreenShare(person));
  }
  participantLabel(person: LocalParticipant | RemoteParticipant): string {
    if (person===this.calls.room?.localParticipant) return appTranslate('calls.you');
    const found=this.calls.members$.value.participants
      .find(member=>member.identity===person.identity);
    return found?.username || 'Participante';
  }

  minimize(): void {
    if (this.calls.state$.value?.phase !== 'error') {
      this.minimized=true;
      this.settingsOpen=false;
      this.inviteOpen=false;
    }
  }

  get matchingContacts(): FriendSummary[] {
    if (!this.inviteOpen) return [];
    const query = this.inviteUsername.trim().replace(/^@/, '').toLowerCase();
    const membership = this.calls.members$.value;
    const excluded = new Set([...membership.participants.map(p => p.username),
      ...membership.pending, this.calls.state$.value?.peer || ''].map(p => p.toLowerCase()));
    return this.contacts.filter(c => !c.chatBlocked && !excluded.has(c.username.toLowerCase())
      && (!query || [c.username, c.nickname || '', c.fullName || '']
        .some(name => name.toLowerCase().includes(query)))).slice(0,8);
  }

  toggleInvites(): void {
    this.inviteOpen = !this.inviteOpen;
    this.settingsOpen = false;
    if (!this.inviteOpen || this.contactsRequested) return;
    this.contactsRequested = true;
    this.contactsLoading = true;
    this.contactsError = false;
    this.community.friends().pipe(timeout(10000)).subscribe({
      next: contacts => {
        this.contacts = Array.isArray(contacts) ? contacts : [];
        this.contactsLoading = false;
      },
      error: () => {
        this.contactsLoading = false;
        this.contactsError = true;
        this.contactsRequested = false;
      }
    });
  }

  async inviteContact(username: string): Promise<void> {
    this.inviteUsername = username;
    await this.inviteMember();
  }

  async inviteMember(): Promise<void> {
    const target=this.inviteUsername.trim().replace(/^@/, '');
    if (await this.calls.inviteMember(target)) this.inviteUsername='';
  }
  get speakerSelectionSupported(): boolean {
    return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  }

  readonly elapsed$: Observable<string>;

  get participantCount(): number {
    return (this.calls.room?.remoteParticipants.size || 0)+1;
  }

  get remoteHasVideo(): boolean {
    const room=this.calls.room;
    return !!room && [...room.remoteParticipants.values()].some(p=>
      [...p.videoTrackPublications.values()].some(pub=>!!pub.track && !pub.isMuted));
  }

  qualityKey(quality: string | null): string {
    switch(quality){
      case 'excellent':return 'calls.qualityExcellent';
      case 'good':return 'calls.qualityGood';
      case 'poor':return 'calls.qualityPoor';
      case 'lost':return 'calls.qualityLost';
      default:return 'calls.qualityUnknown';
    }
  }

  private readonly router = inject(Router, {optional: true});

  async toggleCamera(enable: boolean): Promise<void> {
    if (!enable) this.backgroundTray = false;
    await this.calls.setCamera(enable);
    if (enable && this.calls.state$.value?.cameraEnabled && this.calls.backgroundSupported) this.backgroundTray = true;
  }

  chooseBackground(mode: string): void {
    void this.calls.setBackground(mode);
  }

  constructor(public readonly calls: DirectCallClientService, private readonly community: CommunityService) {
    this.elapsed$ = combineLatest([this.calls.state$,timer(0,1000)]).pipe(map(([call]) => {
    if (!call?.startedAt) return '00:00';
    const seconds=Math.max(0,Math.floor((Date.now()-call.startedAt)/1000));
    const hours=Math.floor(seconds/3600);
    return hours ? [hours,Math.floor(seconds/60)%60,seconds%60].map(x=>String(x).padStart(2,'0')).join(':')
      : [Math.floor(seconds/60),seconds%60].map(x=>String(x).padStart(2,'0')).join(':');
  }));

    this.cameraLifecycleSubscription = calls.mediaChanged$.subscribe(() => {
      // The focused remote participant can leave while the browser is zoomed.
      // Never leave a full-screen backdrop covering an empty call.
      if (this.focusedCameraIdentity && !this.focusedCamera) this.clearCameraFocus();
    });
    this.memberPhotoSubscription = calls.members$.subscribe(members => {
      if (calls.state$.value) members.participants.forEach(member => this.requestPhoto(member.username));
    });
    this.mediaSubscription = calls.state$.subscribe(call=>{
      if (call) {
        this.requestPhoto(call.peer);
        calls.members$.value.participants.forEach(member => this.requestPhoto(member.username));
      }
      if (!call) {
        // Profile images may change between calls. Clear both successful and
        // failed lookups so a subsequent call fetches the current avatar.
        this.photos.clear();
        this.photoRequests.clear();
        this.photoFailures.clear();
        this.settingsOpen=false;
        this.inviteOpen=false;
        this.minimized=false;
        this.showCallChat=false;
        this.inviteUsername='';
        this.contacts=[];
        this.contactsRequested=false;
        this.volumes={};
        this.screenVolumes={};
        this.focusedPresentationIdentity=null;
        this.showOwnSharePreview=true;
        this.presentationZoomed=false;
        this.focusOnly=false;
        this.clearCameraFocus();
      }
    });
  }

  showCallChat=false;

  toggleCallChat():void{
    if(!this.calls.state$.value)return;
    this.showCallChat=!this.showCallChat;
    if(this.showCallChat){this.settingsOpen=false;this.inviteOpen=false;}
  }

  /** Keep the LiveKit room connected while visiting the person's full profile. */
  openPeerProfile(peer: string): void {
    const username=peer.trim();
    if (!username || !this.calls.state$.value || !this.router) return;
    this.minimize();
    void this.router.navigate(['/menu/profiles',username]);
  }

  openChat(peer: string): void {
    // A floating active call is global: navigating never tears down LiveKit.
    if (!peer.trim() || !this.calls.state$.value) return;
    this.minimize();
    void this.router?.navigate(['/menu/messages'], {
      queryParams: {kind: 'direct', id: peer}
    });
  }

  /** Actionable, browser-neutral guidance without automatic camera/mic prompts. */
  recoveryHintKey(error: string): string | null {
    if (error === 'calls.cameraDenied' || error === 'calls.microphoneDenied')
      return 'calls.recoveryPermissionHint';
    if (error === 'calls.cameraBusy' || error === 'calls.microphoneBusy')
      return 'calls.recoveryBusyHint';
    if (error === 'calls.cameraMissing' || error === 'calls.microphoneMissing'
        || error === 'calls.deviceMissing')
      return 'calls.recoveryMissingHint';
    return null;
  }

  toggleSettings(forceOpen=false): void {
    this.settingsOpen=forceOpen || !this.settingsOpen;
    if (this.settingsOpen) void this.calls.refreshDevices();
  }

  selectDevice(kind: MediaDeviceKind, event: Event): void {
    const target=event.target as HTMLSelectElement;
    void this.calls.selectDevice(kind,target.value);
  }

  dismiss(): void {
    const call=this.calls.state$.value;
    if (call?.phase==='incoming') this.calls.decline();
    else if (call?.phase==='error') this.calls.closeError();
    else if (call) this.calls.end();
  }

  ngOnDestroy(): void {
    this.mediaSubscription.unsubscribe();
    this.memberPhotoSubscription.unsubscribe();
    this.cameraLifecycleSubscription.unsubscribe();
  }
}
