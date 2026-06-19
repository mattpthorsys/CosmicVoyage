export type CommandBarButtonTone = 'normal' | 'green' | 'red' | 'muted';

export interface CommandBarButton {
  id: string;
  label: string;
  action: string;
  key?: string;
  tone?: CommandBarButtonTone;
  enabled?: boolean;
  detail?: string;
}

export interface CommandBarModel {
  context: string;
  targetName?: string;
  primaryButtonId?: string;
  selectedButtonId?: string;
  leftButtons?: CommandBarButton[];
  buttons: CommandBarButton[];
  rightButtons?: CommandBarButton[];
}

/** Creates a command-bar button model for one gameplay action. */
export function commandButton(
  id: string,
  label: string,
  action: string,
  options: Partial<Omit<CommandBarButton, 'id' | 'label' | 'action'>> = {}
): CommandBarButton {
  return {
    id,
    label,
    action,
    enabled: true,
    tone: 'normal',
    ...options,
  };
}
