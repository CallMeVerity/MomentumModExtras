export interface PagedResponse<T> {
  totalCount: number;
  returnCount: number;
  data: T[];
}

export interface MapImage {
  id: string;
  small: string;
  medium: string;
  large: string;
  xl: string;
}

export interface MapSummary {
  id: number;
  name: string;
  status: number;
  submitterID: number;
  images: MapImage[];
  thumbnail?: MapImage;
  currentVersionID: string;
  createdAt: string;
  updatedAt: string;
}

export interface PastRun {
  id: number;
  gamemode: number;
  trackType: number;
  trackNum: number;
  style: number;
  time: number;
  flags: number[];
  isPB: boolean;
  userID: number;
  mapID: number;
  createdAt: string;
  map?: MapSummary;
}

export interface LeaderboardRunRank {
  rank: number;
  time: number;
  pastRunID: string;
}

export interface RankedRun extends PastRun {
  rank: number | null | undefined;
}

export const MapCreditType = {
  Author: 0,
  Contributor: 1,
  Tester: 2,
  SpecialThanks: 3,
} as const;

export type MapCreditType = (typeof MapCreditType)[keyof typeof MapCreditType];

export interface MapCredit {
  type: MapCreditType;
  description?: string;
  userID: number;
  mapID: number;
  map?: MapSummary;
}