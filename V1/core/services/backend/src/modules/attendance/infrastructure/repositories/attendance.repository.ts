// @ts-nocheck
import { Repository } from 'typeorm';
import { Attendance } from '../../domain/entities/attendance.entity';
import { IAttendanceRepository } from '../../domain/interfaces/attendance-repository.interface';
import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { UUID, AttendanceState, VehicleBrand } from '../../../../shared/types/common.types';
import { NotFoundException } from '../../../../shared/domain/exceptions/domain-exception';

export class AttendanceRepository implements IAttendanceRepository {
  private repository: Repository<Attendance>;

  constructor() {
    this.repository = AppDataSource.getRepository(Attendance);
  }

  async findById(id: UUID): Promise<Attendance | null> {
    return await this.repository.findOne({
      where: { id },
      relations: ['seller', 'supervisor'],
    });
  }

  async findByClientPhone(phone: string, state?: AttendanceState): Promise<Attendance[]> {
    const where: any = { clientPhone: phone };
    if (state) {
      where.state = state;
    }
    return await this.repository.find({ where, relations: ['seller', 'supervisor'] });
  }

  async findOpenByClientPhone(phone: string): Promise<Attendance | null> {
    return await this.repository.findOne({
      where: {
        clientPhone: phone,
        state: AttendanceState.OPEN,
      },
      relations: ['seller', 'supervisor'],
    });
  }

  async findBySellerId(sellerId: UUID, state?: AttendanceState): Promise<Attendance[]> {
    const where: any = { sellerId };
    if (state) {
      where.state = state;
    }
    return await this.repository.find({
      where,
      relations: ['seller', 'supervisor'],
      order: { createdAt: 'DESC' },
    });
  }

  async findBySupervisorId(supervisorId: UUID, state?: AttendanceState): Promise<Attendance[]> {
    const where: any = { supervisorId };
    if (state) {
      where.state = state;
    }
    return await this.repository.find({
      where,
      relations: ['seller', 'supervisor'],
      order: { createdAt: 'DESC' },
    });
  }

  async findVisibleToSupervisor(supervisorId: UUID, state?: AttendanceState): Promise<Attendance[]> {
    const qb = this.repository
      .createQueryBuilder('attendance')
      .leftJoinAndSelect('attendance.seller', 'seller')
      .leftJoinAndSelect('attendance.supervisor', 'supervisor')
      .where('attendance.supervisor_id = :supervisorId', { supervisorId })
      .orWhere(
        'attendance.seller_id IN (SELECT seller_id FROM seller_supervisors WHERE supervisor_id = :supervisorId)',
        { supervisorId }
      )
      .orderBy('attendance.updatedAt', 'DESC');
    if (state) {
      qb.andWhere('attendance.state = :state', { state });
    }
    return await qb.getMany();
  }

  async findByBrand(brand: VehicleBrand, state?: AttendanceState): Promise<Attendance[]> {
    const where: any = { vehicleBrand: brand };
    if (state) {
      where.state = state;
    }
    return await this.repository.find({
      where,
      relations: ['seller', 'supervisor'],
      order: { createdAt: 'DESC' },
    });
  }

  async findUnassigned(brand?: VehicleBrand): Promise<Attendance[]> {
    const where: any = {
      sellerId: null,
      state: AttendanceState.OPEN,
    };
    
    if (brand) {
      where.vehicleBrand = brand;
    }

    return await this.repository.find({
      where,
      order: { createdAt: 'ASC' },
    });
  }

  async create(data: Partial<Attendance>): Promise<Attendance> {
    const attendance = this.repository.create(data);
    return await this.repository.save(attendance);
  }

  async update(id: UUID, data: Partial<Attendance>): Promise<Attendance> {
    const attendance = await this.findById(id);
    
    if (!attendance) {
      throw new NotFoundException(`Attendance with id ${id} not found`);
    }

    Object.assign(attendance, data);
    return await this.repository.save(attendance);
  }

  async delete(id: UUID): Promise<void> {
    const result = await this.repository.delete(id);
    
    if (result.affected === 0) {
      throw new NotFoundException(`Attendance with id ${id} not found`);
    }
  }

  async count(filters?: Partial<Attendance>): Promise<number> {
    return await this.repository.count({ where: filters });
  }
}
