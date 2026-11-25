/** Virtual backgrounds offered in calls (sport scenes plus calm options). */
export interface CallBackgroundImage { id: string; label: string; file: string; }

export const CALL_BACKGROUND_IMAGES: readonly CallBackgroundImage[] = [
  { id: 'jynlo', label: 'Jynlo Connect', file: 'assets/jynlo-connect-background.svg' },
  { id: 'jynlo-suave', label: 'Jynlo suave', file: 'assets/call-backgrounds/jynlo-suave.svg' },
  { id: 'estadio', label: 'Estádio', file: 'assets/call-backgrounds/estadio.svg' },
  { id: 'relvado', label: 'Relvado', file: 'assets/call-backgrounds/relvado.svg' },
  { id: 'padel', label: 'Padel', file: 'assets/call-backgrounds/padel.svg' },
  { id: 'terra-batida', label: 'Terra batida', file: 'assets/call-backgrounds/terra-batida.svg' },
  { id: 'pavilhao', label: 'Pavilhão', file: 'assets/call-backgrounds/pavilhao.svg' },
  { id: 'pista', label: 'Pista', file: 'assets/call-backgrounds/pista.svg' },
  { id: 'balneario', label: 'Balneário', file: 'assets/call-backgrounds/balneario.svg' },
  { id: 'praia', label: 'Praia', file: 'assets/call-backgrounds/praia.svg' },
  { id: 'montanha', label: 'Montanha', file: 'assets/call-backgrounds/montanha.svg' },
  { id: 'sala', label: 'Sala', file: 'assets/call-backgrounds/sala.svg' },
];

export function callBackgroundImage(id: string): CallBackgroundImage | undefined {
  return CALL_BACKGROUND_IMAGES.find(item => item.id === id);
}
export function isCallBackground(value: unknown): boolean {
  return value === 'none' || value === 'blur' || (typeof value === 'string' && !!callBackgroundImage(value));
}
