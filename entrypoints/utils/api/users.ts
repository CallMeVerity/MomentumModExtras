import type { PagedResponse } from '../types';
import { fetchLimited } from './http';

export interface UserSummary {
  id: number;
  steamID: string;
  alias: string;
  avatarURL: string;
}

const STEAM_ID = /^\d{17}$/;

export async function searchUsers(query: string, signal?: AbortSignal): Promise<UserSummary[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = STEAM_ID.test(trimmed)
    ? { steamID: trimmed, take: 1 }
    : { search: trimmed, take: 8 };

  const page = await fetchLimited<PagedResponse<UserSummary>>('/users', params, signal);
  return page.data;
}
