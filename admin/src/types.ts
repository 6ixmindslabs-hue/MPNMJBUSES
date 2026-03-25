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
  created_at?: string;
}

export interface Stop {
  id?: string;
  route_id: string;
  stop_name: string;
  latitude: number;
  longitude: number;
  arrival_time: string;
  schedule_type?: 'daily';
  created_at?: string;
}

export interface Schedule {
  id?: string;
  route_id: string;
  bus_id: string;
  driver_id: string;
  schedule_type?: 'daily';
  start_time: string;
  end_time: string;
  created_at?: string;
}
