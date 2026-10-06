// Typed adapter; canonical normalization and catalog policy live in shared/.
const musicConfig = require("../../shared/musicConfig.cjs");
const musicCatalog = require("../../shared/musicCatalog.cjs");
const { readRenderEnvironment } = require("../../shared/firebaseEnvironment.cjs");

export type MusicConfig = {
  version: 1;
  enabled: boolean;
  track: { source: "catalog" | "user"; id: string } | null;
  volume: number;
  loop: boolean;
};
export type MusicResource = {
  source: "catalog";
  id: string;
  url: string;
  title: string;
  artist: string;
};

export function normalizeMusicConfig(value: unknown): MusicConfig {
  return musicConfig.normalizeMusicConfig(value) as MusicConfig;
}

export function resolveMusicResource(value: unknown): MusicResource | null {
  return musicCatalog.resolveMusicResource(value, {
    publicBaseUrl: readRenderEnvironment().publicBaseUrl,
  }) as MusicResource | null;
}
