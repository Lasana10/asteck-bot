export interface Tontine {
  id: string;
  name: string;
  contribution_amount: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  total_pot: number;
  next_payout_date: string;
  status: 'active' | 'completed';
}

export interface TontineMember {
  id: string;
  tontine_id: string;
  user_id: string;
  payout_order: number;
  has_received_payout: boolean;
  total_contributed: number;
}

export interface Anomaly {
  id?: string;
  type: 'traffic_jam' | 'overspeeding' | 'cluster';
  latitude: number;
  longitude: number;
  intensity: number;
  description: string;
  createdAt: string;
}
