export type UUID = string;

export enum UserRole {
  SELLER = 'SELLER',
  SUPERVISOR = 'SUPERVISOR',
  ADMIN_GENERAL = 'ADMIN_GENERAL',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum AttendanceState {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  FINISHED = 'FINISHED',
}

export enum AttendanceType {
  AI = 'AI',
  HUMAN = 'HUMAN',
}

export enum VehicleBrand {
  FORD = 'FORD',
  GM = 'GM',
  VW = 'VW',
  FIAT = 'FIAT',
  IMPORTADOS = 'IMPORTADOS',
}

export enum MessageOrigin {
  CLIENT = 'CLIENT',
  SYSTEM = 'SYSTEM',
  SELLER = 'SELLER',
  AI = 'AI',
}

export interface User {
  id: UUID;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

export interface Attendance {
  id: UUID;
  clientPhone: string;
  state: AttendanceState;
  handledBy: AttendanceType;
  vehicleBrand?: VehicleBrand;
  sellerId?: UUID;
  supervisorId?: UUID;
  activeSellerId?: UUID;
  createdAt: string;
  routedAt?: string;
  finalizedAt?: string;
}

export interface Message {
  id: UUID;
  attendanceId: UUID;
  origin: MessageOrigin;
  content: string;
  sentAt: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: any;
  timestamp: string;
}
