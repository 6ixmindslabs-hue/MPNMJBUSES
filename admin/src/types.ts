export interface Driver {
  id?: string;
  name: string;
  phone?: string;
  license_number?: string;
  username: string;
  password?: string;
  status: 'active' | 'inactive';
  created_at?: string;
}

export interface Bus {
  id?: string;
  bus_number: string;
  bus_name: string;
  capacity: number;
  gps_device_id?: string;
  status: 'active' | 'inactive' | 'maintenance';
  created_at?: string;
}

export interface Route {
  id?: string;
  route_name: string;
  route_code: string;
  start_location: string;
  end_location: string;
  name?: string;
  description?: string;
  polyline?: Array<[number, number]> | string | null;
  geometry?: {
    provider?: string;
    profile?: string;
    updated_at?: string;
    paths?: Record<
      string,
      {
        polyline?: string | null;
        coordinates?: Array<[number, number]> | null;
      }
    > | null;
  } | null;
  created_at?: string;
}

export interface Stop {
  id?: string;
  route_id: string;
  stop_name: string;
  latitude: number;
  longitude: number;
  arrival_time: string;
  trip_direction?: 'outbound' | 'return';
  schedule_type?: 'daily';
  created_at?: string;
}

export interface Schedule {
  id?: string;
  route_id: string;
  bus_id: string;
  driver_id: string;
  schedule_type?: 'daily';
  start_time?: string;
  end_time?: string;
  outbound_start_time: string;
  outbound_end_time: string;
  return_start_time: string;
  return_end_time: string;
  created_at?: string;
}
