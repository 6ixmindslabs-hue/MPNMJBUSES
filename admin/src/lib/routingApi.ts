import { TRACKING_API_URL } from './supabase';

export interface RebuildRouteGeometryResult {
  ok: boolean;
  pendingStops?: boolean;
  message?: string;
  updated_paths?: string[];
  cleared_paths?: string[];
}

export async function rebuildRouteGeometry(
  routeId: string
): Promise<RebuildRouteGeometryResult> {
  const url = new URL(`${TRACKING_API_URL}/routes/${routeId}/rebuild-geometry`);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (response.ok) {
    return {
      ok: true,
      updated_paths: payload.updated_paths || payload.updated_shifts || [],
      cleared_paths: payload.cleared_paths || payload.cleared_shifts || [],
    };
  }

  const message = payload.error || 'Could not rebuild route geometry';
  if (response.status === 400 && message.includes('At least two ordered stops')) {
    return {
      ok: false,
      pendingStops: true,
      message: 'Add at least 2 ordered stops to generate road geometry.',
    };
  }

  throw new Error(message);
}
