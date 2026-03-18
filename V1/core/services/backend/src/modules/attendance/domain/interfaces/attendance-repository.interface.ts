import { Attendance } from '../entities/attendance.entity';
import { UUID, AttendanceState, VehicleBrand } from '../../../../shared/types/common.types';

export interface IAttendanceRepository {
  findById(id: UUID): Promise<Attendance | null>;
  findByClientPhone(phone: string, state?: AttendanceState): Promise<Attendance[]>;
  findOpenByClientPhone(phone: string): Promise<Attendance | null>;
  findBySellerId(sellerId: UUID, state?: AttendanceState): Promise<Attendance[]>;
  findBySupervisorId(supervisorId: UUID, state?: AttendanceState): Promise<Attendance[]>;
  /** Atendimentos visíveis ao supervisor: supervisor_id = id OU vendedor vinculado em seller_supervisors */
  findVisibleToSupervisor(supervisorId: UUID, state?: AttendanceState): Promise<Attendance[]>;
  findByBrand(brand: VehicleBrand, state?: AttendanceState): Promise<Attendance[]>;
  findUnassigned(brand?: VehicleBrand): Promise<Attendance[]>;
  create(data: Partial<Attendance>): Promise<Attendance>;
  update(id: UUID, data: Partial<Attendance>): Promise<Attendance>;
  delete(id: UUID): Promise<void>;
  count(filters?: Partial<Attendance>): Promise<number>;
}
