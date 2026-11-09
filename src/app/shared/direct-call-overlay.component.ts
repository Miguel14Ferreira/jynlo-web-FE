import { Component, OnDestroy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommunityService } from '../services/community.service';
import { FriendSummary } from '../pages/model/friend-summary';
import { timeout } from 'rxjs';
import { CommonModule } from '@angular/common';
import { LocalParticipant, RemoteParticipant, Track } from 'livekit-client';
import { FormsModule } from '@angular/forms';
import { CallParticipantTileComponent } from './call-participant-tile.component';
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
  imports: [CommonModule, FormsModule, TranslatePipe, CallParticipantTileComponent],
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
                {{ call.peer.slice(0,1).toUpperCase() }}
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
              <button type="button" class="call-incoming-accept"
                (click)="calls.accept()">
                <span aria-hidden="true">{{ call.media === 'video' ? '▣' : '✓' }}</span>
                {{ 'calls.accept' | t }}
              </button>
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
                <app-call-participant-tile [participant]="person" [label]="participantLabel(person)"
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
            [attr.aria-label]="'calls.openChatKeepCall' | t">Chat</button>
          <button type="button" class="connect-mini-expand" (click)="minimized=false">{{ 'calls.expand' | t }}</button>
          <button type="button" class="connect-mini-hangup" (click)="calls.end()"
            [attr.aria-label]="'calls.hangUp' | t">✕</button>
        </div>
      } @else {
      <section class="call-backdrop" role="dialog" aria-modal="true"
          [attr.aria-label]="'calls.title' | t" (keydown.escape)="minimize()">
        <div class="call-panel" tabindex="-1">
          <header class="call-topline">
            <strong class="call-brand">Jynlo <span class="call-brand-dot">●</span>
              <span class="connect-brand-label">Connect</span></strong>
            <div class="connect-head-actions">
              <span class="call-kind">{{ (videoActive ? 'calls.video' : 'calls.voice') | t }}</span>
              @if (call.phase !== 'error') {
                <button type="button" class="connect-minimize" (click)="minimize()"
                  [attr.aria-label]="'calls.minimize' | t">−</button>
              }
            </div>
          </header>
          <div class="call-info">
            <div class="call-avatar" aria-hidden="true">{{ call.peer.slice(0,1).toUpperCase() }}</div>
            <div class="call-summary">
              <h2>{{ call.peer }}</h2>
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
          @if (call.phase !== 'error') {
            @if (call.phase === 'dialing' || (call.phase === 'connecting' && !call.startedAt)) {
              <div class="connect-waiting">
                <div class="connect-wait-avatar" aria-hidden="true">{{ call.peer.slice(0,1).toUpperCase() }}</div>
                <h3>{{ call.peer }}</h3>
                <p>{{ 'calls.waitingForAnswer' | t }}</p>
                <div class="connect-wait-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
              </div>
            } @else {
              <div class="connect-participants" [class.connect-participants--video]="videoActive"
                [class.connect-participants--presenting]="hasPresentation">
                @if (hasPresentation) {
                  <div class="connect-share-bar">
                    <span class="connect-share-live"><span aria-hidden="true">●</span>
                      {{ 'calls.liveShare' | t }}
                    </span>
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
                        <span aria-hidden="true">{{ presentationZoomed ? '↙' : '⤢' }}</span>
                        {{ (presentationZoomed ? 'calls.restoreSharedScreen' : 'calls.enlargeSharedScreen') | t }}
                      </button>
                    </div>
                  }
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
                  <div class="connect-camera-strip" [attr.aria-label]="'calls.callParticipants' | t">
                    @for (person of participants; track person.identity) {
                      <app-call-participant-tile [participant]="person"
                        [label]="participantLabel(person)" [local]="person === calls.room?.localParticipant"
                        [volume]="volumeFor(person.identity)"
                        [microphoneVolume]="volumeFor(person.identity)"
                        [screenShareVolume]="screenVolumeFor(person.identity)"
                        [audioOutputDeviceId]="(calls.selectedDevices$ | async)?.audiooutput">
                      </app-call-participant-tile>
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
                    <app-call-participant-tile [participant]="person"
                      [label]="participantLabel(person)" [local]="person === calls.room?.localParticipant"
                      [volume]="volumeFor(person.identity)"
                      [audioOutputDeviceId]="(calls.selectedDevices$ | async)?.audiooutput">
                    </app-call-participant-tile>
                  }
                }
              </div>
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
                  <span aria-hidden="true">{{ call.micEnabled ? '🎙' : '⊘' }}</span>
                  {{ (call.micEnabled ? 'calls.mute' : 'calls.unmute') | t }}
                </button>
                <button type="button" [disabled]="calls.busyMedia$ | async"
                    (click)="calls.setCamera(!call.cameraEnabled)"
                    [attr.aria-pressed]="!call.cameraEnabled" [class.call-off]="!call.cameraEnabled">
                    <span aria-hidden="true">▣</span>
                    {{ (call.cameraEnabled ? 'calls.cameraOff' : 'calls.cameraOn') | t }}
                  </button>
                @if (calls.canShareScreen) {
                  <button type="button" [disabled]="calls.busyMedia$ | async"
                    (click)="calls.setScreenShare(!calls.screenShareEnabled$.value)"
                    [attr.aria-pressed]="calls.screenShareEnabled$ | async">
                    <span aria-hidden="true">▧</span>
                    {{ ((calls.screenShareEnabled$ | async) ? 'calls.stopSharing' : 'calls.shareScreen') | t }}
                  </button>
                }
                @if (calls.screenShareFeedback$ | async; as screenFeedback) {
                  <p class="connect-screen-share-feedback" role="status">{{ screenFeedback | t }}</p>
                }
                @if (calls.canShareScreen && call.phase === 'active' && !(calls.screenShareEnabled$ | async)) {
                  <span class="connect-screen-share-tip">{{ 'calls.fullScreenShareHint' | t }}</span>
                }
                @if (calls.audioPlaybackBlocked$ | async) {
                  <button type="button" class="call-enable-sound" (click)="calls.allowAudio()">
                    {{ 'calls.sound' | t }}
                  </button>
                }
                @if (call.phase === 'active') {
                  <button type="button" class="connect-invite-button" [attr.aria-expanded]="inviteOpen"
                    (click)="toggleInvites()">
                    <span aria-hidden="true">＋</span> {{ 'calls.inviteMembers' | t }}
                  </button>
                }
                <button type="button" class="connect-chat-button"
                  (click)="openChat(call.peer)" [attr.aria-label]="'calls.openChatKeepCall' | t">
                  <span aria-hidden="true">▤</span> Chat
                </button>
                <button type="button" class="call-settings-button"
                  [attr.aria-expanded]="settingsOpen" (click)="toggleSettings();inviteOpen=false">
                  <span aria-hidden="true">⚙</span> {{ 'calls.settings' | t }}
                </button>
                <button type="button" class="call-decline" (click)="calls.end()">
                  <span aria-hidden="true">✕</span> {{ 'calls.hangUp' | t }}
                </button>
              }
            </div>
            @if (inviteOpen && call.phase === 'active') {
              <section class="connect-invite-panel" [attr.aria-label]="'calls.inviteMembers' | t">
                <h3>{{ 'calls.inviteMembers' | t }}</h3>
                <p>{{ 'calls.inviteHelp' | t }}</p>
                @if (contactsLoading) { <p role="status">A carregar contactos…</p> }
                @if (contactsError) { <p role="alert">Não foi possível carregar os contactos. Podes usar o nome de utilizador.</p> }
                @if (matchingContacts.length) {
                  <div class="connect-contact-results">
                    @for (contact of matchingContacts; track contact.username) {
                      <button type="button" class="connect-contact-option"
                        [disabled]="(calls.invitationBusy$ | async) ?? false"
                        (click)="inviteContact(contact.username)">
                        <span class="connect-contact-avatar">{{ contact.username.slice(0,1).toUpperCase() }}</span>
                        <span class="connect-contact-names"><strong>{{ contact.nickname || contact.fullName || contact.username }}</strong>
                        <small>&#64;{{ contact.username }}</small></span>
                        <span aria-hidden="true">＋</span>
                      </button>
                    }
                  </div>
                }
                <form class="connect-invite-form" (ngSubmit)="inviteMember()">
                  <label for="connect-invite-name">{{ 'calls.username' | t }}</label>
                  <input id="connect-invite-name" type="text" autocomplete="off"
                    name="inviteUsername" [ngModel]="inviteUsername" (ngModelChange)="inviteUsername=$event"
                    maxlength="128" [disabled]="(calls.invitationBusy$ | async) ?? false"
                    [placeholder]="'calls.username' | t">
                  <button type="submit" [disabled]="(calls.invitationBusy$ | async) ?? false">
                    {{ 'calls.sendInvite' | t }}
                  </button>
                </form>
                @if (calls.invitationError$ | async; as inviteError) {
                  <p class="connect-invite-error" role="alert">{{ inviteError | t }}</p>
                }
                @if (calls.members$ | async; as members) {
                  <div class="connect-member-list">
                    <strong>{{ 'calls.participants' | t }} ({{ members.participants.length }})</strong>
                    @for (person of members.participants; track person.identity) {
                      <label class="connect-member-item">
                        <span>● {{ person.username }}</span>
                        @if (person.identity !== calls.room?.localParticipant?.identity) {
                          <span class="connect-volume-label">{{ 'calls.volume' | t }} {{ volumeFor(person.identity) * 100 | number:'1.0-0' }}%</span>
                          <input type="range" min="0" max="100" step="5"
                            [ngModel]="volumeFor(person.identity) * 100"
                            (ngModelChange)="setVolume(person.identity,$event)"
                            [ngModelOptions]="{standalone:true}"
                            [attr.aria-label]="('calls.volume' | t) + ' ' + person.username">
                        }
                      </label>
                    }
                    @for (pending of members.pending; track pending) {
                      <span class="connect-member-pending">◷ {{ pending }} · {{ 'calls.invitePending' | t }}</span>
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
                    <span class="call-device-auto-refresh" role="status">A procurar dispositivos…</span>
                  } @else if ((calls.deviceScanStatus$ | async) === 'unavailable') {
                    <span class="call-device-auto-refresh" role="alert">O navegador não permite consultar os dispositivos.</span>
                  } @else {
                    <span class="call-device-auto-refresh">Dispositivos detetados automaticamente</span>
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
                    <p role="status">Não foram encontrados dispositivos. Confirma as permissões no navegador.</p>
                  }
                }
                <p>{{ 'calls.devicesHelp' | t }}</p>
              </div>
            }
          </footer>
          <span class="call-refresh" aria-hidden="true">{{ calls.mediaChanged$ | async }}</span>
        </div>
      </section>
      }
    }
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
      background: #275a58;
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
    .call-avatar{display:grid;place-items:center;flex:0 0 auto;width:50px;height:50px;
      border-radius:50%;background:#276b68;color:#e0fff8;font-size:1.25rem;font-weight:850}
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
      gap:6px 12px;margin-top:9px;padding:12px;max-height:34dvh;overflow-y:auto;
      background:#092635;border:1px solid #416b77;border-radius:12px}
    .call-settings-head{grid-column:1/-1}
    .call-settings-head strong{font-size:.84rem}
    .call-device-auto-refresh{font-size:.69rem;color:#aeeadf}
    .call-device-panel label{font-size:.76rem;color:#b6d7dc;align-self:end}
    .call-device-panel select{grid-row:3;min-width:0;width:100%;font:inherit;font-size:.78rem;
      background:#133748;color:#f4fffe;border:1px solid #547e8a;border-radius:9px;padding:9px}
    .call-device-panel p{grid-column:1/-1;color:#b1d2da;font-size:.71rem;margin:0}
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
      border:3px solid #4ee7bb;box-shadow:0 0 0 13px #49e7bd18;font-size:2.8rem;font-weight:850}
    .connect-waiting h3,.connect-waiting p{margin:0}.connect-waiting p{color:#a6d2d5;font-size:.82rem}
    .connect-wait-bars{display:flex;align-items:center;gap:5px;height:25px}
    .connect-wait-bars i{width:4px;height:9px;border-radius:9px;background:#56f2c5;animation:connect-wave 1s ease-in-out infinite alternate}
    .connect-wait-bars i:nth-child(2),.connect-wait-bars i:nth-child(4){animation-delay:.22s}.connect-wait-bars i:nth-child(3){animation-delay:.44s}
    @keyframes connect-wave{to{height:24px}}
    .connect-participants{flex:1;min-height:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));
      grid-auto-rows:minmax(150px,1fr);gap:12px;overflow:auto;padding:4px}
    .connect-participants:has(app-call-participant-tile:only-child){grid-template-columns:1fr}
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
    .connect-presentation-zoom-hit{position:absolute;top:12px;right:12px;display:flex;align-items:center;gap:7px;
      color:#eafff6;background:#0b2737db;border:1px solid #51998b;border-radius:11px;padding:9px 12px;
      font:inherit;font-size:.77rem;cursor:zoom-in;z-index:2;box-shadow:0 4px 16px #001a21a8}
    .connect-presentation-zoom-hit:hover{background:#1d5b5e}
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
    .connect-camera-strip app-call-participant-tile::ng-deep .connect-tile{min-height:0}
    .connect-camera-strip app-call-participant-tile::ng-deep .connect-avatar{width:54px;font-size:1.4rem}
    .connect-camera-strip app-call-participant-tile::ng-deep .connect-person{bottom:5px;left:5px;padding:4px 7px;font-size:.7rem}
    @media(max-width:600px){
      .connect-camera-strip{min-height:100px}
      .connect-camera-strip app-call-participant-tile{flex-basis:120px;height:100px;min-height:100px}
    }
    .connect-invite-panel{position:absolute;right:0;bottom:calc(100% + 8px);z-index:15;width:min(450px,100%);box-sizing:border-box;
      max-height:55dvh;overflow:auto;padding:17px;background:#0c2a39;border:1px solid #508d8a;border-radius:16px;box-shadow:0 14px 40px #0008}
    .connect-invite-panel h3{margin:0 0 7px;font-size:1rem}.connect-invite-panel p{font-size:.79rem;color:#bbd8d6;line-height:1.5}
    .connect-contact-results{display:grid;gap:6px;max-height:210px;overflow-y:auto;margin:10px 0}
    .connect-contact-option{display:flex;align-items:center;gap:10px;width:100%;min-width:0;padding:9px;border-radius:11px;background:#123b46;border:1px solid #36796f;color:#e6fff8;text-align:left;cursor:pointer}
    .connect-contact-option:hover{background:#1b5656;border-color:#54daba}
    .connect-contact-option:disabled{opacity:.5}
    .connect-contact-avatar{display:grid;place-items:center;width:36px;height:36px;flex:0 0 36px;border-radius:50%;background:#286b68;font-weight:800}
    .connect-contact-names{display:grid;min-width:0;flex:1}
    .connect-contact-names strong,.connect-contact-names small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .connect-contact-names small{color:#a5d7cf}
    .connect-invite-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
    .connect-invite-form label{grid-column:1/-1;font-size:.76rem}.connect-invite-form input{min-width:0;width:100%;box-sizing:border-box;
      border:1px solid #54958f;background:#0d2631;color:#effffb;border-radius:10px;padding:11px;font:inherit}
    .connect-invite-form button{padding:10px 16px;border-radius:10px;background:#43e6bd;color:#062f36;border:0;font-weight:850;cursor:pointer}
    .connect-invite-form button:disabled{opacity:.6}.connect-invite-error{color:#ffd0cd!important}
    .connect-member-list{display:flex;flex-wrap:wrap;gap:7px;border-top:1px solid #416a70;margin-top:14px;padding-top:12px}
    .connect-member-list strong{width:100%;font-size:.78rem}
    .connect-member-item,.connect-member-pending{padding:6px 10px;border-radius:99px;border:1px solid #397f77;color:#b4ffe8;font-size:.74rem}
    .connect-member-pending{border-color:#827757;color:#f5ddb0}
    .connect-member-item{display:flex;flex-direction:column;align-items:flex-start;gap:5px}
    .connect-member-item input{width:118px;accent-color:#45dfb9}
    .connect-volume-label{font-size:.67rem;color:#a9d5d5}
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
  private readonly mediaSubscription: Subscription;
  settingsOpen = false;
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

  get videoActive(): boolean {
    return this.participants.some(p=>[...p.videoTrackPublications.values()]
      .some(pub=>!!pub.track && !pub.isMuted));
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
    const query = this.inviteUsername.trim().toLowerCase();
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
    const target=this.inviteUsername.trim();
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

  constructor(public readonly calls: DirectCallClientService, private readonly community: CommunityService) {
    this.elapsed$ = combineLatest([this.calls.state$,timer(0,1000)]).pipe(map(([call]) => {
    if (!call?.startedAt) return '00:00';
    const seconds=Math.max(0,Math.floor((Date.now()-call.startedAt)/1000));
    const hours=Math.floor(seconds/3600);
    return hours ? [hours,Math.floor(seconds/60)%60,seconds%60].map(x=>String(x).padStart(2,'0')).join(':')
      : [Math.floor(seconds/60),seconds%60].map(x=>String(x).padStart(2,'0')).join(':');
  }));

    this.mediaSubscription = calls.state$.subscribe(call=>{
      if (!call) {
        this.settingsOpen=false;
        this.inviteOpen=false;
        this.minimized=false;
        this.inviteUsername='';
        this.contacts=[];
        this.contactsRequested=false;
        this.volumes={};
      }
    });
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
  }
}
