export type TelemetryTone = 'default' | 'signal' | 'warning' | 'muted';
export type TelemetryPriority = 'essential' | 'secondary' | 'optional';

/** One named reading in the persistent travel instrument panel. */
export interface TelemetryField {
  id: string;
  label: string;
  compactLabel?: string;
  value: string;
  compactValue?: string;
  tone?: TelemetryTone;
  priority?: TelemetryPriority;
}

/** Structured readings for the responsive travel instrument panel. */
export interface TravelTelemetryModel {
  mode: string;
  navigation: readonly TelemetryField[];
  target: readonly TelemetryField[];
  environment: readonly TelemetryField[];
  resources: readonly TelemetryField[];
  notification?: string;
  notificationTone?: TelemetryTone;
}
