import { NebulaColourRequest, NebulaColourSample, NebulaColourSampler } from './nebula_colour_sampler';

export interface NebulaColourProvider {
  getBackgroundColor(worldX: number, worldY: number): string;
  getBackgroundColorsAsync(requests: readonly NebulaColourRequest[]): Promise<NebulaColourSample[]>;
  clearCache(): void;
}

export class LocalNebulaColourProvider implements NebulaColourProvider {
  private readonly sampler = new NebulaColourSampler();

  /** Returns background color. */
  getBackgroundColor(worldX: number, worldY: number): string {
    return this.sampler.sample(worldX, worldY);
  }

  /** Returns background colors async. */
  getBackgroundColorsAsync(requests: readonly NebulaColourRequest[]): Promise<NebulaColourSample[]> {
    return Promise.resolve().then(() =>
      requests.map(({ worldX, worldY }) => ({
        worldX,
        worldY,
        colour: this.getBackgroundColor(worldX, worldY),
      }))
    );
  }

  /** Clears cache. */
  clearCache(): void {
    this.sampler.clearCache();
  }
}

let nebulaColourProvider: NebulaColourProvider = new LocalNebulaColourProvider();

/** Updates nebula colour provider. */
export function setNebulaColourProvider(provider: NebulaColourProvider): void {
  nebulaColourProvider = provider;
}

/** Returns nebula colour provider. */
export function getNebulaColourProvider(): NebulaColourProvider {
  return nebulaColourProvider;
}
