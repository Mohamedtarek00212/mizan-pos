export interface RegisterRow {
  id: number;
  code: string;
  display_name: string;
  is_active: boolean;
}

export interface RegisterWithStatus extends RegisterRow {
  current_session_status: 'OPEN' | 'CLOSED';
}
